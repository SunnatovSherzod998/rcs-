'use strict';
/**
 * i18n.js va boshqa frontend modullarida `t('...')` kalitlari
 * STR obyektida mavjudligini tekshiradi.
 */
const fs = require('node:fs');
const path = require('node:path');

const PUB = path.join(__dirname, '..', 'public', 'js');
const i18nSrc = fs.readFileSync(path.join(PUB, 'i18n.js'), 'utf8');

// STR dan kalitlarni ajratib olish
const keys = new Set();
for (const m of i18nSrc.matchAll(/^\s*([a-z0-9_]+)\s*:\s*\[/gmi)) keys.add(m[1]);

// frontend dagi barcha t('...') chaqiruvlari
const used = new Map();
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
}
for (const file of walk(PUB)) {
  if (file.endsWith('i18n.js')) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([a-z0-9_]+)'/gi)) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(path.relative(path.join(PUB, '..', '..'), file));
  }
}

const missing = [...used.keys()].filter((k) => !keys.has(k)).sort();
const unused = [...keys].filter((k) => !used.has(k)).sort();

console.log(`STR kalitlari: ${keys.size} | ishlatilgan: ${used.size}`);
if (missing.length) {
  console.log(`\n❗YO'Q KALITLAR (${missing.length}):`);
  for (const k of missing) console.log(`  t('${k}')  ← ${[...new Set(used.get(k))].join(', ')}`);
} else {
  console.log("Barcha t('...') kalitlari mavjud");
}
if (unused.length) {
  console.log(`\nIshlatilmagan (${unused.length}): ${unused.join(', ')}`);
}
process.exit(missing.length ? 1 : 0);
