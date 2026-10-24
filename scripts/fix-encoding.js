'use strict';
/**
 * PowerShell Set-Content UTF8 hodisasi tuzatuvchi:
 *  1) BOM ni olib tashlaydi
 *  2) "double encoding" (UTF-8 -> CP1251 -> UTF-8) ni teskari qaytaradi
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

const TARGETS = [
  'api/plan.js', 'api/system.js', 'api/warehouse.js', 'services/stock.js',
];

for (const rel of TARGETS) {
  const file = path.join(SRC, rel);
  let buf = fs.readFileSync(file);

  // BOM olib tashlash
  let hadBom = false;
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    buf = buf.slice(3);
    hadBom = true;
  }

  let s = buf.toString('utf8');

  // Double encoding ni aniqlash: "С" -> "РЎ" kabi
  const mojibake = /Р[\u0080-\u00BF]/.test(s) || /вЂ[\u0080-\u00BF]/.test(s);
  if (mojibake) {
    // UTF-8 -> CP1251 baytlariga -> UTF-8 decode
    const bytes = Buffer.from(s, 'utf8');
    // Har bir UTF-8 baytni CP1251 belgisi sifatida ko'rib, asl baytlarni olamiz
    const latin = bytes.toString('latin1');
    const restored = Buffer.from(latin, 'latin1').toString('utf8');
    if (/[\u0400-\u04FF]/.test(restored)) {
      s = restored;
    }
  }

  fs.writeFileSync(file, Buffer.from(s, 'utf8'), 'utf8');
  console.log(`${rel}: BOM=${hadBom ? 'olindi' : 'yo\'q'} mojibake=${mojibake ? 'tuzatildi' : 'yo\'q'}`);
}

// Tekshiruv
console.log('\n=== Tekshiruv ===');
for (const rel of TARGETS) {
  const s = fs.readFileSync(path.join(SRC, rel), 'utf8');
  const cyr = (s.match(/[\u0400-\u04FF]/g) || []).length;
  const bad = (s.match(/Р[\u0080-\u00BF]/g) || []).length;
  console.log(`${rel.padEnd(24)} kirill=${String(cyr).padEnd(5)} buzilgan=${bad}`);
}