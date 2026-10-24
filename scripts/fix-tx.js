'use strict';
/** `tx(() => {` -> `tx(async () => {` (barcha fayllarda, UTF-8 saqlanadi) */
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

let total = 0;
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const next = src.replace(/\btx\s*\(\s*\(\s*\)\s*=>/g, 'tx(async () =>');
  if (next !== src) {
    const n = (src.match(/\btx\s*\(\s*\(\s*\)\s*=>/g) || []).length;
    fs.writeFileSync(file, next, 'utf8');
    console.log(`${path.relative(SRC, file).padEnd(26)} +${n}`);
    total += n;
  }
}
console.log(`\nJAMI: ${total}`);