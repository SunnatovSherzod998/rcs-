'use strict';
const db = require('../src/db');
(async () => {
  await db.init();
  const u = await db.get('SELECT id, login, full_name, role, warehouse_id, employee_id, allowed_features FROM users WHERE id=?', 1);
  console.log('user row:', JSON.stringify(u));
  console.log('employee_id:', u?.employee_id, '| type:', typeof u?.employee_id);
  const roleEmp = await db.get(
    `SELECT e.id FROM catalog_employees e JOIN users u ON u.employee_id = e.id WHERE u.id = ?`, u?.id ?? 0);
  console.log('roleEmp:', JSON.stringify(roleEmp));
  const last = await db.get(`SELECT id FROM catalog_employees WHERE is_active = 1 ORDER BY id LIMIT 1`);
  console.log('last:', JSON.stringify(last));
  db.close();
})();