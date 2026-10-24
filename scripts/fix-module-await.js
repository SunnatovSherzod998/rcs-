'use strict';
/** Modul orqali chaqirilayotgan async funksiyalarga `await` qo'shadi. */
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
  let changed = false;

  lines.forEach((ln, i) => {
    if (/^\s*(\/\/|\*)/.test(ln)) return;
    for (const [mod, fns] of Object.entries(modules)) {
      for (const fn of fns) {
        const rx = new RegExp(`(?<![\\w.$])${mod}\\.${fn}\\s*\\(`);
        if (!rx.test(ln)) continue;
        if (new RegExp(`await\\s+${mod}\\.${fn}\\s*\\(`).test(ln)) continue;
        const pos = ln.search(rx);
        if (pos < 0) continue;
        lines[i] = ln.slice(0, pos) + 'await ' + ln.slice(pos);
        console.log(`${path.relative(SRC, file)}:${i + 1}  await ${mod}.${fn}()`);
        total++;
        changed = true;
        return;
      }
    }
  });

  if (changed) fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

console.log(`\nJami: ${total}`);

let bad = 0;
for (const file of walk(SRC)) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch { bad++; console.log(`XATO ${path.relative(SRC, file)}`); }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad}`);