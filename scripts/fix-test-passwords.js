'use strict';
/** Test skriptlaridagi eski `admin/admin` parolini yangilaydi. */
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'scripts');
for (const f of fs.readdirSync(DIR)) {
  if (!f.startsWith('test-') || !f.endsWith('.js')) continue;
  const file = path.join(DIR, f);
  const src = fs.readFileSync(file, 'utf8');
  const next = src.replace(/password:\s*'admin'/g, "password: process.env.ADMIN_PASSWORD || 'ADMIN'");
  if (next !== src) {
    fs.writeFileSync(file, next, 'utf8');
    console.log('OK  ' + f);
  }
}