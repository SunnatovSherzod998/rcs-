'use strict';
/** Test qoldig'ini tozalaydi (API-TEST SKU va hujjatlari). */
const db = require('../src/db');
(async () => {
  await db.init();
  const SKU = 'API-TEST-001';

  const prods = await db.all('SELECT id FROM catalog_products WHERE sku=?', SKU);
  const ids = prods.map((p) => p.id);
  console.log('Test tovari ID:', ids);

  const docs = await db.all(
    `SELECT DISTINCT d.id, d.number, d.status FROM documents d
      JOIN document_lines l ON l.document_id = d.id
      JOIN catalog_products p ON p.id = l.product_id
     WHERE p.sku = ?`, SKU);
  console.log('Test hujjatlari:', docs.length);

  // harakatlar va qarz tozalanadi, balanslar qayta hisoblanadi
  for (const d of docs) {
    const affected = await db.all(
      'SELECT DISTINCT product_id, warehouse_id, COALESCE(location_id,0) AS location_id FROM reg_stock_movements WHERE document_id=?',
      d.id);
    await db.run('DELETE FROM reg_stock_movements WHERE document_id=?', d.id);
    await db.run('DELETE FROM reg_debt_movements WHERE document_id=?', d.id);
    await db.run('DELETE FROM document_lines WHERE document_id=?', d.id);
    await db.run('DELETE FROM reg_employee_bonuses WHERE document_id=?', d.id);
    await db.run('DELETE FROM documents WHERE id=?', d.id);
    for (const a of affected) {
      const m = await db.get(
        `SELECT COALESCE(SUM(qty_in),0) AS qin, COALESCE(SUM(qty_out),0) AS qout,
                COALESCE(SUM(amount),0) AS amt, MAX(date) AS d
           FROM reg_stock_movements
          WHERE product_id = ? AND warehouse_id = ? AND COALESCE(location_id,0) = ?`,
        a.product_id, a.warehouse_id, a.location_id);
      const qty = Math.round(((m.qin || 0) - (m.qout || 0)) * 100) / 100;
      const amt = Math.round((m.amt || 0) * 100) / 100;
      if (Math.abs(qty) < 1e-9 && Math.abs(amt) < 1e-6) {
        await db.run('DELETE FROM reg_stock_balances WHERE product_id=? AND warehouse_id=? AND location_id=?',
          a.product_id, a.warehouse_id, a.location_id);
      } else {
        await db.run(
          `INSERT INTO reg_stock_balances (product_id, warehouse_id, location_id, qty, amount, last_date)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(product_id, warehouse_id, location_id)
           DO UPDATE SET qty=excluded.qty, amount=excluded.amount, last_date=excluded.last_date`,
          a.product_id, a.warehouse_id, a.location_id, qty, amt, m.d || null);
      }
    }
  }

  const bal = await db.all('SELECT * FROM reg_stock_balances WHERE product_id IN (' + ids.map(() => '?').join(',') + ')', ...ids);
  console.log('Qolgan balanslar:', JSON.stringify(bal));
  db.close();
  console.log('\nTozalandi.');
})();