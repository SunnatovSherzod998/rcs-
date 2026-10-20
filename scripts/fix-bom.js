'use strict';
/** JSON fayllardagi BOM ni olib tashlaydi. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const files = ['package.json', 'package-lock.json', 'vercel.json', 'tsconfig.json'];

for (const f of files) {
  const file = path.join(ROOT, f);
  if (!fs.existsSync(file)) continue;
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    fs.writeFileSync(file, buf.slice(3));
    console.log('BOM olindi: ' + f);
  } else {
    console.log('BOM yo‘q:   ' + f);
  }
}