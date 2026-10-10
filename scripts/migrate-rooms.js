'use strict';
/**
 * ESKI JOYLARDAN XONALARGA KO'CHIRISH / МИГРАЦИЯ
 *
 * Eski rejimdagi (A-01-1-01) tovarqini yangi rejimdagi
 * xona → stellaj → katak (MAIN-102-S01-1-01) ga ko'chiradi.
 *
 * Har bir SKU uchun: PICK (eski joy → umumiy) + PLACEMENT (umumiy → yangi joy).
 * Hujjatlar orqali — tarix saqlanadi, registrlar to'g'ri yangilanadi.
 */
const BASE = process.env.BASE || 'http://localhost:3000';
let token = '';

async function api(m, p, b) {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status} ${j?.error?.message || ''}`);
  return j.data;
}

(async () => {
  const d = await api('POST', '/api/auth/login', { login: 'admin', password: 'admin' });
  token = d.token;
  const today = new Date().toISOString().slice(0, 10);
  const NOTE = 'Migratsiya: xonalar';

  const whs = await api('GET', '/api/catalogs/warehouses/options');

  for (const wh of whs) {
    console.log(`\n=== ${wh.code} (${wh.name_ru}) ===`);

    // 1) eski joylardagi tovar (room_id IS NULL bo'lgan)
    const old = (await api('GET', `/api/register/stock/balances?warehouse_id=${wh.id}&limit=2000`)).rows
      .filter((b) => b.location_id && !b.room_code && b.qty > 0);
    if (!old.length) { console.log('  eski joylarda tovar yo‘q'); continue; }
    console.log(`  eski joylarda: ${old.length} pozitsiya, ${old.reduce((s, b) => s + b.qty, 0)} dona`);

    // 2) xonalar ro'yxati (bo'sh kataklari bilan)
    const plan = await api('GET', `/api/plan/rooms?warehouse_id=${wh.id}`);
    const freeCells = [];
    for (const r of plan.rooms) {
      const rd = await api('GET', `/api/plan/room?room_id=${r.id}`);
      for (const k of rd.racks) {
        for (const lv of k.levels) {
          for (const c of lv.cells) {
            if (!c.items || !c.items.length) freeCells.push({ id: c.id, code: c.code, room: r.code });
          }
        }
      }
    }
    console.log(`  bo'sh kataklar: ${freeCells.length}`);

    const take = old.slice(0, freeCells.length);
    if (!take.length) { console.log('  joylash uchun bo‘sh katak yo‘q'); continue; }

    // 3) PICK — eski joylardan chiqarish
    const pick = await api('POST', '/api/documents', {
      type: 'PICK', date: today, warehouse_id: wh.id, note: NOTE + ' (PICK)',
      lines: take.map((b) => ({ product_id: b.product_id, location_id: b.location_id, qty: b.qty, price: 0 })),
    });
    await api('POST', `/api/documents/${pick.document.id}/post`);
    console.log(`  PICK: №${pick.document.number}, ${take.length} qator`);

    // 4) PLACEMENT — yangi xona kataklariga
    const place = await api('POST', '/api/documents', {
      type: 'PLACEMENT', date: today, warehouse_id: wh.id, note: NOTE + ' (joylash)',
      lines: take.map((b, i) => ({ product_id: b.product_id, location_id: freeCells[i].id, qty: b.qty, price: 0 })),
    });
    await api('POST', `/api/documents/${place.document.id}/post`);
    console.log(`  PLACEMENT: №${place.document.number}, ${take.length} qator`);
    console.log('  misollar:');
    for (let i = 0; i < Math.min(3, take.length); i++) {
      console.log(`    ${take[i].sku} → ${freeCells[i].code} (${freeCells[i].room}) — ${take[i].qty} dona`);
    }
  }

  // natija
  console.log('\n=== NATIJA ===');
  for (const wh of whs) {
    const p = await api('GET', `/api/plan/rooms?warehouse_id=${wh.id}`);
    console.log(`  ${wh.code}: ${p.summary.used_cells}/${p.summary.cells} band (${p.summary.fill_rate}%), ${p.summary.qty} dona, ${Math.round(p.summary.amount)} UZS`);
    for (const r of p.rooms.filter((x) => x.used_cells > 0)) {
      console.log(`    ${r.code} ${r.kind.padEnd(10)} SKU ${r.products}, ${r.qty} dona`);
    }
  }
  console.log('');
})().catch((e) => { console.error('XATO:', e.message); process.exit(1); });
