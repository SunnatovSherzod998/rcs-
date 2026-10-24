'use strict';
/**
 * Moji-bake (double encoding) tuzatuvchi.
 * PowerShell faylni single-byte kodlashda o'qib, UTF-8 ga yozgan.
 * Qaysi kodlash ishlatilganini aniqlab, baytlarni tiklaydi.
 */

// CP1251 -> Unicode (0x80..0xFF)
const CP1251 = [
  0x0402, 0x0403, 0x201A, 0x0453, 0x201E, 0x2026, 0x2020, 0x2021,
  0x20AC, 0x2030, 0x0409, 0x2039, 0x040A, 0x040C, 0x040B, 0x040F,
  0x0452, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x0098, 0x2122, 0x0459, 0x203A, 0x045A, 0x045C, 0x045B, 0x045F,
  0x00A0, 0x040E, 0x045E, 0x0408, 0x00A4, 0x0490, 0x00A6, 0x00A7,
  0x0401, 0x00A9, 0x0404, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x0407,
  0x00B0, 0x00B1, 0x0406, 0x0456, 0x0491, 0x00B5, 0x00B6, 0x00B7,
  0x0451, 0x2116, 0x0454, 0x00BB, 0x0458, 0x0405, 0x0455, 0x0457,
  0x0410, 0x0411, 0x0412, 0x0413, 0x0414, 0x0415, 0x0416, 0x0417,
  0x0418, 0x0419, 0x041A, 0x041B, 0x041C, 0x041D, 0x041E, 0x041F,
  0x0420, 0x0421, 0x0422, 0x0423, 0x0424, 0x0425, 0x0426, 0x0427,
  0x0428, 0x0429, 0x042A, 0x042B, 0x042C, 0x042D, 0x042E, 0x042F,
  0x0430, 0x0431, 0x0432, 0x0433, 0x0434, 0x0435, 0x0436, 0x0437,
  0x0438, 0x0439, 0x043A, 0x043B, 0x043C, 0x043D, 0x043E, 0x043F,
  0x0440, 0x0441, 0x0442, 0x0443, 0x0444, 0x0445, 0x0446, 0x0447,
  0x0448, 0x0449, 0x044A, 0x044B, 0x044C, 0x044D, 0x044E, 0x044F,
  0x2116, 0x0451, 0x2116, 0x0454, 0x00B8, 0x2116, 0x2116, 0x00A4,
  0x045E, 0x0458, 0x2116, 0x00A7, 0x00B9, 0x00AF, 0x00B4, 0x00B8,
];

const UNICODE_TO_CP1251 = new Map();
CP1251.forEach((cp, i) => UNICODE_TO_CP1251.set(cp, 0x80 + i));

// CP866 -> Unicode (0x80..0xAF)
const CP866 = [];
{
  const base = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';
  for (let i = 0; i < base.length; i++) CP866.push(base.charCodeAt(i));
}
const UNICODE_TO_CP866 = new Map();
CP866.forEach((cp, i) => UNICODE_TO_CP866.set(cp, 0x80 + i));

function unMojibake(str, table) {
  const bytes = [];
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 0x80) { bytes.push(code); continue; }
    const b = table.get(code);
    if (b === undefined) return null;          // bu kodlashda yo'q
    bytes.push(b);
  }
  const buf = Buffer.from(bytes);
  const decoded = buf.toString('utf8');
  // tekshiruv: null belgisi bo'lsa, bu noto'g'ri kodlash
  if (decoded.includes('\uFFFD')) return null;
  return decoded;
}

/** Ikkalasi ham bo'lishi mumkin (2 marta kodlash bo'lgan) */
function tryAll(str, depth = 0) {
  if (depth > 3) return str;
  for (const table of [UNICODE_TO_CP1251, UNICODE_TO_CP866]) {
    const r = unMojibake(str, table);
    if (r && /[\u0400-\u04FF]/.test(r)) return tryAll(r, depth + 1);
  }
  return str;
}

module.exports = { tryAll, CP1251, CP866 };

if (require.main === module) {
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

  for (const file of walk(SRC)) {
    let buf = fs.readFileSync(file);
    let hadBom = false;
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) { buf = buf.slice(3); hadBom = true; }
    const before = buf.toString('utf8');
    const after = tryAll(before);

    const badBefore = (before.match(/Р[\u0080-\u00BF]/g) || []).length;
    const badAfter = (after.match(/Р[\u0080-\u00BF]/g) || []).length;

    if (hadBom || before !== after) {
      fs.writeFileSync(file, Buffer.from(after, 'utf8'), 'utf8');
      console.log(`${path.relative(SRC, file).padEnd(26)} BOM=${hadBom ? 'y' : 'n'} buzilgan ${badBefore} -> ${badAfter}`);
    }
  }
  console.log('\nTayyor.');
}