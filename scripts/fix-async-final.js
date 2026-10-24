'use strict';
/**
 * Codemod 5: async konvertatsiyani yakunlaydi.
 *  1. `txasync (() => {`  ->  `tx(async () => {`
 *  2. `await all(...).x`  ->  `(await all(...)).x`
 *  3. `await all(...).map(` -> `(await all(...)).map(`
 *  4. `return await`       -> `return`
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

// --- 1. txasync ---
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  let next = src.replace(/\btxasync\s*\(\s*\(\s*\)\s*=>/g, 'tx(async () =>');
  next = next.replace(/\btxasync\s*\(/g, 'tx(');
  if (next !== src) {
    fs.writeFileSync(file, next, 'utf8');
    console.log(`txasync  ${path.relative(SRC, file)}`);
  }
}

// --- 2/3. qavsni to'g'rilash (bir necha iteratsiya) ---
for (let pass = 0; pass < 6; pass++) {
  let changed = 0;
  for (const file of walk(SRC)) {
    const src = fs.readFileSync(file, 'utf8');
    const next = src
      // await fn(...).prop  ->  (await fn(...)).prop
      .replace(/\bawait\s+(all|get|run)\s*\(/g, (m) => m)  // marker
      .replace(/(?<!await )(?<!\()(await\s+(?:all|get|run)\s*\((?:[^()]|\([^()]*\))*\))\s*\./g,
        '$1)')
      .replace(/\(await\s+(?:all|get|run)\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*(\w+)/g,
        '(await $1)');
    if (next !== src) { fs.writeFileSync(file, next, 'utf8'); changed++; }
  }
  if (!changed) break;
}

// --- 4. return await ---
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const next = src.replace(/\breturn await\b/g, 'return');
  if (next !== src) { fs.writeFileSync(file, next, 'utf8'); console.log(`return-await ${path.relative(SRC, file)}`); }
}

// --- Tekshiruv ---
let bad = 0;
for (const file of walk(SRC)) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    const line = (msg.split('\n').find((l) => l.trim().startsWith('await') || l.includes('SyntaxError')) || '').trim();
    console.log(`XATO ${path.relative(SRC, file)}${m ? ':' + m[1] : ''}  ${line.slice(0, 90)}`);
  }
}
console.log(bad === 0 ? '\nBARCHA FAYLLAR SINTAKTIK TOGRI' : `\nXATO: ${bad} faylda`);