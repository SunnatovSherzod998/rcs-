'use strict';
/**
 * Yakuniy tuzatuvchi: async funksiyalarni chaqirishda `await` qo'shadi.
 * Faqat tanasida `await` bor funksiyalar hisobga olinadi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src');
const NODE = process.execPath;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function matchBrace(src, from) {
  let i = from, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      if (c === '`') { i = src.indexOf('`', i + 1); if (i < 0) return -1; continue; }
      i = src.indexOf(c, i + 1); if (i < 0) return -1; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** async funksiyalar: nom + tana ichida await bormi */
function findAsyncFns(src) {
  const map = new Map();
  const rx = /\b(?:async\s+function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b)/g;
  let m;
  while ((m = rx.exec(src))) {
    const name = m[1] || m[2];
    const brace = src.indexOf('{', rx.lastIndex);
    if (brace < 0) continue;
    const end = matchBrace(src, brace);
    if (end < 0) continue;
    const body = src.slice(brace, end + 1);
    if (/\bawait\b/.test(body)) map.set(name, true);
  }
  return map;
}

let total = 0;
for (let pass = 1; pass <= 8; pass++) {
  let changed = 0;
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    const fns = findAsyncFns(src);
    if (!fns.size) continue;

    const edits = [];
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      if (/^\s*(\/\/|\*)/.test(ln)) return;
      for (const fn of fns.keys()) {
        const callRx = new RegExp(`(?<![\\w.$])(?<!await\\s)(?<!function\\s)${fn}\\s*\\(`);
        if (!callRx.test(ln)) continue;
        if (new RegExp(`await\\s+${fn}\\s*\\(`).test(ln)) continue;
        if (new RegExp(`(?:async\\s+function\\s+${fn}\\s*\\(|(?:const|let|var)\\s+${fn}\\s*=)`).test(ln)) continue;

        // qator ichida boshqa await bor bo'lsa, ehtiyot
        const pos = ln.search(callRx);
        edits.push({ line: i, col: pos, fn });
        break;
      }
    });

    if (!edits.length) continue;

    // har bir qatorga faqat 1 ta await (birinchi topilgan)
    const byLine = new Map();
    for (const e of edits) if (!byLine.has(e.line)) byLine.set(e.line, e);

    const out = lines.slice();
    for (const [ln, e] of byLine) {
      const text = out[ln];
      const pos = text.search(new RegExp(`(?<![\\w.$])(?<!await\\s)${e.fn}\\s*\\(`));
      if (pos < 0) continue;
      out[ln] = text.slice(0, pos) + 'await ' + text.slice(pos);
      changed++;
      total++;
      console.log(`${path.relative(SRC, file)}:${ln + 1}  await ${e.fn}()`);
    }
    fs.writeFileSync(file, out.join('\n'), 'utf8');
  }
  if (!changed) break;
}

// route handler'lar async bo'lishi kerak
let handlerFix = 0;
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const next = src.replace(/(router\.(?:get|post|put|del)\([^,]+,\s*)\(/g, '$1async (');
  if (next !== src) {
    const n = (src.match(/router\.(?:get|post|put|del)\([^,]+,\s*\(/g) || []).length;
    fs.writeFileSync(file, next, 'utf8');
    console.log(`route-async ${path.relative(SRC, file)} (+${n})`);
    handlerFix += n;
  }
}

console.log(`\nawait qo'shildi: ${total}, route handler async: ${handlerFix}`);

// Tekshiruv
let bad = 0;
for (const file of walk(SRC)) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    console.log(`XATO ${path.relative(SRC, file)}${m ? ':' + m[1] : ''}`);
  }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad}`);