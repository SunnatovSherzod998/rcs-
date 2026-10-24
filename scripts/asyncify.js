'use strict';
/**
 * CRS — async konvertatsiya codemod (bitta, to'g'ri ishlaydigan).
 *
 * 1) DB yordamchilariga `await`: all/get/run/tx/audit/nextNumber/setSetting/getSetting/execRaw
 * 2) `await` kerak bo'lgan funksiyalarga `async`
 * 3) `await fn(...).prop`  ->  `(await fn(...)).prop`
 * 4) route handler'larga `async`
 * 5) `tx(() => {`  ->  `tx(async () => {`
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src');
const NODE = process.execPath;

const DB_FNS = ['all', 'get', 'run', 'tx', 'audit', 'nextNumber', 'setSetting', 'getSetting', 'execRaw'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function skipString(src, i) {
  const q = src[i]; i++;
  while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) return i; i++; }
  return i;
}
function matchBrace(src, from) {
  let i = from, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i); if (i < 0) return -1; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function matchParen(src, from) {
  let i = from, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i); if (i < 0) return -1; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// ------------------------------------------------------------ 1) await qo'shish
function addAwait(src) {
  let out = src;
  let n = 0;
  for (const fn of DB_FNS) {
    const rx = new RegExp(`(?<![\\w.$])(?<!await\\s)(?<!function\\s)${fn}\\s*\\(`, 'g');
    out = out.replace(rx, (m, off, str) => {
      // allaqachon await bilan boshlanmagan qatorlarda
      const lineStart = str.lastIndexOf('\n', off) + 1;
      const prefix = str.slice(lineStart, off);
      if (/await\s*$/.test(prefix)) return m;
      n++;
      return `await ${fn}(`;
    });
  }
  return [out, n];
}

// ------------------------------------------------------------ 2) async qo'shish
function addAsync(src) {
  const edits = [];

  // function NAME(...) {
  const fnRx = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = fnRx.exec(src))) {
    const brace = src.indexOf('{', fnRx.lastIndex);
    if (brace < 0) continue;
    const end = matchBrace(src, brace);
    if (end < 0) continue;
    if (!/\bawait\b/.test(src.slice(brace, end + 1))) continue;
    const before = src.slice(Math.max(0, m.index - 8), m.index);
    if (/\basync\s+$/.test(before)) continue;
    edits.push({ at: m.index, ins: 'async ' });
  }

  // arrow: (args) => {   /   name => {
  const arrowRx = /(^|[\s(,=;:{\[])(?!async\s)((?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{)/g;
  while ((m = arrowRx.exec(src))) {
    const args = m[2];
    const braceAt = m.index + m[1].length + m[2].length - 1;
    const end = matchBrace(src, braceAt);
    if (end < 0) continue;
    if (!/\bawait\b/.test(src.slice(braceAt, end + 1))) continue;
    const argStart = m.index + m[1].length;
    const before = src.slice(Math.max(0, argStart - 8), argStart);
    if (/\basync\s+$/.test(before)) continue;
    edits.push({ at: argStart, ins: 'async ' });
  }

  edits.sort((a, b) => b.at - a.at);
  let out = src;
  for (const e of edits) out = out.slice(0, e.at) + e.ins + out.slice(e.at);
  return [out, edits.length];
}

// ------------------------------------------------------------ 3) qavsni to'g'rilash
function fixParens(src) {
  let out = src;
  for (let pass = 0; pass < 6; pass++) {
    const next = out.replace(
      /\bawait\s+(all|get|run)\s*\(/g,
      (m, fn, off) => {
        const open = off + m.length - 1;
        const close = matchParen(out, open);
        if (close < 0) return m;
        if (out[close + 1] !== '.' && out[close + 1] !== '[') return m;
        return `(await ${fn}(`;
      }
    ).replace(/(\(await\s+(?:all|get|run)\s*\([^()]*\))\s*\.\s*(\w+)/g, '$1).$2');
    if (next === out) break;
    out = next;
  }
  return out;
}

// ------------------------------------------------------------ 4/5) route + tx
function fixRoutes(src) {
  return src.replace(/(router\.(?:get|post|put|del)\([^,]+,\s*)(?!\basync\b)/g, '$1async (');
}
function fixTx(src) {
  return src.replace(/\btx\s*\(\s*(?!\basync\b)\(\s*\)\s*=>/g, 'tx(async () =>');
}

let totalAwait = 0, totalAsync = 0;
const files = walk(SRC);
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;

  let [s1, a] = addAwait(out); out = s1; totalAwait += a;
  let [s2, b] = addAsync(out); out = s2; totalAsync += b;
  out = fixParens(out);
  out = fixRoutes(out);
  out = fixTx(out);

  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    console.log(`${path.relative(SRC, file).padEnd(26)} await +${a}  async +${b}`);
  }
}
console.log(`\nJAMI: await +${totalAwait}, async +${totalAsync}`);

// Tekshiruv
let bad = 0;
for (const file of files) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    const ln = (msg.split('\n').find((l) => l.trim().startsWith('await') || l.includes('SyntaxError')) || '').trim();
    console.log(`XATO ${path.relative(SRC, file)}${m ? ':' + m[1] : ''}  ${ln.slice(0, 80)}`);
  }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad} faylda`);