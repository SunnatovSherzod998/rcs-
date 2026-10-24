'use strict';
const db = require('../src/db');
(async () => {
  await db.init();
  const cp = await db.all("SELECT id, name_ru, is_active, kind FROM catalog_counterparties ORDER BY id DESC LIMIT 5");
  console.log('Oxirgi kontragentlar:', JSON.stringify(cp));
  const dm = await db.all('SELECT counterparty_id, COUNT(*) AS c, SUM(amount) AS s FROM reg_debt_movements GROUP BY counterparty_id ORDER BY counterparty_id DESC LIMIT 8');
  console.log('Debt movements:', JSON.stringify(dm));
  const d = await db.all("SELECT id, number, date, status, counterparty_id, total_amount FROM documents WHERE type='ISSUE' AND base_type='SALE' ORDER BY id DESC LIMIT 4");
  console.log('SALE docs:', JSON.stringify(d));
  db.close();
})();