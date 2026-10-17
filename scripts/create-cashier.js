'use strict';
/**
 * Buxgalter uchun foydalanuvchi akkauntini yaratish va xodimga bog'lash.
 * Ishlatish:  node scripts/create-cashier.js
 */
const path = require('node:path');
const db = require(path.join(__dirname, '..', 'src', 'db'));
const { hashPassword } = require(path.join(__dirname, '..', 'src', 'lib', 'crypto'));

db.init();
const { all, get, run, tx } = db;

const EMP_ID = 2;                  // Nodira Yusupova (Buxgalter)
const LOGIN = 'nodira';
const PASSWORD = '12345';
const FULL_NAME = 'Nodira Yusupova';
const ROLE = 'CASHIER';

const emp = get('SELECT * FROM catalog_employees WHERE id=?', EMP_ID);
if (!emp) { console.error('Xodim topilmadi / Сотрудник не найден:', EMP_ID); process.exit(1); }

const existing = get('SELECT * FROM users WHERE lower(login)=lower(?)', LOGIN);
if (existing) {
  console.log(`"${LOGIN}" allaqachon mavjud / уже существует. Yangilanmoqda...`);
  const { hash, salt } = hashPassword(PASSWORD);
  tx(() => {
    run("UPDATE users SET password_hash=?, salt=?, full_name=?, role=?, employee_id=?, is_active=1 WHERE id=?",
      hash, salt, FULL_NAME, ROLE, EMP_ID, existing.id);
  });
  console.log(`✅ Yangilandi / Обновлено: ${LOGIN} (id=${existing.id})`);
} else {
  const { hash, salt } = hashPassword(PASSWORD);
  tx(() => {
    run("INSERT INTO users (login, password_hash, salt, full_name, role, employee_id, is_active) VALUES (?,?,?,?,?,?,1)",
      LOGIN, hash, salt, FULL_NAME, ROLE, EMP_ID);
  });
  const u = get('SELECT id FROM users WHERE lower(login)=lower(?)', LOGIN);
  console.log(`✅ Yaratildi / Создано: ${LOGIN} (id=${u.id})`);
}

console.log('\nXodim / Сотрудник:');
const e = get('SELECT id, name_uz, name_ru, position, base_salary, sales_limit, bonus_percent FROM catalog_employees WHERE id=?', EMP_ID);
console.log(`  #${e.id}  ${e.name_uz} (${e.position})`);
console.log(`  Oylik: ${Math.round(e.base_salary).toLocaleString('ru-RU')} so'm`);
console.log(`  Sotuv limiti: ${Math.round(e.sales_limit).toLocaleString('ru-RU')} so'm`);
console.log(`  Bonus foizi: ${e.bonus_percent}%`);

const sales = get("SELECT COUNT(*) AS c, COALESCE(SUM(total_qty),0) AS q, COALESCE(SUM(total_amount),0) AS a FROM documents WHERE employee_id=? AND type='ISSUE' AND base_type='SALE' AND status='POSTED'", EMP_ID);
console.log(`\nSotuvlar / Продажи: ${sales.c} hujjat, ${sales.q} dona, ${Math.round(sales.a).toLocaleString('ru-RU')} so'm`);