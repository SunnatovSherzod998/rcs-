'use strict';
/** Qolgan buzilishlar: qo'shimcha qavslar va `async (() =>`. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;
const SRC = path.join(ROOT, 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : e.name.endsWith('.js') && out.push(p);
  }
  return out;
}

for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;

  // 1) `const X = ((((((await ...` -> `const X = (await ...`
  out = out.replace(/(\(\(*\(\(*\(\(*\(await\s)/g, '(await ');

  // 2) `async (() => ({` -> `async () => ({`   /   `async (() => {` -> `async () => {`
  out = out.replace(/async\s*\(\s*\(\s*\)\s*=>/g, 'async () =>');

  // 3) `await get(...)).c` -> `await get(...)).c` (qavs soni mos kelmadi)
  //    `((await get(` -> `(await get(`
  out = out.replace(/\(\(\(await\s/g, '(await ');

  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    console.log('OK  ' + path.relative(SRC, file));
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
    console.log(`XATO ${path.relative(SRC, file)}${m ? ':' + m[1] : ''}  ${ln.slice(0, 76)}`);
  }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad}`);