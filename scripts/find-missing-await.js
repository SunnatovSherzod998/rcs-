'use strict';
/**
 * Topadi: async funksiyani await'siz chaqirish.
 * Faqat tanasida haqiqatan `await` bor funksiyalar hisobga olinadi.
 */
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '..', 'src');

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
    if (c === '"' || c === "'" || c === '`') { i = src.indexOf(c, i + 1); if (i < 0) return -1; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

let total = 0;
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');

  // async funksiyalar + ularning tanasi
  const real = new Set();
  const rx = /\b(?:async\s+function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*async\b)/g;
  let m;
  while ((m = rx.exec(src))) {
    const name = m[1] || m[2];
    const brace = src.indexOf('{', rx.lastIndex);
    if (brace < 0) continue;
    const end = matchBrace(src, brace);
    if (end < 0) continue;
    if (/\bawait\b/.test(src.slice(brace, end + 1))) real.add(name);
  }
  if (!real.size) continue;

  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if (/^\s*(\/\/|\*)/.test(ln)) return;
    for (const fn of real) {
      const callRx = new RegExp(`(?<![\\w.$])(?<!await\\s)${fn}\\s*\\(`);
      if (!callRx.test(ln)) continue;
      if (new RegExp(`await\\s+${fn}\\s*\\(`).test(ln)) continue;
      if (new RegExp(`(?:async\\s+function\\s+${fn}\\s*\\(|(?:const|let|var)\\s+${fn}\\s*=)`).test(ln)) continue;
      console.log(`${path.relative(SRC, file)}:${i + 1}  ${fn}()  |  ${ln.trim().slice(0, 86)}`);
      total++;
    }
  });
}
console.log(`\nJami: ${total}`);