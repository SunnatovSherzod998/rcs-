'use strict';
/** `(await get(...).c` → `(await get(...)).c` kabi nuqsonlarni topadi va tuzatadi. */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

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

const files = walk(SRC);
let fixed = 0;

for (const file of files) {
  let out = '';
  for (let pass = 0; pass < 12; pass++) {
    let src = fs.readFileSync(file, 'utf8');
    const next = src.replace(
      /\(await\s+(?:all|get|run)\s*\([^()]*\)\.(\w+)/g,
      (m, inner, prop) => `(${inner}).${prop}`
    );
    if (next === src) break;
    out = next;
    fs.writeFileSync(file, next, 'utf8');
    fixed++;
    // qayta o'qish
    src = next;
    break;
  }
}

console.log(`Tuzatilgan iteratsiyalar: ${fixed}`);

// Endi tekshiruv
let bad = 0;
for (const file of files) {
  try {
    execSync(`"${NODE}" --check "${file}"`, { stdio: 'pipe' });
  } catch (e) {
    bad++;
    const msg = String(e.stderr || e.stdout || e.message);
    const m = msg.match(/[\w\\.]+\.js:(\d+)/);
    console.log(`XATO  ${path.relative(SRC, file)}${m ? ' @ ' + m[1] : ''}`);
    const line = m ? String(e.stderr).split('\n').find((l) => l.includes(':')) : '';
    if (line) console.log('       ' + line.trim().slice(0, 110));
  }
}
console.log(bad === 0 ? '\nBARCHA FAYLLAR TOGRI' : `\nXATO: ${bad} ta faylda`);