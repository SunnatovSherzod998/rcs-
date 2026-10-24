'use strict';
/**
 * Biznes-mantiq sinovi: login → katalog → kirim → проведение → qoldiq → chiqim
 */
const BASE = 'http://localhost:3000';
let token = '';

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

function assert(cond, label, extra = '') {
  if (cond) { console.log('  \u2713 ' + label); }
  else { console.error('  \u2717 FAIL: ' + label + ' ' + extra); process.exitCode = 1; }
}

(async () => {
  console.log('\n=== 1. LOGIN ===');
  let r = await api('POST', '/api/auth/login', { login: 'admin', password: process.env.ADMIN_PASSWORD || 'ADMIN' });
  assert(r.status === 200, 'admin kirish', JSON.stringify(r.json));
  token = r.json.data.token;

  r = await api('POST', '/api/auth/login', { login: 'admin', password: 'noto' + 'gri' });
  assert(r.status === 403, 'noto‘g‘ri parol rad etiladi');

  const savedToken = token; token = '';
  r = await api('GET', '/api/documents');
  assert(r.status === 401, 'hujjatlar 401 qaytaradi (himoya)', 'got ' + r.status);
  token = savedToken;

  console.log('\n=== 2. SPRAVOCHNIKI (kataloglar) ===');
  r = await api('GET', '/api/catalogs');
  assert(r.json.data.products, 'katalog deskriptorlari keldi');
  assert(r.json.data.products.fields.length > 10, 'nomenklatura maydonlari: ' + r.json.data.products.fields.length);

  const whAll = (await api('GET', '/api/catalogs/warehouses/options')).json.data;
  const wh = { main: whAll.find((w) => w.code === 'MAIN'), fil: whAll.find((w) => w.code === 'FIL1') };
  assert(wh.main && wh.fil, `omborlar: ${whAll.length} ta`);

  // izolyatsiya: testga xos SKU va toifa
  const TSKU = 'API-TEST-001';
  const NOTE = 'API-TEST';
  const cleanupDocs = async () => {
    // izolyatsiya: faqat testga tegishli SKU bilan bog'liq hujjatlar
    const byNote = (await api('GET', '/api/documents?limit=500')).json.data.rows
      .filter((x) => x.note === NOTE);
    const bySku = (await api('GET', `/api/documents?q=${encodeURIComponent(TSKU)}&limit=500`)).json.data.rows
      .filter((x) => x.note === NOTE || x.type);
    const seen = new Set();
    for (const doc of [...byNote, ...bySku]) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      try {
        if (doc.status === 'POSTED') await api('POST', `/api/documents/${doc.id}/unpost`);
        if (doc.status === 'DRAFT') await api('DELETE', '/api/documents/' + doc.id);
      } catch { /* noop */ }
    }
  };
  await cleanupDocs();

  const catExisting = (await api('GET', '/api/catalogs/categories?q=EL')).json.data.rows
    .find((x) => x.code === 'EL');
  r = catExisting
    ? { status: 200, json: { data: catExisting } }
    : await api('POST', '/api/catalogs/categories', { name_uz: 'Elektronika', name_ru: 'Электроника', code: 'EL' });
  const catId = r.json.data?.id;
  assert(r.status === 200, 'toifa yaratildi', JSON.stringify(r.json));

  const prodOld = (await api('GET', '/api/catalogs/products?q=' + TSKU)).json.data.rows
    .find((x) => x.sku === TSKU);
  if (prodOld) {
    // avvalgi qoldiqni tozalash
    const bals = (await api('GET', `/api/register/stock/balances?product_id=${prodOld.id}`)).json.data.rows;
    for (const b of bals.filter((x) => x.qty !== 0)) {
      const iss = await api('POST', '/api/documents', {
        type: 'ISSUE', base_type: 'WRITEOFF', date: new Date().toISOString().slice(0, 10),
        warehouse_id: b.warehouse_id, note: NOTE, lines: [{ product_id: b.product_id, qty: b.qty, price: 0 }],
      });
      await api('POST', `/api/documents/${iss.json.data.document.id}/post`);
    }
    await cleanupDocs();
  }

  const unit0 = (await api('GET', '/api/catalogs/units/options')).json.data[0].id;
  const payload = {
    sku: TSKU, barcode: '9988776655443', name_uz: 'Test televizor', name_ru: 'Тестовый телевизор',
    category_id: catId, unit_id: unit0, min_stock: 5, cost_price: 100, sale_price: 150,
  };
  const exist = (await api('GET', `/api/catalogs/products?q=${TSKU}`)).json.data.rows
    .find((x) => x.sku === TSKU);
  r = exist
    ? { status: 200, json: { data: exist } }
    : await api('POST', '/api/catalogs/products', payload);
  const prodId = r.json.data?.id;
  assert(r.status === 200 && prodId, 'tovar tayyor (id=' + prodId + ')', JSON.stringify(r.json));

  r = await api('POST', '/api/catalogs/products', { name_uz: 'x', name_ru: 'y' });
  assert(r.status === 400, 'artikulsiz tovar rad etiladi (400)');

  r = await api('POST', '/api/catalogs/counterparties', { name_uz: 'Yetkazib beruvchi X', name_ru: 'Поставщик X', kind: 'SUPPLIER', tax_id: '123456789' });
  const cpId = r.json.data?.id;
  assert(r.status === 200, 'kontragent yaratildi');

  r = await api('GET', '/api/products-lookup/stock?code=' + TSKU + '&warehouse_id=' + wh.main.id);
  assert(r.status === 200 && r.json.data.product.sku === TSKU, 'SKU orqali qidirish');

  // barcha kataloglar: qidiruv + options + pagination ishlashi kerak
  const cats = ['currencies', 'warehouses', 'locations', 'categories', 'brands', 'units', 'products', 'counterparties', 'employees'];
  for (const c of cats) {
    r = await api('GET', `/api/catalogs/${c}/options?limit=2000`);
    assert(r.status === 200, `options: ${c}`, JSON.stringify(r.json).slice(0, 120));
    r = await api('GET', `/api/catalogs/${c}?limit=5&offset=0`);
    assert(r.status === 200, `list: ${c}`, JSON.stringify(r.json).slice(0, 120));
    r = await api('GET', `/api/catalogs/${c}?q=a&limit=5`);
    assert(r.status === 200, `qidiruv "a": ${c}`, JSON.stringify(r.json).slice(0, 160));
    r = await api('GET', `/api/catalogs/${c}?q=tv&limit=5`);
    assert(r.status === 200, `qidiruv "tv": ${c}`, JSON.stringify(r.json).slice(0, 160));
  }
  r = await api('GET', '/api/catalogs/products?q=Test');
  assert(r.json.data.rows.length >= 1, 'ko‘p maydonli qidiruv topdi (' + r.json.data.total + ')');

  console.log('\n=== 3. ДОКУМЕНТ: Приход (kirim) ===');
  r = await api('POST', '/api/documents', {
    type: 'RECEIPT', warehouse_id: wh.main.id, counterparty_id: cpId,
    date: '2026-09-01', note: NOTE,
    lines: [{ product_id: prodId, qty: 20, price: 100 }],
  });
  const docId = r.json.data?.document?.id;
  assert(r.status === 200, 'kirim hujjati yaratildi (DRAFT), id=' + docId, JSON.stringify(r.json));
  assert(r.json.data.document.status === 'DRAFT', 'holat: DRAFT');
  assert(r.json.data.document.total_amount === 2000, 'jami: 2000, got ' + r.json.data.document.total_amount);

  r = await api('GET', `/api/register/stock/balances?product_id=${prodId}`);
  assert(r.json.data.rows.length === 0, 'o‘tkazishdan oldin qoldiq = 0',
    JSON.stringify(r.json.data.rows.map((x) => x.qty)));

  r = await api('POST', `/api/documents/${docId}/post`);
  assert(r.status === 200, 'ПРОВЕДЕН', JSON.stringify(r.json).slice(0, 200));
  assert(r.json.data.document.status === 'POSTED', 'holat: POSTED');

  r = await api('GET', `/api/register/stock/balances?product_id=${prodId}`);
  assert(r.json.data.rows[0]?.qty === 20, 'qoldiq = 20 dona', JSON.stringify(r.json.data.rows[0]));
  assert(r.json.data.sum_amount === 2000, 'summa = 2000');

  r = await api('POST', `/api/documents/${docId}/post`);
  assert(r.status === 400, 'takror проведение rad etiladi');

  console.log('\n=== 4. ДОКУМЕНТ: Расход/Продажа (chiqim) ===');
  r = await api('POST', '/api/documents', {
    type: 'ISSUE', base_type: 'SALE', warehouse_id: wh.main.id, counterparty_id: cpId,
    date: '2026-09-05', reason: 'SALE', note: NOTE,
    lines: [{ product_id: prodId, qty: 5, price: 150 }],
  });
  const saleId = r.json.data.document.id;
  await api('POST', `/api/documents/${saleId}/post`);
  r = await api('GET', `/api/register/stock/balances?product_id=${prodId}`);
  assert(r.json.data.rows[0]?.qty === 15, 'qoldiq = 15 (20-5)');

  console.log('\n=== 5. MANFIY QOLDIQ NAZORATI ===');
  r = await api('POST', '/api/documents', {
    type: 'ISSUE', base_type: 'SALE', warehouse_id: wh.main.id, date: '2026-09-06', note: NOTE,
    lines: [{ product_id: prodId, qty: 9999, price: 150 }],
  });
  const badDoc = r.json.data.document.id;
  r = await api('POST', `/api/documents/${badDoc}/post`);
  assert(r.status === 500 || r.json.ok === false, 'manfiy qoldiq bloklandi');
  assert(/Отрицательный|отрицат/i.test(r.json.error?.message || ''), 'xato matni to‘g‘ri: ' + (r.json.error?.message || '').slice(0, 60));
  await api('DELETE', '/api/documents/' + badDoc);

  console.log('\n=== 6. INVENTARIZATSIYA (farq hisobi) ===');
  r = await api('POST', '/api/documents', {
    type: 'INVENTORY', warehouse_id: wh.main.id, date: '2026-09-10', note: NOTE,
    lines: [{ product_id: prodId, qty: 13, price: 100, qty_system: 15 }],
  });
  const invId = r.json.data.document.id;
  await api('POST', `/api/documents/${invId}/post`);
  r = await api('GET', `/api/register/stock/balances?product_id=${prodId}`);
  assert(r.json.data.rows[0]?.qty === 13, 'qoldiq = 13 (15 - 2 yo‘qotish)', JSON.stringify(r.json.data.rows[0]?.qty));

  console.log('\n=== 7. ПЕРЕМЕЩЕНИЕ (omborlar orasida) ===');
  r = await api('POST', '/api/documents', {
    type: 'TRANSFER', warehouse_id: wh.main.id, dest_warehouse_id: wh.fil.id, date: '2026-09-12', note: NOTE,
    lines: [{ product_id: prodId, qty: 4, price: 100 }],
  });
  const trId = r.json.data.document.id;
  await api('POST', `/api/documents/${trId}/post`);
  r = await api('GET', `/api/register/stock/balances?product_id=${prodId}`);
  const byWh = Object.fromEntries(r.json.data.rows.map((x) => [x.warehouse_name_ru, x.qty]));
  assert(byWh['Центральный склад'] === 9, 'markazda 9 (13-4)', JSON.stringify(byWh));
  assert(byWh['Филиал 1'] === 4, 'filialda 4', JSON.stringify(byWh));

  r = await api('POST', '/api/documents', {
    type: 'TRANSFER', warehouse_id: wh.main.id, dest_warehouse_id: wh.main.id, date: '2026-09-12',
    lines: [{ product_id: prodId, qty: 1, price: 100 }],
  });
  const badTr = r.json.data.document.id;
  r = await api('POST', `/api/documents/${badTr}/post`);
  assert(r.json.ok === false, 'bir xil omborga ko‘chirish rad etiladi');
  await api('DELETE', '/api/documents/' + badTr);

  console.log('\n=== 8. ОТМЕНА ПРОВЕДЕНИЯ ===');
  r = await api('POST', `/api/documents/${trId}/unpost`);
  assert(r.status === 200, 'проведение bekor qilindi');
  r = await api('GET', `/api/register/stock/balances?product_id=${prodId}`);
  const after = Object.fromEntries(r.json.data.rows.map((x) => [x.warehouse_name_ru, x.qty]));
  assert(after['Центральный склад'] === 13 && !after['Филиал 1'], 'qoldiq qaytildi: ' + JSON.stringify(after));

  r = await api('PUT', `/api/documents/${trId}`, { note: NOTE });
  assert(r.json.ok === true, 'bekor qilingan hujjat tahrirlanadi');

  console.log('\n=== 9. ВЗАИМОРАСЧЁТЫ (qarz) ===');
  r = await api('GET', '/api/register/debt/balances');
  const cpRow = r.json.data.find((x) => x.id === cpId);
  assert(Math.abs(cpRow.debt - (2000 - 750)) < 0.01, `qarz = 1250 (kirim 2000 - sotuv 750), got ${cpRow?.debt}`);

  console.log('\n=== 10. HISOBOTLAR ===');
  const reports = [
    '/api/reports/dashboard',
    '/api/reports/turnover?date_from=2026-09-01&date_to=2026-09-30',
    '/api/reports/profit?date_from=2026-09-01&date_to=2026-09-30',
    '/api/reports/sales?date_from=2026-09-01&date_to=2026-09-30',
    '/api/reports/purchases?date_from=2026-09-01&date_to=2026-09-30',
    '/api/reports/inventory-diff?date_from=2026-09-01&date_to=2026-09-30',
    '/api/reports/writeoff?date_from=2026-09-01&date_to=2026-09-30',
    '/api/register/stock/turnover?date_from=2026-09-01&date_to=2026-09-30',
    '/api/register/stock/below-min',
    '/api/register/stock/movements',
    `/api/register/stock/product-card?product_id=${prodId}`,
    '/api/meta/counts',
  ];
  for (const p of reports) {
    r = await api('GET', p);
    assert(r.status === 200 && r.json.ok, p.replace('/api/', '').split('?')[0]);
  }

  console.log('\n=== 11. EKSORT / IMPORT ===');
  const res = await fetch(BASE + '/api/export/balances', { headers: { Authorization: 'Bearer ' + token } });
  const csv = await res.text();
  assert(res.status === 200 && csv.includes(TSKU), 'CSV eksport (balances), ' + csv.split('\n').length + ' qator');

  console.log('\n=== 12. HUQUQLAR ===');
  // Parol siyosati: kuchsiz parollar rad etiladi
  r = await api('POST', '/api/users', { login: 'kassir', password: '1234', full_name: 'Kassir', role: 'CASHIER' });
  assert(r.status === 400 && r.json?.error?.code === 'PW_SHORT', 'qisqa parol rad etiladi', JSON.stringify(r.json));
  r = await api('POST', '/api/users', { login: 'kassir', password: '123456789012', full_name: 'Kassir', role: 'CASHIER' });
  assert(r.status === 400 && r.json?.error?.code === 'PW_ONLY_DIGITS', 'faqat sonli parol rad etiladi', JSON.stringify(r.json));
  r = await api('POST', '/api/users', { login: 'kassir', password: 'a1b2c3d45678', full_name: 'Kassir', role: 'CASHIER' });
  assert(r.status === 400 && r.json?.error?.code === 'PW_UPPERCASE', 'katta harfsiz parol rad etiladi', JSON.stringify(r.json));
  r = await api('POST', '/api/users', { login: 'kassir', password: 'A1B2C3D45678', full_name: 'Kassir', role: 'CASHIER' });
  assert(r.status === 200, 'siyosatga mos parol qabul qilindi', JSON.stringify(r.json));
  const adminToken = token;
  r = await api('POST', '/api/auth/login', { login: 'kassir', password: 'A1B2C3D45678' });
  token = r.json.data.token;
  r = await api('GET', '/api/users');
  assert(r.status === 403, 'kassir foydalanuvchilarni ko‘ra olmaydi (403)');
  r = await api('GET', '/api/catalogs/products');
  assert(r.status === 200, 'kassir katalogni ko‘ra oladi');
  r = await api('POST', '/api/documents/1/post');
  assert(r.status !== 403, 'kassir savdo hujjatini o‘tkazishi mumkin', JSON.stringify(r.json));
  r = await api('GET', '/api/salary/list');
  assert(r.status === 403, 'kassir ishchilar oyligini ko‘ra olmaydi (403)');
  token = adminToken;

  console.log('\n=== 13. TOZALASH ===');
  await cleanupDocs();
  const leftBal = (await api('GET', `/api/register/stock/balances?product_id=${prodId}`)).json.data.rows;
  assert(leftBal.every((b) => b.qty === 0) || leftBal.length === 0, 'test qoldig‘i tozalandi');
  // test foydalanuvchisini o'chirish (takror ishlash uchun)
  const users = (await api('GET', '/api/users')).json.data;
  const kassir = users.find((u) => u.login === 'kassir');
  if (kassir) await api('DELETE', '/api/users/' + kassir.id);
  console.log('  ✓ hujjatlar bekor qilindi, foydalanuvchi o‘chirildi');

  console.log('\n' + (process.exitCode ? '\u26a0 SINOVLARDA XATO BOR\n' : '\u2713 BARCHA SINOVLAR O\u2018TDI\n'));
})();

