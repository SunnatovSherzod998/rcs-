'use strict';
const db = require('../src/db');
(async () => {
  await db.init();
  const docs = await db.all("SELECT id, type, number, status, total_qty, total_amount FROM documents ORDER BY id DESC LIMIT 8");
  console.log('Documents:');
  for (const d of docs) {
    const lines = await db.all('SELECT COUNT(*) AS c FROM document_lines WHERE document_id=?', d.id);
    console.log(`  #${d.id} ${d.type} ${d.status} qty=${d.total_qty} lines=${lines[0].c}`);
  }
  const mv = await db.all('SELECT COUNT(*) AS c FROM reg_stock_movements');
  console.log('\nMovements:', mv[0].c);
  const bal = await db.all('SELECT product_id, warehouse_id, location_id, qty FROM reg_stock_balances ORDER BY product_id LIMIT 6');
  console.log('Balances:', JSON.stringify(bal));
  db.close();
})();