'use strict';
/**
 * Eski sotuv hujjatlariga xodimni biriktirish.
 * Ishlatish:  node scripts/link-employees.js <employee_id>
 * Masalan:    node scripts/link-employees.js 2
 */
const path = require('node:path');
const db = require(path.join(__dirname, '..', 'src', 'db'));

db.init();
const { all, get, run } = db;

const empId = Number(process.argv[2]) || 0;
if (!empId) {
  console.log('Foydalanish / Использование: node scripts/link-employees.js <employee_id>');
  console.log('\nXodimlar / Сотрудники:');
  for (const e of all('SELECT id, name_uz, name_ru, position FROM catalog_employees ORDER BY id')) {
    console.log(`  #${e.id}  ${e.name_uz || e.name_ru}  (${e.position || '—'})`);
  }
  const n = get("SELECT COUNT(*) AS c FROM documents WHERE employee_id IS NULL AND type='ISSUE' AND base_type='SALE'").c;
  console.log(`\nBiriktirilmagan sotuv hujjatlari: ${n}`);
  process.exit(0);
}

const emp = get('SELECT * FROM catalog_employees WHERE id=?', empId);
if (!emp) { console.error('Xodim topilmadi / Сотрудник не найден:', empId); process.exit(1); }

const rows = all(
  "SELECT id, number, date, total_qty, total_amount FROM documents WHERE employee_id IS NULL AND type='ISSUE' AND base_type='SALE' AND status='POSTED'"
);
if (!rows.length) { console.log('Biriktiriladigan hujjatlar yo‘q / Нет документов для привязки'); process.exit(0); }

db.tx(() => {
  for (const d of rows) {
    run('UPDATE documents SET employee_id=? WHERE id=?', empId, d.id);
  }
});

console.log(`✅ ${rows.length} ta hujjat xodimga biriktirildi: ${emp.name_uz || emp.name_ru} (#${emp.id})`);
console.log('\nHujjatlar / Документы:');
for (const d of rows) {
  console.log(`  #${d.number}  ${d.date}  ${d.total_qty} dona  ${Math.round(d.total_amount).toLocaleString('ru-RU')} so'm`);
}