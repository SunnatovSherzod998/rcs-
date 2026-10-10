'use strict';
/**
 * DEMO ma'lumotlarini yuklash / Загрузка демо-данных
 * Namuna kataloglar, omborlar, kirim-chiqim hujjatlari.
 */
const BASE = process.env.BASE || 'http://localhost:3000';
let token = '';

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${j?.error?.message || ''}`);
  return j.data;
}

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

/** Katalog yozuvini `code` (yoki `sku`) bo'yicha topadi; yo'q bo'lsa yaratadi. */
async function ensure(cat, keyField, data) {
  try {
    const found = await api('GET', `/api/catalogs/${cat}?q=${encodeURIComponent(data[keyField])}&limit=5`);
    const exact = found.rows.find((r) => String(r[keyField]) === String(data[keyField]));
    if (exact) return exact;
    return await api('POST', `/api/catalogs/${cat}`, data);
  } catch {
    return await api('POST', `/api/catalogs/${cat}`, data);
  }
}

(async () => {
  await api('POST', '/api/auth/login', { login: 'admin', password: 'admin' }).then((d) => { token = d.token; });
  console.log('✓ Kirildi');

  // toifalar
  const CATS = [
    ['EL', 'Elektronika', 'Электроника'],
    ['BT', 'Uy-ro‘zg‘ol', 'Бытовая техника'],
    ['ST', 'Qurilish', 'Строительство'],
    ['KL', 'Kiyim', 'Одежда'],
    ['DR', 'Dorilar', 'Медикаменты'],
  ];
  const catIds = {};
  for (const [code, uz, ru] of CATS) {
    const r = await ensure('categories', 'code', { code, name_uz: uz, name_ru: ru });
    catIds[code] = r.id;
  }
  console.log('✓ Toifalar:', Object.keys(catIds).length);

  // brendlar
  const BRANDS = [['SAM', 'Samsung', 'Samsung'], ['LG', 'LG', 'LG'], ['SONY', 'Sony', 'Sony'],
    ['PHIL', 'Philips', 'Philips'], ['BOSCH', 'Bosch', 'Bosch'], ['MAC', 'Makita', 'Makita']];
  for (const [code, uz, ru] of BRANDS) {
    await ensure('brands', 'code', { code, name_uz: uz, name_ru: ru, country: 'KR' });
  }
  console.log('✓ Brendlar:', BRANDS.length);

  // omborlar
  const WH = [
    ['MAIN', 'Markaziy ombor', 'Центральный склад', 'STORE', 'Toshkent, Sergeli', 0],
    ['FIL1', 'Filial 1 (Chilonzor)', 'Филиал 1 (Чиланзар)', 'BRANCH', 'Toshkent, Chilonzor', 0],
    ['FIL2', 'Filial 2 (Yunusobod)', 'Филиал 2 (Юнусабод)', 'BRANCH', 'Toshkent, Yunusobod', 0],
  ];
  const whIds = {};
  for (const [code, uz, ru, kind, addr, neg] of WH) {
    const r = await ensure('warehouses', 'code', { code, name_uz: uz, name_ru: ru, kind, address: addr, phone: '+998 71 000 00 00', is_negative_allowed: neg });
    whIds[code] = r.id;
  }
  // joylashuvlar: endi har bir joy xonaga bog'lanadi, shuning uchun
  // to'g'ridan-to'g'ri "xonasiz" zona/stellaj emas — bino rejasi quriladi
  let roomCount = 0, cellCount = 0;
  for (const code of Object.keys(whIds)) {
    const r = await api('POST', '/api/plan/build', {
      warehouse_id: whIds[code], cols: 3, rooms: 6, racks_per_room: 3, levels: 2, slots: 4,
    });
    roomCount += r.rooms;
    cellCount += r.cells;
  }
  console.log('✓ Omborlar:', WH.length, '| xona:', roomCount, '| yacheyka:', cellCount);

  // kontragentlar
  const CP = [
    ['SUP1', 'O‘zDStroy Savdo', 'ООО «УзДСтрой Трейд»', 'SUPPLIER', '201243567'],
    ['SUP2', 'Samsung Distributor', 'Дистрибьютор Samsung', 'SUPPLIER', '309876543'],
    ['SUP3', 'Global Electronics', 'Global Electronics LLC', 'SUPPLIER', '415566777'],
    ['CUS1', 'Xo‘jalik do‘konlari', 'Хозяйственные магазины', 'CUSTOMER', '112233445'],
    ['CUS2', 'Qurilish kompaniyasi', 'Строительная компания', 'CUSTOMER', '556677889'],
    ['CUS3', 'Alisher savdo', 'Алишер Трейд', 'CUSTOMER', '667788990'],
  ];
  const cpIds = {};
  for (const [code, uz, ru, kind, tax] of CP) {
    const r = await ensure('counterparties', 'code', { code, name_uz: uz, name_ru: ru, kind, tax_id: tax,
      phone: '+998 90 ' + (100 + rnd(899)) + ' ' + (10 + rnd(89)) + ' ' + (10 + rnd(89)),
      email: code.toLowerCase() + '@example.uz',
      address: 'Toshkent', payment_terms: '14 kun',
    });
    cpIds[code] = r.id;
  }
  console.log('✓ Kontragentlar:', CP.length);

  // xodimlar
  const EM = [['EMP1', 'Alisher Karimov', 'Алишер Каримов', 'Ombor mudiri'],
    ['EMP2', 'Nodira Yusupova', 'Нодира Юсупова', 'Buxgalter'],
    ['EMP3', 'Sardor Toshmatov', 'Сардор Тошматов', 'Ombor mudiri']];
  for (const [code, uz, ru, pos] of EM) {
    await ensure('employees', 'code', { code, name_uz: uz, name_ru: ru, position: pos, warehouse_id: whIds.MAIN });
  }
  console.log('✓ Xodimlar:', EM.length);

  // tovarlar
  const U = {};
  for (const u of await api('GET', '/api/catalogs/units/options')) U[u.code] = u.id;
  const B = {};
  for (const b of await api('GET', '/api/catalogs/brands/options')) B[b.code] = b.id;

  const PRODUCTS = [
    ['TV-S55', '8901234567890', 'Samsung Smart TV 55"', 'Samsung Smart TV 55"', 'EL', 'SAM', 4_500_000, 5_400_000, 3, 20, 18],
    ['TV-S43', '8901234567891', 'Samsung Smart TV 43"', 'Samsung Smart TV 43"', 'EL', 'SAM', 3_200_000, 3_900_000, 3, 15, 12],
    ['TV-LG55', '8901234567892', 'LG OLED TV 55"', 'LG OLED TV 55"', 'EL', 'LG', 8_900_000, 10_800_000, 2, 8, 15],
    ['FR-SM', '8901234567893', 'Samsung Muzlatgich 300L', 'Samsung Холодильник 300л', 'BT', 'SAM', 3_800_000, 4_650_000, 2, 6, 9],
    ['PR-SM', '8901234567894', 'Samsung Kirish mashinasi 9kg', 'Samsung Стиральная машина 9кг', 'BT', 'SAM', 1_950_000, 2_400_000, 3, 8, 12],
    ['MW-SM', '8901234567895', 'Samsung Mikroto‘lqinli pech', 'Samsung Микроволновая печь', 'BT', 'SAM', 720_000, 890_000, 4, 10, 10],
    ['BT-PH', '8901234567896', 'Philips Elektr qaynoq', 'Philips Электрочайник', 'BT', 'PHIL', 320_000, 420_000, 8, 25, 8],
    ['DR-BM', '8901234567897', 'Bosch Peroralik arralash', 'Bosch Перфоратор', 'ST', 'BOSCH', 1_450_000, 1_780_000, 3, 5, 4],
    ['DR-BS', '8901234567898', 'Bosch Shpritsa 850W', 'Bosch Болгарка 850Вт', 'ST', 'BOSCH', 890_000, 1_120_000, 3, 6, 5],
    ['TL-MK', '8901234567899', 'Makita Drel 18V', 'Makita Дрель 18В', 'ST', 'MAC', 1_650_000, 2_050_000, 2, 4, 3],
    ['EL-LB5', '8901234567900', 'LG Batareya 5000mAh', 'LG Аккумулятор 5000mAh', 'EL', 'LG', 380_000, 520_000, 10, 40, 15],
    ['EL-SN1', '8901234567901', 'Sony Qoshimcha quti', 'Sony Аксессуар', 'EL', 'SONY', 180_000, 260_000, 5, 10, 4],
    ['BT-SN2', '8901234567902', 'Samsung Blender', 'Samsung Блендер', 'BT', 'SAM', 540_000, 690_000, 5, 12, 8],
    ['ST-CE1', '8901234567903', 'Sement M-400, 50kg', 'Цемент М-400, 50кг', 'ST', null, 78_000, 95_000, 20, 200, 100],
    ['ST-GP1', '8901234567904', 'Gipsokarton 12.5mm', 'Гипсокартон 12.5мм', 'ST', null, 62_000, 78_000, 25, 300, 150],
    ['ST-PL1', '8901234567905', 'Bo‘yq (oq) 10L', 'Краска (белая) 10л', 'ST', null, 240_000, 310_000, 10, 50, 25],
  ];
  const prodIds = [];
  for (const [sku, bc, uz, ru, cat, brand, cost, sale, min, pack] of PRODUCTS) {
    const r = await ensure('products', 'sku', {
      sku, barcode: bc, name_uz: uz, name_ru: ru,
      category_id: catIds[cat], brand_id: brand ? B[brand] : null, unit_id: U.DONA,
      min_stock: min, cost_price: cost, sale_price: sale,
      weight: +(rnd(20) / 10 + 0.5).toFixed(1),
      description: 'Demo tovarli',
    });
    prodIds.push({ id: r.id, cost, sale, min, pack });
  }
  console.log('✓ Tovarlar:', prodIds.length);

  // hujjatlar
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };

  // 1) Boshlang'ich qoldiq
  const openLines = prodIds.map((p) => ({
    product_id: p.id, qty: p.pack, price: p.cost,
  }));
  const openDoc = await api('POST', '/api/documents', {
    type: 'OPENING', date: d(45), warehouse_id: whIds.MAIN, note: 'Boshlang‘ich qoldiq (demo)',
    lines: openLines,
  });
  await api('POST', `/api/documents/${openDoc.document.id}/post`);
  console.log('✓ Boshlang‘ich qoldiq: №' + openDoc.document.number);

  // 2) Xaridlar (kirim)
  for (let i = 0; i < 6; i++) {
    const lines = [...prodIds].sort(() => Math.random() - 0.5).slice(0, 5 + rnd(6))
      .map((p) => ({ product_id: p.id, qty: 2 + rnd(12), price: Math.round(p.cost * (0.95 + Math.random() * 0.12)) }));
    const doc = await api('POST', '/api/documents', {
      type: 'RECEIPT', date: d(40 - i * 5), warehouse_id: i % 2 ? whIds.MAIN : whIds.FIL1,
      counterparty_id: cpIds[pick(['SUP1', 'SUP2', 'SUP3'])],
      note: 'Xarid (demo)', lines,
    });
    await api('POST', `/api/documents/${doc.document.id}/post`);
  }
  console.log('✓ Kirim hujjatlari: 6');

  // 3) Sotuvlar
  for (let i = 0; i < 10; i++) {
    const lines = [...prodIds].sort(() => Math.random() - 0.5).slice(0, 2 + rnd(5))
      .map((p) => ({ product_id: p.id, qty: 1 + rnd(4), price: p.sale }));
    const doc = await api('POST', '/api/documents', {
      type: 'ISSUE', base_type: 'SALE', reason: 'SALE', date: d(30 - i * 3),
      warehouse_id: i % 3 ? whIds.MAIN : whIds.FIL1,
      counterparty_id: cpIds[pick(['CUS1', 'CUS2', 'CUS3'])],
      employee_id: null, note: 'Sotuv (demo)', lines,
    });
    try { await api('POST', `/api/documents/${doc.document.id}/post`); } catch { /* qoldiq yetarli emas */ }
  }
  console.log('✓ Sotuv hujjatlari: 10');

  // 4) Ko'chirish
  for (let i = 0; i < 3; i++) {
    const lines = [...prodIds].sort(() => Math.random() - 0.5).slice(0, 3)
      .map((p) => ({ product_id: p.id, qty: 1 + rnd(3), price: p.cost }));
    const doc = await api('POST', '/api/documents', {
      type: 'TRANSFER', date: d(20 - i * 5),
      warehouse_id: whIds.MAIN, dest_warehouse_id: pick([whIds.FIL1, whIds.FIL2]),
      note: 'Filialga ko‘chirish (demo)', lines,
    });
    try { await api('POST', `/api/documents/${doc.document.id}/post`); } catch { /* skip */ }
  }
  console.log('✓ Ko‘chirish hujjatlari: 3');

  // 5) Yozib tashlash
  const wo = [...prodIds].slice(3, 6).map((p) => ({ product_id: p.id, qty: 1, price: p.cost }));
  const woDoc = await api('POST', '/api/documents', {
    type: 'ISSUE', base_type: 'WRITEOFF', reason: 'WRITEOFF', date: d(12),
    warehouse_id: whIds.MAIN, reason_note: 'Buzilgan', note: 'Yozib tashlash (demo)', lines: wo,
  });
  try { await api('POST', `/api/documents/${woDoc.document.id}/post`); } catch { /* skip */ }
  console.log('✓ Yozib tashlash: 1');

  // 6) Inventarizatsiya (farq bilan)
  const bal = await api('GET', `/api/register/stock/balances?warehouse_id=${whIds.MAIN}&limit=50`);
  const invLines = bal.rows.slice(0, 8).map((r) => {
    const real = Math.max(0, r.qty + (rnd(3) - 1) * 2);
    return { product_id: r.product_id, qty: real, qty_system: r.qty, price: r.avg_cost };
  });
  if (invLines.length) {
    const invDoc = await api('POST', '/api/documents', {
      type: 'INVENTORY', date: d(7), warehouse_id: whIds.MAIN, note: 'Oylik inventarizatsiya (demo)', lines: invLines,
    });
    await api('POST', `/api/documents/${invDoc.document.id}/post`);
    console.log('✓ Inventarizatsiya: 1 (farqli qatorlar: ' + invLines.filter((l) => l.qty !== l.qty_system).length + ')');
  }

  // 7) Qoralamalar (draft) — jurnalda ko'rinishi uchun
  await api('POST', '/api/documents', {
    type: 'RECEIPT', date: new Date().toISOString().slice(0, 10), warehouse_id: whIds.MAIN,
    counterparty_id: cpIds.SUP1, note: 'Kutilmoqda (qoralamа)',
    lines: [{ product_id: prodIds[0].id, qty: 5, price: prodIds[0].cost }],
  });
  console.log('✓ Qoralamа: 1');

  // 8) Tovarlarni xona kataklariga avtomatik joylash
  for (const code of Object.keys(whIds)) {
    const r = await api('POST', '/api/plan/warehouse/auto-place', { warehouse_id: whIds[code] });
    if (r.placed) console.log(`✓ Joylash · ${code}: ${r.placed} pozitsiya, ${r.rooms_used} xona`);
  }

  const counts = await api('GET', '/api/meta/counts');
  console.log('\n=== YAKUNIY HOLAT ===');
  console.log('  Tovarlar:     ' + counts.products);
  console.log('  Omborlar:     ' + counts.warehouses);
  console.log('  Joylashuvlar: ' + counts.locations);
  console.log('  Kontragentlar:' + counts.counterparties);
  console.log('  Hujjatlar:    ' + counts.documents + ' (qoralamа: ' + counts.drafts + ')');
  console.log('  Harakatlar:   ' + counts.movements);
  console.log('\n  Kirish: http://localhost:3000  (admin / admin)\n');
})().catch((e) => { console.error('\nXATO:', e.message); process.exit(1); });
