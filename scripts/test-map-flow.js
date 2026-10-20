'use strict';
/**
 * JOYLASH OQIMI (Размещение / Выборка) — xona kataklari orqali
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
function assert(c, l, e = '') { console.log(c ? '  OK   ' + l : '  FAIL ' + l + ' ' + e); if (!c) process.exitCode = 1; }

(async () => {
  const d = await api('POST', '/api/auth/login', { login: 'admin', password: process.env.ADMIN_PASSWORD || 'ADMIN' });
  token = d.token;
  const today = new Date().toISOString().slice(0, 10);
  const NOTE = 'FLOW-TEST';
  console.log('OK Kirildi');

  const wh = (await api('GET', '/api/catalogs/warehouses/options')).find((w) => w.code === 'MAIN');

  // ---------------- tozalash
  const cleanup = async () => {
    const rows = (await api('GET', '/api/documents?type=RECEIPT,PLACEMENT,PICK,ISSUE&limit=500')).rows
      .filter((x) => x.note === NOTE);
    for (const doc of rows.reverse()) {
      try {
        if (doc.status === 'POSTED') await api('POST', `/api/documents/${doc.id}/unpost`);
        if (doc.status === 'DRAFT') await api('DELETE', '/api/documents/' + doc.id);
      } catch { /* noop */ }
    }
  };
  await cleanup();

  // ---------------- SKU
  const mk = async (sku, cost) => {
    const f = (await api('GET', `/api/catalogs/products?q=${sku}`)).rows.find((x) => x.sku === sku);
    if (f) return f;
    return api('POST', '/api/catalogs/products', { sku, name_uz: sku, name_ru: sku, cost_price: cost, sale_price: cost * 1.5, min_stock: 3 });
  };
  const p1 = await mk('FLOW-A', 1000);
  const p2 = await mk('FLOW-B', 2000);
  const balOf = async (pid) => (await api('GET', `/api/register/stock/balances?product_id=${pid}&warehouse_id=${wh.id}`)).rows;

  // ---------------- 1. Xona va kataklar
  console.log('\n=== 1. XONA VA KATAKLAR ===');
  let plan = await api('GET', `/api/plan/rooms?warehouse_id=${wh.id}`);
  if (!plan.rooms.length) {
    // omborda hali xona yo'q — reja quriladi
    console.log('  (xonalar yo‘q — bino rejasi quriladi)');
    await api('POST', '/api/plan/build', { warehouse_id: wh.id, cols: 3, rooms: 6, racks_per_room: 3, levels: 2, slots: 4 });
    plan = await api('GET', `/api/plan/rooms?warehouse_id=${wh.id}`);
  }
  const room = plan.rooms.find((r) => r.kind === 'STORAGE' && r.used_cells < r.cells)
    || plan.rooms.find((r) => r.kind === 'STORAGE');
  assert(!!room, 'STORAGE turidagi xona topildi');
  if (!room) return;
  const rd = await api('GET', `/api/plan/room?room_id=${room.id}`);
  const freeCells = rd.racks.flatMap((k) => k.levels.flatMap((l) => l.cells))
    .filter((c) => !c.items?.length);
  console.log(`  ${room.code}: ${rd.racks.length} stellaj, bo'sh katak ${freeCells.length}`);
  assert(freeCells.length >= 3, `bo‘sh kataklar: ${freeCells.length}`);

  // ---------------- 2. KIRIM
  console.log('\n=== 2. KIRIM ===');
  const rec = await api('POST', '/api/documents', {
    type: 'RECEIPT', date: today, warehouse_id: wh.id, note: NOTE,
    lines: [
      { product_id: p1.id, qty: 100, price: 1000 },
      { product_id: p2.id, qty: 50, price: 2000 },
    ],
  });
  await api('POST', `/api/documents/${rec.document.id}/post`);
  assert((await balOf(p1.id))[0]?.qty === 100, `A: ${(await balOf(p1.id))[0]?.qty}`);
  assert((await balOf(p2.id))[0]?.qty === 50, `B: ${(await balOf(p2.id))[0]?.qty}`);

  // ---------------- 3. JOYLASH
  console.log('\n=== 3. JOYLASH (Размещение) ===');
  const c1 = freeCells[0], c2 = freeCells[1];
  const pl = await api('POST', '/api/documents', {
    type: 'PLACEMENT', date: today, warehouse_id: wh.id, note: NOTE,
    lines: [
      { product_id: p1.id, location_id: c1.id, qty: 60, price: 0 },
      { product_id: p2.id, location_id: c2.id, qty: 20, price: 0 },
    ],
  });
  await api('POST', `/api/documents/${pl.document.id}/post`);
  let b1 = (await balOf(p1.id));
  assert(b1.find((b) => b.location_id === c1.id)?.qty === 60, `${c1.code}: 60 dona`);
  assert(b1.find((b) => !b.location_id)?.qty === 40, `umumiyda: 40`);
  console.log(`  ${c1.code} ← A 60 | ${c2.code} ← B 20`);

  // ---------------- 4. BIR JOYGA IKKITA SKU
  console.log('\n=== 4. BIR JOYGA IKKI SKU ===');
  const pl2 = await api('POST', '/api/documents', {
    type: 'PLACEMENT', date: today, warehouse_id: wh.id, note: NOTE,
    lines: [{ product_id: p2.id, location_id: c1.id, qty: 5, price: 0 }],
  });
  await api('POST', `/api/documents/${pl2.document.id}/post`);
  const rd2 = await api('GET', `/api/plan/room?room_id=${room.id}`);
  const shared = rd2.racks.flatMap((k) => k.levels.flatMap((l) => l.cells)).find((c) => c.id === c1.id);
  assert(shared.items.length === 2, `bir joyda ${shared.items.length} SKU`);
  assert(shared.qty === 65, `jami: ${shared.qty}`);
  console.log(`  ${shared.code}: ${shared.items.map((i) => i.sku + '=' + i.qty).join(', ')}`);

  // ---------------- 5. XATOLAR
  console.log('\n=== 5. TEKSHIRUVLAR ===');
  const bad1 = await api('POST', '/api/documents', {
    type: 'PICK', date: today, warehouse_id: wh.id, note: NOTE,
    lines: [{ product_id: p1.id, qty: 5, price: 0 }],
  });
  let err = await api('POST', `/api/documents/${bad1.document.id}/post`).then(() => null).catch((e) => e.message);
  assert(err && /место|ячейк/i.test(err), 'joysiz PICK rad etiladi');
  await api('DELETE', '/api/documents/' + bad1.document.id);

  const bad2 = await api('POST', '/api/documents', {
    type: 'PICK', date: today, warehouse_id: wh.id, note: NOTE,
    lines: [{ product_id: p1.id, location_id: c1.id, qty: 999, price: 0 }],
  });
  err = await api('POST', `/api/documents/${bad2.document.id}/post`).then(() => null).catch((e) => e.message);
  assert(err && /yetarli|недостаточно/i.test(err), 'katakda yetarli emas');
  await api('DELETE', '/api/documents/' + bad2.document.id);

  const bad3 = await api('POST', '/api/documents', {
    type: 'PLACEMENT', date: today, warehouse_id: wh.id, note: NOTE,
    lines: [{ product_id: p1.id, location_id: c1.id, qty: 999, price: 0 }],
  });
  err = await api('POST', `/api/documents/${bad3.document.id}/post`).then(() => null).catch((e) => e.message);
  assert(err && /yetarli|недостаточно/i.test(err), 'joylash uchun yetarli emas');
  await api('DELETE', '/api/documents/' + bad3.document.id);

  // ---------------- 6. YIG'ISH
  console.log('\n=== 6. YIG‘ISH (Выборка) ===');
  const pick = await api('POST', '/api/documents', {
    type: 'PICK', date: today, warehouse_id: wh.id, note: NOTE,
    lines: [
      { product_id: p1.id, location_id: c1.id, qty: 10, price: 0 },
      { product_id: p2.id, location_id: c1.id, qty: 2, price: 0 },
    ],
  });
  await api('POST', `/api/documents/${pick.document.id}/post`);
  const rd3 = await api('GET', `/api/plan/room?room_id=${room.id}`);
  const after = rd3.racks.flatMap((k) => k.levels.flatMap((l) => l.cells)).find((c) => c.id === c1.id);
  assert(after.qty === 53, `katakda ${after.qty} (65 - 10 A - 2 B)`);
  b1 = (await balOf(p1.id));
  assert(b1.find((b) => !b.location_id)?.qty === 50, `umumiyga 10 qaytdi: ${b1.find((b) => !b.location_id)?.qty}`);

  // ---------------- 7. QOLDIG'I SAQLANISHI
  console.log('\n=== 7. QOLDIG‘I O‘ZGARMASIN ===');
  const t1 = (await balOf(p1.id)).reduce((s, b) => s + b.qty, 0);
  const t2 = (await balOf(p2.id)).reduce((s, b) => s + b.qty, 0);
  assert(t1 === 100, `A umumiy: ${t1}`);
  assert(t2 === 50, `B umumiy: ${t2}`);

  // ---------------- 8. TOZALASH
  console.log('\n=== 8. TOZALASH ===');
  for (const id of [pick.document.id, pl2.document.id, pl.document.id, rec.document.id].reverse()) {
    try { await api('POST', `/api/documents/${id}/unpost`); } catch { /* noop */ }
  }
  await cleanup();
  for (const p of [p1, p2]) {
    const left = (await balOf(p.id)).reduce((s, b) => s + b.qty, 0);
    assert(left === 0, `${p.sku} tozalandi: ${left}`);
  }

  console.log(process.exitCode ? '\n  ! XATO BOR\n' : '\n  = JOYLASH OQIMI TO‘LIQ ISHLADI\n');
})().catch((e) => { console.error('XATO:', e.message); process.exit(1); });
