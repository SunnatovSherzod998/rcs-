'use strict';
/**
 * ELEKTRON TOVARLAR seed / Демо электроника
 * Faqat mahsulotlarni qo'shadi (hujjatsiz).
 */
const BASE = process.env.BASE || 'http://localhost:3001';
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
  const catIds = {};
  for (const [code, uz, ru] of [
    ['EL', 'Elektronika', 'Электроника'],
    ['TL', 'Telefonlar', 'Телефоны'],
    ['NB', 'Noutbuklar', 'Ноутбуки'],
    ['TV', 'Televizorlar', 'Телевизоры'],
  ]) {
    catIds[code] = (await ensure('categories', 'code', { code, name_uz: uz, name_ru: ru })).id;
  }

  // brendlar
  const B = {};
  for (const [code, uz, ru, country] of [
    ['SAM', 'Samsung', 'Samsung', 'KR'], ['LG', 'LG', 'LG', 'KR'], ['XIA', 'Xiaomi', 'Xiaomi', 'CN'],
    ['APL', 'Apple', 'Apple', 'US'], ['HP', 'HP', 'HP', 'US'], ['ASUS', 'Asus', 'Asus', 'TW'],
    ['SONY', 'Sony', 'Sony', 'JP'], ['LENV', 'Lenovo', 'Lenovo', 'CN'],
  ]) {
    B[code] = (await ensure('brands', 'code', { code, name_uz: uz, name_ru: ru, country })).id;
  }

  const U = {};
  for (const u of await api('GET', '/api/catalogs/units/options')) U[u.code] = u.id;

  const PRODUCTS = [
    // [sku, barcode, uz, ru, category, brand, cost, sale, min_stock]
    ['PHN-S24', '8801234567801', 'Samsung Galaxy S24 256GB', 'Samsung Galaxy S24 256GB', 'TL', 'SAM', 9_800_000, 11_500_000, 5],
    ['PHN-S23F', '8801234567802', 'Samsung Galaxy S23 FE', 'Samsung Galaxy S23 FE', 'TL', 'SAM', 5_400_000, 6_300_000, 8],
    ['PHN-A54', '8801234567803', 'Samsung Galaxy A54 128GB', 'Samsung Galaxy A54 128GB', 'TL', 'SAM', 3_400_000, 4_100_000, 10],
    ['PHN-X13', '6941234567804', 'Xiaomi 13T 256GB', 'Xiaomi 13T 256GB', 'TL', 'XIA', 5_900_000, 7_000_000, 8],
    ['PHN-RN12', '6941234567805', 'Xiaomi Redmi Note 12', 'Xiaomi Redmi Note 12', 'TL', 'XIA', 2_300_000, 2_800_000, 15],
    ['PHN-IP15', '0194252603315', 'Apple iPhone 15 128GB', 'Apple iPhone 15 128GB', 'TL', 'APL', 10_500_000, 12_300_000, 5],
    ['PHN-IP14', '0194252603316', 'Apple iPhone 14 128GB', 'Apple iPhone 14 128GB', 'TL', 'APL', 8_200_000, 9_600_000, 6],
    ['PHN-LGK62', '8801234567807', 'LG K62 64GB', 'LG K62 64GB', 'TL', 'LG', 1_900_000, 2_300_000, 10],
    ['NB-HPP15', '8881234567808', 'HP Pavilion 15 i5 8/512', 'HP Pavilion 15 i5 8/512', 'NB', 'HP', 8_900_000, 10_500_000, 4],
    ['NB-ASU557', '4718017123456', 'Asus VivoBook 15 Ryzen 5', 'Asus VivoBook 15 Ryzen 5', 'NB', 'ASUS', 7_600_000, 9_000_000, 4],
    ['NB-LENIDEA', '0196385312345', 'Lenovo IdeaPad 3 Ryzen 7', 'Lenovo IdeaPad 3 Ryzen 7', 'NB', 'LENV', 9_200_000, 10_900_000, 3],
    ['TV-S55Q', '8801234567812', 'Samsung QLED 55" 4K', 'Samsung QLED 55" 4K', 'TV', 'SAM', 9_900_000, 11_800_000, 3],
    ['TV-LG55O', '8801234567813', 'LG OLED 55" 4K', 'LG OLED 55" 4K', 'TV', 'LG', 13_500_000, 15_900_000, 2],
    ['TV-SONY50', '4548736130212', 'Sony Bravia 50" 4K', 'Sony Bravia 50" 4K', 'TV', 'SONY', 8_400_000, 9_900_000, 3],
    ['EL-SB-S', '8801234567820', 'Samsung Quloqchin Galaxy Buds', 'Samsung Наушники Galaxy Buds', 'EL', 'SAM', 850_000, 1_100_000, 20],
    ['EL-PD-A20', '0194252480580', 'Apple Powerbank 20000mAh', 'Apple Повербанк 20000mAh', 'EL', 'APL', 450_000, 590_000, 25],
    ['EL-CH-X65', '6941234567822', 'Xiaomi Zaryadka 65W', 'Xiaomi Зарядка 65W', 'EL', 'XIA', 180_000, 250_000, 40],
    ['EL-KB-MCH', '0194252480581', 'Mexanik klaviatura RGB', 'Механическая клавиатура RGB', 'EL', 'LG', 520_000, 690_000, 15],
  ];

  let n = 0;
  for (const [sku, bc, uz, ru, cat, brand, cost, sale, min] of PRODUCTS) {
    await ensure('products', 'sku', {
      sku, barcode: bc, name_uz: uz, name_ru: ru,
      category_id: catIds[cat], brand_id: B[brand], unit_id: U.DONA,
      min_stock: min, cost_price: cost, sale_price: sale,
      weight: 0.5, description: 'Elektron tovar',
    });
    n++;
  }
  console.log('✓ Elektron tovarlar qo‘shildi:', n);
})().catch((e) => { console.error('XATO:', e.message); process.exit(1); });
