'use strict';
const db = require('../src/db');
db.init();

const cols = db.all("PRAGMA table_info(catalog_employees)");
console.log('Columns:', cols.map(c => c.name).join(', '));
const emps = db.all('SELECT id, name_uz, name_ru, base_salary, sales_limit, bonus_percent, bonus_total FROM catalog_employees LIMIT 5');
console.log('Employees count:', emps.length);
for (const e of emps) {
  console.log(' -', e.name_uz, '| base:', e.base_salary, '| limit:', e.sales_limit, '| bonus%:', e.bonus_percent);
}
