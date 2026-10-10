'use strict';
const { all, get } = require('../src/db');
const wh = get("SELECT id, code FROM catalog_warehouses WHERE code='MAIN'");
console.log('Ombor:', wh.code);

console.log('\nQoldiqlar (location bo‘yicha):');
for (const b of all(
  `SELECT b.location_id, l.code AS cell, l.room_id, r.code AS room,
          COUNT(*) AS poz, SUM(b.qty) AS qty
     FROM reg_stock_balances b
     LEFT JOIN catalog_locations l ON l.id = b.location_id
     LEFT JOIN catalog_rooms r ON r.id = l.room_id
    WHERE b.warehouse_id = ? AND b.qty <> 0
    GROUP BY COALESCE(l.code,'(joylashmagan)') ORDER BY b.location_id`, wh.id)) {
  console.log(`  loc=${String(b.location_id).padStart(4)} cell=${String(b.cell).padEnd(18)} room=${String(b.room || '—').padEnd(9)} poz=${b.poz} qty=${b.qty}`);
}

console.log('\nXonalar:');
for (const r of all('SELECT id, code, kind FROM catalog_rooms WHERE warehouse_id=? ORDER BY code', wh.id)) {
  const free = get('SELECT COUNT(*) AS c FROM catalog_locations WHERE room_id=? AND is_active=1', r.id).c;
  const used = get(
    `SELECT COUNT(DISTINCT b.location_id) AS c FROM reg_stock_balances b
       JOIN catalog_locations l ON l.id=b.location_id
      WHERE l.room_id=? AND b.qty > 0`, r.id).c;
  console.log(`  ${String(r.id).padStart(3)} ${r.code} ${r.kind.padEnd(11)} katak=${free} band=${used}`);
}

console.log('\nAvtomatik joylash uchun (location_id=0): ' + get(
  `SELECT COUNT(DISTINCT product_id) AS c FROM reg_stock_balances
    WHERE warehouse_id=? AND qty>0 AND COALESCE(location_id,0)=0`, wh.id).c + ' pozitsiya');
