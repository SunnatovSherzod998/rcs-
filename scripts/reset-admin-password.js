'use strict';
/**
 * Admin parolini tiklaydi / Сброс пароля администратора.
 *
 *   node scripts/reset-admin-password.js            → tasodifiy parol yaratadi
 *   node scripts/reset-admin-password.js "PAROL"    → berilgan parolni o'rnatadi
 *
 * Parol siyosati public/js/password.mjs bilan tekshiriladi (bitta manba).
 */
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..');
const db = require(path.join(ROOT, 'src', 'db'));
const { hashPassword, verifyPassword } = require(path.join(ROOT, 'src', 'lib', 'crypto'));

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // chalkash belgilar (I, O) yo'q
const DIGIT = '23456789';                    // chalkash belgilar (0, 1) yo'q
const SYMBOL = '!@#$%&*';

const LOGIN = 'admin';

/** Siyosatga mos tasodifiy parol yaratadi */
function generatePassword(policy, length = 13) {
  const { minDigits, maxDigits } = policy.digitBounds(length);
  for (;;) {
    const digits = minDigits + crypto.randomInt(maxDigits - minDigits + 1);
    const others = length - digits;
    const pool = [];
    for (let i = 0; i < digits; i++) pool.push(DIGIT[crypto.randomInt(DIGIT.length)]);
    for (let i = 0; i < others; i++) {
      const src = crypto.randomInt(4) === 0 ? SYMBOL : UPPER;
      pool.push(src[crypto.randomInt(src.length)]);
    }
    // aralashtirish (Fisher-Yates)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const pw = pool.join('');
    if (policy.analyzePassword(pw).ok) return pw;
  }
}

(async () => {
  await db.init();

  const policy = await import('file:///' + path.join(ROOT, 'public', 'js', 'password.mjs').replace(/\\/g, '/'));
  const arg = process.argv[2];
  const password = arg || generatePassword(policy);

  const r = policy.analyzePassword(password);
  if (!r.ok) {
    console.error('XATO: parol siyosatga mos emas —', r.uz, '/', r.ru);
    process.exit(1);
  }

  const user = await db.get('SELECT * FROM users WHERE login=?', LOGIN);
  if (!user) { console.error('XATO: admin foydalanuvchisi topilmadi'); process.exit(1); }

  const { hash, salt } = hashPassword(password);
  await db.run('UPDATE users SET password_hash=?, salt=? WHERE id=?', hash, salt, user.id);
  await db.audit(user, 'PASSWORD_RESET', 'user', user.id, { by: 'cli' });

  // tekshiruv
  const check = await db.get('SELECT password_hash, salt FROM users WHERE id=?', user.id);
  const ok = verifyPassword(password, check.password_hash, check.salt);

  console.log('');
  console.log('  Admin paroli yangilandi / Пароль администратора изменён');
  console.log('  Login:     ' + LOGIN);
  console.log('  Parol:     ' + password);
  console.log('  Tekshiruv: ' + (ok ? 'OK' : 'FAIL'));
  console.log('');

  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
