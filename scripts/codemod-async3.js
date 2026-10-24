'use strict';
/**
 * Codemod 3: `await all(...).map(...)` → `(await all(...)).map(...)`
 * `await get(...)` kabi ifodalarda `.method` bog'lanmagan holatni tuzatadi.
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const FILES = [
  'api/catalogs.js', 'api/documents.js', 'api/plan.js', 'api/registers.js',
  'api/reports.js', 'api/system.js', 'api/warehouse.js',
  'services/salary.js', 'services/stock.js', 'lib/http.js',
];

function matchParen(src, from) {
  let i = from, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      if (c === '`') { i = skipTemplate(src, i); continue; }
      i = skipString(src, i); continue;
    }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function skipString(src, i) {
  const q = src[i]; i++;
  while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) return i; i++; }
  return i;
}
function skipTemplate(src, i) {
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '`') return i;
    if (src[i] === '$' && src[i + 1] === '{') {
      const e = matchBrace(src, i + 1);
      if (e < 0) return i;
      i = e;
    }
    i++;
  }
  return i;
}
function matchBrace(src, from) {
  let i = from, depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '`') { i = skipTemplate(src, i); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

let total = 0;
for (const rel of FILES) {
  const file = path.join(SRC, rel);
  let src = fs.readFileSync(file, 'utf8');
  const edits = [];

  const rx = /\bawait\s+(all|get)\s*\(/g;
  let m;
  while ((m = rx.exec(src))) {
    const open = src.indexOf('(', m.index);
    const close = matchParen(src, open);
    if (close < 0) continue;
    const after = src[close + 1];
    // `await fn(...).method` yoki `await fn(...)` dan keyin `.` / `[`
    if (after !== '.' && after !== '[') continue;
    // allaqachon `(await ...)` ichida bo'lsa
    const before = src.slice(Math.max(0, m.index - 2), m.index);
    if (before.endsWith('(')) continue;
    edits.push({ start: m.index, end: close + 1, text: `(await ${m[1]}(${src.slice(open + 1, close)})` });
  }

  edits.sort((a, b) => b.start - a.start);
  let out = src, n = 0;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    n++;
  }
  if (n) {
    fs.writeFileSync(file, out, 'utf8');
    console.log(`OK    ${rel.padEnd(24)} ${n}`);
    total += n;
  }
}
console.log(`\nJAMI ${total}`);