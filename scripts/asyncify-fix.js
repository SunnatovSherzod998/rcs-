'use strict';
/** Codemod qoldiqlarini tuzatadi (qo'lda bilan tekshirilgan holatlar). */
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

// 1) `(await get(...).x`  ->  `(await get(...)).x`   (chuqurroq qavs bilan)
function fixDeepParen(src) {
  let out = src;
  for (let pass = 0; pass < 8; pass++) {
    const next = out.replace(
      /\(await\s+(all|get|run)\s*\(/g,
      (m, fn, off) => {
        const open = off + m.length - 1;
        let depth = 0; let i = open;
        for (; i < out.length; i++) {
          const c = out[i];
          if (c === '(') depth++;
          else if (c === ')') { depth--; if (depth === 0) break; }
        }
        if (i >= out.length) return m;
        // `)` dan keyin `.prop` bormi?
        const after = out.slice(i + 1).match(/^\s*\.\s*(\w+)/);
        if (!after) return m;
        return `(await ${fn}(`;
      }
    );
    // endi ichidagi ')' ni topamiz va qo'shimcha ')' qo'shamiz
    let result = '';
    let i = 0;
    const rx = /\(await\s+(all|get|run)\s*\(/g;
    let last = 0; let m;
    while ((m = rx.exec(out))) {
      const open = m.index + m[0].length - 1;
      let depth = 0; let j = open;
      for (; j < out.length; j++) {
        const c = out[j];
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
      }
      if (j >= out.length) break;
      const after = out.slice(j + 1).match(/^\s*\.\s*(\w+)/);
      if (!after) continue;
      result += out.slice(last, j + 1) + ')';
      last = j + 1;
      rx.lastIndex = j + 1;
    }
    result += out.slice(last);
    if (result === out) break;
    out = result;
  }
  return out;
}

// 2) `function NAME(` -> `async function NAME(`  (tanasida await bor)
function addAsyncToFn(src) {
  const rx = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let out = src; const edits = [];
  let m;
  while ((m = rx.exec(src))) {
    const name = m[1];
    const brace = src.indexOf('{', rx.lastIndex);
    if (brace < 0) continue;
    let depth = 0, end = -1;
    for (let i = brace; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    if (!/\bawait\b/.test(src.slice(brace, end + 1))) continue;
    if (/\basync\s+function\s/.test(src.slice(Math.max(0, m.index - 8), m.index + 20))) continue;
    edits.push({ at: m.index, ins: 'async ' });
  }
  edits.sort((a, b) => b.at - a.at);
  for (const e of edits) out = out.slice(0, e.at) + e.ins + out.slice(e.at);
  return out;
}

// 3) `Router.get(` kabi methodlarni tiklash
function fixRouterMethods(src) {
  return src.replace(/\bawait\s+(get|post|put|del)\s*\(([a-z]),\s*([a-z]),\s*([a-z])\)\s*\{/g, '$1($2, $3, $4) {');
}

let total = 0;
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  let out = fixRouterMethods(src);
  out = fixDeepParen(out);
  out = addAsyncToFn(out);
  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    console.log(`OK  ${path.relative(SRC, file)}`);
    total++;
  }
}

let bad = 0;
for (const file of walk(SRC)) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    const ln = (msg.split('\n').find((l) => l.trim().startsWith('await') || l.includes('SyntaxError')) || '').trim();
    console.log(`XATO ${path.relative(SRC, file)}${m ? ':' + m[1] : ''}  ${ln.slice(0, 78)}`);
  }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad}`);