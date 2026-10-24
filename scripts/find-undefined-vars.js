'use strict';
/**
 * Aniqlash: "o'zgaruvchi kontekstida await" buzilgan qatorlar.
 * Masalan:  const total = (await c);   -> c belgisi qarshi yo'q
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

let n = 0;
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  // barchat etibor berilgan o'zgaruvchilarni yig'ish
  const declared = new Set();
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const p of m[1].split(',')) {
      const name = p.split(':').pop().trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name);
    }
  }

  lines.forEach((ln, i) => {
    // `const X = (await Y);` — Y bu boshqa ifoda bo'lishi kerak
    const m = ln.match(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(?\s*await\s+([A-Za-z_$][\w$]*)\s*\)?\s*;/);
    if (m && !declared.has(m[2]) && !['all', 'get', 'run'].includes(m[2])) {
      console.log(`${path.relative(SRC, file)}:${i + 1}  "${m[2]}" belgisi yo'q`);
      n++;
    }
  });
}
console.log(`\nJami: ${n}`);