'use strict';
/**
 * Codemod 2: `await` ishlatgan funksiyalarga `async` qo'shadi.
 * Ishlatish: node scripts/codemod-async2.js
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const FILES = [
  'api/catalogs.js', 'api/documents.js', 'api/plan.js', 'api/registers.js',
  'api/reports.js', 'api/system.js', 'api/warehouse.js',
  'services/salary.js', 'services/stock.js', 'lib/http.js',
];

/** i pozitsiyasidan boshlab '{' ... '}' juftligini topadi */
function matchBrace(src, from) {
  let i = from, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
      if (i >= src.length) return -1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return -1; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function skipString(src, i) {
  const q = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === q) return i;
    i++;
  }
  return i;
}

let total = 0;
for (const rel of FILES) {
  const file = path.join(SRC, rel);
  let src = fs.readFileSync(file, 'utf8');
  const edits = [];

  // 1) function NAME(...) { }
  const fnRx = /\bfunction\s+(\w+)\s*\(/g;
  let m;
  while ((m = fnRx.exec(src))) {
    const brace = src.indexOf('{', fnRx.lastIndex);
    if (brace < 0) continue;
    const end = matchBrace(src, brace);
    if (end < 0) continue;
    const body = src.slice(brace, end + 1);
    if (!/\bawait\b/.test(body)) continue;
    const before = src.slice(Math.max(0, m.index - 12), m.index);
    if (/\basync\s+$/.test(before)) continue;
    edits.push({ at: m.index, ins: 'async ' });
  }

  // 2) arrow:  (args) => {  /  name => {
  const arrowRx = /(?:^|[\s(,=;:{\[])(?!async\b)((?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{)/g;
  while ((m = arrowRx.exec(src))) {
    const args = m[1];
    const braceAt = m.index + m[0].length - 1;
    const end = matchBrace(src, braceAt);
    if (end < 0) continue;
    const body = src.slice(braceAt, end + 1);
    if (!/\bawait\b/.test(body)) continue;
    const argStart = m.index + m[0].length - args.length - 1;
    // allaqichon async bo'lsa
    const before = src.slice(Math.max(0, argStart - 8), argStart);
    if (/\basync\s+$/.test(before)) continue;
    edits.push({ at: argStart, ins: 'async ' });
  }

  // oxiridan boshlab qo'yamiz (indekslar buzilmasin)
  edits.sort((a, b) => b.at - a.at);
  let out = src, count = 0;
  for (const e of edits) {
    out = out.slice(0, e.at) + e.ins + out.slice(e.at);
    count++;
  }
  if (count) {
    fs.writeFileSync(file, out, 'utf8');
    console.log(`OK    ${rel.padEnd(24)} async +${count}`);
    total += count;
  } else {
    console.log(`-     ${rel.padEnd(24)} o'zgarish yo'q`);
  }
}
console.log(`\nJAMI async +${total}`);