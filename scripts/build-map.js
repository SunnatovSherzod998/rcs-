'use strict';
/**
 * 2D BINO REJASINI QURISH + TOVARNI JOYLASH
 *   Xona → Stellaj → Katak
 *
 * Standart rejim: 3 ustun × 2 qator = 6 xona,
 * har bir xonada 3 stellaj × 2 qavat × 4 joy = 24 katak (jami 144).
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
  console.log('OK Kirildi');

  const whs = await api('GET', '/api/catalogs/warehouses/options');

  // ---------------- 1. Reja qurish
  console.log('\n=== 1. REJA (ХОНАЛАР) ===');
  for (const w of whs) {
    const r = await api('POST', '/api/plan/build', {
      warehouse_id: w.id, cols: 3, rooms: 6, racks_per_room: 3, levels: 2, slots: 4,
    });
    console.log(`  ${w.code}: ${r.rooms} xona · ${r.racks} stellaj · ${r.cells} katak`);
  }

  // ---------------- 2. Xonani ko'rsatish
  console.log('\n=== 2. XONALAR ===');
  for (const w of whs) {
    const p = await api('GET', `/api/plan/rooms?warehouse_id=${w.id}`);
    const names = p.rooms.map((r) => `${r.code.split('-').pop()}:${r.kind}`);
    console.log(`  ${w.code} → ${names.join('  ')}`);
  }

  // ---------------- 3. Tovarni joylash
  console.log('\n=== 3. AVTOMATIK JOYLASH ===');
  for (const w of whs) {
    const r = await api('POST', '/api/plan/warehouse/auto-place', { warehouse_id: w.id });
    console.log(`  ${w.code}: ${r.placed} pozitsiya, ${r.rooms_used} xona` +
      r.detail.map((x) => `\n     ${x.room} ${x.kind.padEnd(10)} ${x.placed}`).join(''));
  }

  // ---------------- 4. Natija
  console.log('\n=== 4. NATIJA ===');
  for (const w of whs) {
    const p = await api('GET', `/api/plan/rooms?warehouse_id=${w.id}`);
    console.log(`\n  ${w.code} — ${w.name_ru}`);
    console.log(`    katak ${p.summary.used_cells}/${p.summary.cells} (${p.summary.fill_rate}%), ${p.summary.qty} dona, ${Math.round(p.summary.amount)} UZS`);
    for (const r of p.rooms) {
      if (!r.used_cells) continue;
      console.log(`    ${r.code} ${r.kind.padEnd(10)} SKU ${String(r.products).padStart(2)}, ${String(r.qty).padStart(4)} dona, ${r.used_cells}/${r.cells} katak`);
    }
  }
  console.log('\n  Kirish: http://localhost:3000  →  Registrlar → Bino rejasi (2D)\n');
})().catch((e) => { console.error('XATO:', e.message); process.exit(1); });
