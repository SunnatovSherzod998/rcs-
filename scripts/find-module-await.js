'use strict';
/**
 * Modul obyekti orqali chaqirilayotgan async funksiyalarni topadi.
 * Masalan: stock.post(...)  salary.applyBonus(...)
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

/** Modul -> eksport qilingan async funksiyalar */
function asyncExports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const set = new Set();
  const rx = /\basync\s+function\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = rx.exec(src))) set.add(m[1]);
  return set;
}

const modules = {
  stock: asyncExports(path.join(SRC, 'services', 'stock.js')),
  salary: asyncExports(path.join(SRC, 'services', 'salary.js')),
  db: asyncExports(path.join(SRC, 'db', 'index.js')),
};

let total = 0;
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    if (/^\s*(\/\/|\*)/.test(ln)) return;
    for (const [mod, fns] of Object.entries(modules)) {
      for (const fn of fns) {
        const rx = new RegExp(`(?<![\\w.$])${mod}\\.${fn}\\s*\\(`);
        if (!rx.test(ln)) continue;
        if (new RegExp(`await\\s+${mod}\\.${fn}\\s*\\(`).test(ln)) continue;
        console.log(`${path.relative(SRC, file)}:${i + 1}  ${mod}.${fn}()  |  ${ln.trim().slice(0, 84)}`);
        total++;
      }
    }
  });
}
console.log(`\nJami: ${total}`);