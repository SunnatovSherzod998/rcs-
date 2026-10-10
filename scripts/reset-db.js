'use strict';
/**
 * Bazani tozalab, qaytadan yaratish (barcha ma’lumotlar yo‘qoladi!)
 */
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.OMBOR_DATA_DIR || path.join(__dirname, '..', 'data');

if (process.argv.includes('--yes') || process.argv.includes('-y')) {
  let n = 0;
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f.startsWith('ombor.db')) {
      fs.unlinkSync(path.join(DATA_DIR, f));
      n++;
    }
  }
  const db = require('../src/db');
  db.init();
  console.log(`\n  ${n} ta fayl o‘chirildi. Yangi bazа yaratildi: ${db.DB_FILE}`);
  console.log('  Login: admin / admin\n');
} else {
  console.log(`
  ⚠  DIQQAT: barcha ma’lumotlar o‘chiriladi!

  Tasdiqlash uchun:  node scripts/reset-db.js --yes
`);
}
