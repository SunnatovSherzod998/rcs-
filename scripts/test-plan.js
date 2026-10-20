'use strict';
/**
 * 2D BINO REJASI — to'liq sinov (план здания)
 *   1-qavat: xonalar  →  2-qavat: stellaj/katak  →  3-qavat: tovar kartasi
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
const UZ = () => true;
function assert(c, l, e = '') { console.log(c ? '  OK   ' + l : '  FAIL ' + l + ' ' + e); if (!c) process.exitCode = 1; }

(async () => {
  const d = await api('POST', '/api/auth/login', { login: 'admin', password: process.env.ADMIN_PASSWORD || 'ADMIN' });
  token = d.token;
  const today = new Date().toISOString().slice(0, 10);
  const NOTE = 'PLAN-TEST';
  console.log('OK Kirildi');

  const whs = await api('GET', '/api/catalogs/warehouses/options');
  const main = whs.find((w) => w.code === 'MAIN');

  // ---------------- 1. Reja
  console.log('\n=== 1. REJA QURISH ===');
  for (const w of whs) {
    const r = await api('POST', '/api/plan/build', {
      warehouse_id: w.id, cols: 3, rooms: 6, racks_per_room: 3, levels: 2, slots: 4,
    });
    assert(r.rooms === 6 && r.racks === 18 && r.cells === 144, `${w.code}: 6 xona / 18 stellaj / 144 katak`);
  }

  // ---------------- 2. Xonalar
  console.log('\n=== 2. XONALAR (1-qavat) ===');
  for (const w of whs) {
    const p = await api('GET', `/api/plan/rooms?warehouse_id=${w.id}`);
    assert(p.rooms.length === 6, `${w.code}: ${p.rooms.length} xona`);
    assert(p.rooms[0].kind === 'RECEIVING', `${w.code}: 1-xona = Qabul qilish`);
    assert(p.rooms[5].kind === 'SHIPPING', `${w.code}: 6-xona = Yuborish`);
    assert(p.rooms.some((r) => r.kind === 'QUARANTINE'), `${w.code}: Karantin bor`);
    assert(p.rooms.some((r) => r.kind === 'COOLING'), `${w.code}: Sovuq xona bor`);
    assert(new Set(p.rooms.map((r) => r.pos_x)).size === 3, `${w.code}: 3 ustun`);
    assert(p.grid.cols >= 3 && p.grid.rows >= 2, `${w.code}: reja ${p.grid.cols}×${p.grid.rows}`);
  }
  console.log('  turlar: ' + (await api('GET', '/api/plan/kinds')).kinds.map((k) => k.value).join(', '));

  // ---------------- 3. Xona ichi
  console.log('\n=== 3. XONA ICHI (2-qavat) ===');
  const plan = await api('GET', `/api/plan/rooms?warehouse_id=${main.id}`);
  const room = plan.rooms.find((r) => r.kind === 'STORAGE');
  const rd = await api('GET', `/api/plan/room?room_id=${room.id}`);
  assert(rd.racks.length === 3, `3 stellaj: ${rd.racks.length}`);
  assert(rd.racks.every((k) => k.levels.length === 2), 'har bir stellajda 2 qavat');
  const cells = rd.racks.flatMap((k) => k.levels.flatMap((l) => l.cells));
  assert(cells.length === 24, `24 katak: ${cells.length}`);
  assert(cells[0].code.startsWith(room.code), `katak kodi: ${cells[0].code}`);
  console.log('  ' + rd.racks[0].code + ' → ' + cells.slice(0, 4).map((c) => c.code.split('-').slice(-1)[0]).join(' '));

  // ---------------- 4. Joylash (izolyatsiya)
  console.log('\n=== 4. TOVARNI JOYLASH ===');
  const TSKU = 'PLAN-TEST-1';
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

  const f = (await api('GET', `/api/catalogs/products?q=${TSKU}`)).rows.find((x) => x.sku === TSKU);
  const prod = f || await api('POST', '/api/catalogs/products', {
    sku: TSKU, name_uz: 'Plan test', name_ru: 'Тест плана', cost_price: 500, sale_price: 800, min_stock: 2,
  });

  // 1) kirim
  const rec = await api('POST', '/api/documents', {
    type: 'RECEIPT', date: today, warehouse_id: main.id, note: NOTE,
    lines: [{ product_id: prod.id, qty: 50, price: 500 }],
  });
  await api('POST', `/api/documents/${rec.document.id}/post`);
  let bal = (await api('GET', `/api/register/stock/balances?product_id=${prod.id}&warehouse_id=${main.id}`)).rows;
  assert(bal[0].qty === 50, `kirim: ${bal[0]?.qty}`);

  // 2) xona ichida joylash
  const freeCell = cells.find((c) => !c.items || !c.items.length);
  const pl = await api('POST', '/api/documents', {
    type: 'PLACEMENT', date: today, warehouse_id: main.id, note: NOTE,
    lines: [{ product_id: prod.id, location_id: freeCell.id, qty: 30, price: 0 }],
  });
  await api('POST', `/api/documents/${pl.document.id}/post`);
  const rd2 = await api('GET', `/api/plan/room?room_id=${room.id}`);
  const placed = rd2.racks.flatMap((k) => k.levels.flatMap((l) => l.cells))
    .find((c) => c.items?.some((i) => i.product_id === prod.id));
  assert(placed && placed.qty === 30, `xonada: ${placed?.qty} dona (${placed?.code})`);
  assert(placed.items[0].image_url !== undefined, 'rasm maydoni keldi');
  console.log(`  ${placed.code}: 30 dona, SKU ${placed.items[0].sku}, rasm ${placed.items[0].image_url ? 'bor' : 'yo‘q'}`);

  // 3) xona statistikasi
  assert(rd2.summary.used >= 1, `xona: ${rd2.summary.used} band katak`);
  assert(rd2.summary.qty >= 30, `xona miqdori: ${rd2.summary.qty}`);

  // ---------------- 5. Tovar kartasi
  console.log('\n=== 5. TOVAR KARTASI (rasm bilan) ===');
  const card = await api('GET', `/api/plan/product?product_id=${prod.id}`);
  assert(card.product.sku === TSKU, 'SKU');
  assert(card.totals.qty === 50, `umumiy: ${card.totals.qty}`);
  assert(card.totals.avg_cost === 500, `o‘rt. tannarx: ${card.totals.avg_cost}`);
  assert(card.totals.potential_profit === 15000, `potensial foyda: ${card.totals.potential_profit}`);
  assert(card.placement.length >= 1, `joylashuv: ${card.placement.length}`);
  const inRoom = card.placement.find((p) => p.room_id);
  assert(inRoom, 'xona ko‘rsatilgan');
  if (inRoom) console.log(`  ${inRoom.warehouse_code} / ${inRoom.room_code} / ${inRoom.rack_code} / ${inRoom.location_code} = ${inRoom.qty}`);
  assert(card.movements.length > 0, `harakatlar: ${card.movements.length}`);

  // ---------------- 6. Rasm
  console.log('\n=== 6. RASM ===');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await api('POST', '/api/plan/upload', { image: png, product_id: prod.id });
  assert(up.url.startsWith('/uploads/'), 'URL: ' + up.url);
  const res = await fetch(BASE + up.url);
  assert(res.status === 200 && res.headers.get('content-type') === 'image/png', 'rasm 200 + PNG');
  const chk = (await api('GET', `/api/catalogs/products?q=${TSKU}`)).rows[0];
  assert(chk.image_url === up.url, 'katalogga saqlandi');
  const card2 = await api('GET', `/api/plan/product?product_id=${prod.id}`);
  assert(card2.image === up.url, 'kartada rasm ko‘rinmoqda');

  const bad1 = await api('POST', '/api/plan/upload', { image: 'x' }).then(() => null).catch((e) => e.message);
  assert(bad1, 'noto‘g‘ri format rad etiladi');
  const bad2 = await api('POST', '/api/plan/upload', { image: 'data:text/html;base64,PGI+' }).then(() => null).catch((e) => e.message);
  assert(bad2, 'HTML rad etiladi');

  // ---------------- 7. Filtrlar
  console.log('\n=== 7. FILTRLAR ===');
  const st = await api('GET', `/api/plan/rooms?warehouse_id=${main.id}&kind=STORAGE`);
  assert(st.rooms.every((r) => r.kind === 'STORAGE') && st.rooms.length === 2, `STORAGE: ${st.rooms.length}`);
  const occ = await api('GET', `/api/plan/room?room_id=${room.id}&only_occupied=1`);
  assert(occ.summary.used === rd2.summary.used, `faqat to‘langan: ${occ.summary.used}`);
  const all = await api('GET', `/api/plan/room?room_id=${room.id}`);
  assert(all.summary.cells === 24, `xona kataklari: ${all.summary.cells}`);
  const sr = await api('GET', `/api/plan/rooms?warehouse_id=${main.id}&q=102`);
  assert(sr.rooms.length >= 1, `qidiruv "102": ${sr.rooms.length} xona`);

  // ---------------- 8. Tozalash
  console.log('\n=== 8. TOZALASH ===');
  await api('POST', `/api/documents/${pl.document.id}/unpost`);
  await api('POST', `/api/documents/${rec.document.id}/unpost`);
  await cleanup();
  bal = (await api('GET', `/api/register/stock/balances?product_id=${prod.id}&warehouse_id=${main.id}`)).rows;
  assert(bal.every((b) => b.qty === 0) || bal.length === 0, 'qoldiq tozalandi');

  console.log(process.exitCode ? '\n  ! XATO BOR\n' : '\n  = 2D BINO REJASI TO‘LIQ ISHLADI\n');
})().catch((e) => { console.error('XATO:', e.message); process.exit(1); });
