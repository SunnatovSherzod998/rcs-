'use strict';
const { all, get } = require('../src/db');
const sku = process.argv[2] || 'TV-S55';
const p = get('SELECT id FROM catalog_products WHERE sku = ?', sku);
console.log(`${sku} (id=${p?.id}) harakati:`);
for (const m of all(
  `SELECT m.doc_type, m.qty_in, m.qty_out, d.number, d.status, d.note
     FROM reg_stock_movements m LEFT JOIN documents d ON d.id = m.document_id
    WHERE m.product_id = ? ORDER BY m.id`, p?.id)) {
  console.log(`  ${m.doc_type.padEnd(10)} in=${String(m.qty_in).padStart(6)} out=${String(m.qty_out).padStart(6)}  №${m.number} [${m.status}] ${m.note || ''}`);
}
console.log('\nQoldiqlar:');
for (const b of all(
  `SELECT b.warehouse_id, w.code, b.location_id, l.code AS cell, b.qty
     FROM reg_stock_balances b JOIN catalog_warehouses w ON w.id=b.warehouse_id
     LEFT JOIN catalog_locations l ON l.id=b.location_id
    WHERE b.product_id = ? AND b.qty <> 0 ORDER BY w.code, l.code`, p?.id)) {
  console.log(`  ${b.code} / ${b.cell || '(joylashmagan)'}: ${b.qty}`);
}
