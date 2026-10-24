'use strict';
/** Anomal kodlarni topadi: (word).digit  /  (word)._  /  .await  /  txasync va h.k. */
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

const PATTERNS = [
  [/\(\s*\w+\s*\)\s*\.\s*\d/, '(word).DIGIT'],
  [/\(\s*\w+\s*\)\s*\.\s*_/, '(word)._'],
  [/\.\s*await\b/, '.await'],
  [/\btxasync\b/, 'txasync'],
  [/\bawait\s+await\b/, 'await await'],
  [/\(\s*\)/, '()'],
  [/\bundefined\s*undefined\b/, 'undefined undefined'],
];

let found = 0;
for (const file of walk(SRC)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    for (const [rx, name] of PATTERNS) {
      if (name === '()') continue;
      if (rx.test(ln)) {
        console.log(`${path.relative(SRC, file)}:${i + 1}  [${name}]  ${ln.trim().slice(0, 100)}`);
        found++;
      }
    }
  });
}
console.log(`\nJami: ${found}`);