'use strict';
/**
 * СПРАВОЧНИКИ / KATALOGLAR
 * Bitta umumiy mexanizm: har bir katalog uchun deskriptor (maydon tavsifi).
 * Frontend shakllarni shu deskriptorlardan avtomatik chizadi.
 */
const { all, get, run, buildWhere, tx } = require('../db');
const { bad, notFound } = require('../lib/http');

/** maydon turi: text | textarea | number | money | int | bool | select | date | ref */
const ROOM_KIND_OPTIONS = [
  { value: 'STORAGE', label: { uz: 'Saqlash', ru: 'Хранение' } },
  { value: 'RECEIVING', label: { uz: 'Qabul qilish', ru: 'Приёмка' } },
  { value: 'SHIPPING', label: { uz: 'Yuborish', ru: 'Отгрузка' } },
  { value: 'COOLING', label: { uz: 'Sovuq xona', ru: 'Холодильная' } },
  { value: 'QUARANTINE', label: { uz: 'Karantin', ru: 'Карантин' } },
  { value: 'BUFFER', label: { uz: 'Zaxira', ru: 'Буфер' } },
];

const CATALOGS = {
  currencies: {
    table: 'catalog_currencies',
    order: 'code',
    search: ['code', 'name_uz', 'name_ru'],
    label: { uz: 'Valyutalar', ru: 'Валюты' },
    fields: [
      { name: 'code', type: 'text', required: true, label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'rate', type: 'number', step: '0.0001', label: { uz: 'Kurs (1 = ? UZS)', ru: 'Курс (1 = ? UZS)' } },
      { name: 'is_base', type: 'bool', label: { uz: 'Asosiy valyuta', ru: 'Базовая валюта' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  warehouses: {
    table: 'catalog_warehouses',
    order: 'code',
    search: ['code', 'name_uz', 'name_ru', 'address'],
    label: { uz: 'Omborlar', ru: 'Склады' },
    fields: [
      { name: 'code', type: 'text', required: true, label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'kind', type: 'select', options: [
        { value: 'STORE', label: { uz: 'Ombor', ru: 'Склад' } },
        { value: 'BRANCH', label: { uz: 'Filial', ru: 'Филиал' } },
        { value: 'TRANSIT', label: { uz: 'Tranzit', ru: 'Транзит' } },
        { value: 'VIRTUAL', label: { uz: 'Virtual', ru: 'Виртуальный' } },
      ], label: { uz: 'Turi', ru: 'Тип' } },
      { name: 'address', type: 'text', label: { uz: 'Manzil', ru: 'Адрес' } },
      { name: 'phone', type: 'text', label: { uz: 'Telefon', ru: 'Телефон' } },
      { name: 'is_negative_allowed', type: 'bool', label: { uz: 'Manfiy qoldiqga ruxsat', ru: 'Разрешить отрицательный остаток' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  // Xonalar alohida katalog sifatida ro'yxatdan o'tadi — joylashuv shaklidagi
  // "Xona" maydoni (ref: 'rooms') shundan foydalanadi. O'chirish bloklanadi:
  // xona o'chirilsa uning stellaj/kataklari ham (ON DELETE CASCADE) o'chadi.
  rooms: {
    table: 'catalog_rooms',
    order: 'code',
    search: ['code', 'name_uz', 'name_ru'],
    label: { uz: 'Xonalar', ru: 'Комнаты' },
    noDelete: true,
    fields: [
      { name: 'warehouse_id', type: 'ref', ref: 'warehouses', required: true, label: { uz: 'Ombor', ru: 'Склад' } },
      { name: 'code', type: 'text', required: true, label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'kind', type: 'select', defaultValue: 'STORAGE', options: ROOM_KIND_OPTIONS, label: { uz: 'Turi', ru: 'Тип' } },
      { name: 'floor', type: 'int', label: { uz: 'Qavat', ru: 'Этаж' } },
      { name: 'temperature', type: 'number', step: '0.1', label: { uz: 'Harorat (°C)', ru: 'Температура (°C)' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  locations: {
    table: 'catalog_locations',
    order: 'warehouse_id, code',
    search: ['code', 'name_uz', 'name_ru'],
    label: { uz: 'Joylashuvlar', ru: 'Места хранения' },
    ref: { name: 'warehouse_id', ref: 'warehouses', required: true },
    fields: [
      { name: 'warehouse_id', type: 'ref', ref: 'warehouses', required: true, label: { uz: 'Ombor', ru: 'Склад' } },
      { name: 'room_id', type: 'ref', ref: 'rooms', dependsOn: 'warehouse_id', label: { uz: 'Xona', ru: 'Комната' },
        hint: { uz: 'omborni tanlang — xonalar avtomatik chiqadi', ru: 'выберите склад — комнаты подставятся сами' } },
      { name: 'code', type: 'text', required: true, label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'kind', type: 'select', defaultValue: 'CELL', options: [
        { value: 'CELL', label: { uz: 'Yacheyka', ru: 'Ячейка' } },
        { value: 'RACK', label: { uz: 'Stellaj', ru: 'Стеллаж' } },
        { value: 'SHELF', label: { uz: 'Teshik', ru: 'Полка' } },
        { value: 'ZONE', label: { uz: 'Zona', ru: 'Зона' } },
        { value: 'FLOOR', label: { uz: 'Pol', ru: 'Пол' } },
      ], label: { uz: 'Turi', ru: 'Тип' } },
      { name: 'level_no', type: 'int', label: { uz: 'Qavat', ru: 'Ярус' } },
      { name: 'pos', type: 'int', label: { uz: 'O‘rin', ru: 'Позиция' } },
      { name: 'capacity', type: 'number', label: { uz: 'Sig‘imi (0 = cheksiz)', ru: 'Ёмкость (0 = без лимита)' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
    // yangi joy har doim xonaga bog'lanadi; eski "xonasiz" joylar tahrirlanadi
    validate(data, { isNew, row }) {
      if (!isNew && data.room_id === undefined) return;   // qisman yangilash
      if (data.room_id === null || data.room_id === undefined) {
        throw bad('Xona tanlang (omborni tanlang yoki «＋ Ombor yaratish») / Выберите комнату (выберите склад или «＋ Создать склад»)', 'REQUIRED');
      }
      const room = get('SELECT id, warehouse_id FROM catalog_rooms WHERE id=?', Number(data.room_id));
      if (!room) throw bad('Xona topilmadi / Комната не найдена');
      const whId = data.warehouse_id ?? row?.warehouse_id;
      if (whId != null && Number(room.warehouse_id) !== Number(whId)) {
        throw bad('Xona tanlangan omborga tegishli emas / Комната принадлежит другому складу');
      }
    },
  },

  categories: {
    table: 'catalog_categories',
    order: 'name_ru',
    search: ['code', 'name_uz', 'name_ru'],
    label: { uz: 'Toifalar', ru: 'Категории' },
    tree: true,
    fields: [
      { name: 'parent_id', type: 'ref', ref: 'categories', label: { uz: 'Yuqori toifa', ru: 'Родительская категория' } },
      { name: 'code', type: 'text', label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', required: true, label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', required: true, label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  brands: {
    table: 'catalog_brands',
    order: 'name_ru',
    search: ['code', 'name_uz', 'name_ru', 'country'],
    label: { uz: 'Brendlar', ru: 'Бренды' },
    fields: [
      { name: 'code', type: 'text', label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', required: true, label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', required: true, label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'country', type: 'text', label: { uz: 'Davlat', ru: 'Страна' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  units: {
    table: 'catalog_units',
    order: 'code',
    search: ['code', 'name_uz', 'name_ru'],
    label: { uz: 'O‘lchov birliklari', ru: 'Единицы измерения' },
    fields: [
      { name: 'code', type: 'text', required: true, label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'ratio', type: 'number', step: '0.0001', label: { uz: 'Bazisga nisbatan', ru: 'К базовой' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  products: {
    table: 'catalog_products',
    order: 'sku',
    search: ['sku', 'barcode', 'name_uz', 'name_ru', 'account'],
    label: { uz: 'Nomenklatura', ru: 'Номенклатура' },
    fields: [
      { name: 'sku', type: 'text', required: true, label: { uz: 'Artikul', ru: 'Артикул' } },
      { name: 'barcode', type: 'text', label: { uz: 'Barcode', ru: 'Штрих-код' }, hint: { uz: 'Skaner avtomatik to‘ldiradi', ru: 'Заполняется сканером' } },
      { name: 'name_uz', type: 'text', required: true, label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', required: true, label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'category_id', type: 'ref', ref: 'categories', label: { uz: 'Toifa', ru: 'Категория' } },
      { name: 'brand_id', type: 'ref', ref: 'brands', label: { uz: 'Brend', ru: 'Бренд' } },
      { name: 'unit_id', type: 'ref', ref: 'units', label: { uz: 'Birlik', ru: 'Единица' } },
      { name: 'country', type: 'text', label: { uz: 'Davlat', ru: 'Страна' } },
      { name: 'min_stock', type: 'number', label: { uz: 'Min. qoldiq', ru: 'Мин. остаток' } },
      { name: 'max_stock', type: 'number', label: { uz: 'Maks. qoldiq', ru: 'Макс. остаток' } },
      { name: 'weight', type: 'number', step: '0.001', label: { uz: 'Og‘irligi (kg)', ru: 'Вес (кг)' } },
      { name: 'length', type: 'number', step: '0.001', label: { uz: 'Uzunligi (m)', ru: 'Длина (м)' } },
      { name: 'width', type: 'number', step: '0.001', label: { uz: 'Kengligi (m)', ru: 'Ширина (м)' } },
      { name: 'height', type: 'number', step: '0.001', label: { uz: 'Balandligi (m)', ru: 'Высота (м)' } },
      { name: 'cost_price', type: 'money', label: { uz: 'Ulgurji narx', ru: 'Закупочная цена' } },
      { name: 'sale_price', type: 'money', label: { uz: 'Sotish narxi', ru: 'Цена продажи' } },
      { name: 'currency_id', type: 'ref', ref: 'currencies', label: { uz: 'Valyuta', ru: 'Валюта' } },
      { name: 'account', type: 'text', label: { uz: 'Hisob raqami', ru: 'Счёт' } },
      { name: 'description', type: 'textarea', label: { uz: 'Izoh', ru: 'Описание' } },
      { name: 'image_url', type: 'image', label: { uz: 'Rasm', ru: 'Фото' },
        hint: { uz: 'Rasm yuklang yoki URL kiriting', ru: 'Загрузите фото или вставьте URL' } },
      { name: 'is_service', type: 'bool', label: { uz: 'Xizmat (qoldiqsiz)', ru: 'Услуга (без остатка)' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  counterparties: {
    table: 'catalog_counterparties',
    order: 'name_ru',
    search: ['code', 'name_uz', 'name_ru', 'tax_id', 'phone', 'email'],
    label: { uz: 'Kontragentlar', ru: 'Контрагенты' },
    fields: [
      { name: 'code', type: 'text', label: { uz: 'Kod', ru: 'Код' } },
      { name: 'name_uz', type: 'text', required: true, label: { uz: 'Nomi (UZ)', ru: 'Название (УЗ)' } },
      { name: 'name_ru', type: 'text', required: true, label: { uz: 'Nomi (RU)', ru: 'Название (RU)' } },
      { name: 'kind', type: 'select', options: [
        { value: 'SUPPLIER', label: { uz: 'Yetkazib beruvchi', ru: 'Поставщик' } },
        { value: 'CUSTOMER', label: { uz: 'Mijoz', ru: 'Покупатель' } },
        { value: 'BOTH', label: { uz: 'Ikkalasi', ru: 'Оба' } },
      ], label: { uz: 'Turi', ru: 'Тип' } },
      { name: 'tax_id', type: 'text', label: { uz: 'STIR / INN', ru: 'ИНН' } },
      { name: 'phone', type: 'text', label: { uz: 'Telefon', ru: 'Телефон' } },
      { name: 'email', type: 'text', label: { uz: 'Email', ru: 'Эл. почта' } },
      { name: 'address', type: 'text', label: { uz: 'Manzil', ru: 'Адрес' } },
      { name: 'contact_person', type: 'text', label: { uz: 'Kontakt', ru: 'Контактное лицо' } },
      { name: 'payment_terms', type: 'text', label: { uz: 'To‘lov shartlari', ru: 'Условия оплаты' } },
      { name: 'bank_name', type: 'text', label: { uz: 'Bank', ru: 'Банк' } },
      { name: 'bank_account', type: 'text', label: { uz: 'Hisob raqami', ru: 'Расчётный счёт' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },

  employees: {
    table: 'catalog_employees',
    order: 'name_ru',
    search: ['code', 'name_uz', 'name_ru', 'position', 'phone'],
    label: { uz: 'Xodimlar', ru: 'Сотрудники' },
    fields: [
      { name: 'code', type: 'text', label: { uz: 'Kod', ru: 'Табельный №' } },
      { name: 'name_uz', type: 'text', required: true, label: { uz: 'F.I.O. (UZ)', ru: 'Ф.И.О. (УЗ)' } },
      { name: 'name_ru', type: 'text', required: true, label: { uz: 'F.I.O. (RU)', ru: 'Ф.И.О. (RU)' } },
      { name: 'position', type: 'text', label: { uz: 'Lavozim', ru: 'Должность' } },
      { name: 'phone', type: 'text', label: { uz: 'Telefon', ru: 'Телефон' } },
      { name: 'warehouse_id', type: 'ref', ref: 'warehouses', label: { uz: 'Ombor', ru: 'Склад' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ],
  },
};

function fieldsOf(cat) {
  return CATALOGS[cat].fields.map((f) => f.name);
}

function getCatalog(cat) {
  const c = CATALOGS[cat];
  if (!c) throw notFound('Katalog topilmadi: ' + cat);
  return c;
}

function list(cat, query) {
  const c = getCatalog(cat);
  const limit = Math.min(Number(query.limit) || 200, 5000);
  const offset = Number(query.offset) || 0;
  const allowed = [...c.search, 'is_active', ...fieldsOf(cat)];

  let where = '';
  const params = [];
  if (query.q) {
    const terms = String(query.q).split(/\s+/).filter(Boolean);
    const ors = terms.map(() =>
      '(' + c.search.map((f) => `${f} LIKE ?`).join(' OR ') + ')'
    ).join(' AND ');
    where = 'WHERE ' + ors;
    // har bir term uchun `c.search.length` ta placeholder to'ldirilishi shart
    for (const term of terms) {
      for (let i = 0; i < c.search.length; i++) params.push(`%${term}%`);
    }
  }
  const fw = buildWhere(query.filters && typeof query.filters === 'object' ? query.filters : {}, allowed);
  if (fw.clause) { where = where ? where + ' AND ' + fw.clause.slice(6) : fw.clause; params.push(...fw.params); }

  const rows = all(
    `SELECT t.* FROM ${c.table} t ${where} ORDER BY ${c.order} LIMIT ? OFFSET ?`,
    ...params, limit, offset
  );
  const cnt = get(`SELECT COUNT(*) AS c FROM ${c.table} t ${where}`, ...params);
  return { rows, total: cnt.c, limit, offset };
}

function pick(cat, body, opt = {}) {
  const c = getCatalog(cat);
  const out = {};
  for (const f of c.fields) {
    let v = body[f.name];
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (v === '' && !opt.partial) v = null;
    if (v === undefined) continue;
    if (['number', 'money', 'int'].includes(f.type)) {
      const n = Number(v);
      out[f.name] = Number.isFinite(n) ? n : 0;
    } else {
      out[f.name] = v;
    }
    // maydonga berilgan standart qiymat (NOT NULL ustunlarga NULL yuborilmasin)
    if (out[f.name] === null && f.defaultValue !== undefined) out[f.name] = f.defaultValue;
  }
  // majburiy maydonlar faqat to'liq yozishda tekshiriladi
  if (!opt.partial) {
    for (const f of c.fields) {
      if (f.required && (out[f.name] === undefined || out[f.name] === null || out[f.name] === '')) {
        throw bad(`«${f.label.ru}» to‘ldirilishi shart / Поле «${f.label.ru}» обязательно`, 'REQUIRED');
      }
    }
  }
  return out;
}

function create(cat, body) {
  const c = getCatalog(cat);
  const data = pick(cat, body);
  c.validate?.(data, { isNew: true, row: null });
  const cols = Object.keys(data);
  if (!cols.length) throw bad('Hech narsa yuborilmadi / Нет данных');
  const res = run(
    `INSERT INTO ${c.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    ...cols.map((k) => data[k])
  );
  return get(`SELECT * FROM ${c.table} WHERE id=?`, Number(res.lastInsertRowid));
}

function update(cat, id, body) {
  const c = getCatalog(cat);
  const row = get(`SELECT * FROM ${c.table} WHERE id=?`, id);
  if (!row) throw notFound();
  // faqat yuborilgan maydonlarni yangilash (qisman yangilash / PATCH)
  const data = pick(cat, body, { partial: true });
  c.validate?.(data, { isNew: false, row });
  const cols = Object.keys(data);
  if (!cols.length) return row;
  run(
    `UPDATE ${c.table} SET ${cols.map((k) => `${k}=?`).join(',')} WHERE id=?`,
    ...cols.map((k) => data[k]), id
  );
  return get(`SELECT * FROM ${c.table} WHERE id=?`, id);
}

function remove(cat, id) {
  const c = getCatalog(cat);
  if (c.noDelete) {
    throw bad('Bu katalog «Bino rejasi» orqali o‘chiriladi / Удаление через «План здания»');
  }
  try {
    run(`DELETE FROM ${c.table} WHERE id=?`, id);
  } catch (e) {
    throw bad('O‘chirib bo‘lmaydi — hujjatlarda ishlatilgan / Нельзя удалить: используется в документах');
  }
  return { ok: true, deleted: id };
}

/** Katalog uchun qisqa ro'yxat (dropdown / select uchun) */
function options(cat, query = {}) {
  const c = getCatalog(cat);
  const limit = Math.min(Number(query.limit) || 500, 5000);
  const where = query.warehouse_id ? 'WHERE warehouse_id = ?' : '';
  const params = query.warehouse_id ? [query.warehouse_id] : [];
  // `code` ustuni barcha kataloglarda yo'q (products'da `sku`)
  const keyCol = c.table === 'catalog_products' ? 'sku' : 'code';
  // kaskadli (dependsOn) maydonlar uchun tegishlik ustuni ham kerak
  const extra = ['catalog_locations', 'catalog_rooms'].includes(c.table) ? ', warehouse_id' : '';
  const rows = all(
    `SELECT id, ${keyCol} AS code, name_uz, name_ru, is_active${extra}
       FROM ${c.table} ${where} ORDER BY ${c.order} LIMIT ?`,
    ...params, limit
  );
  return rows;
}

function register(router) {
  router.get('/api/catalogs', () => {
    const out = {};
    for (const [k, v] of Object.entries(CATALOGS)) {
      out[k] = { table: v.table, label: v.label, fields: v.fields, search: v.search, ref: v.ref || null, tree: !!v.tree };
    }
    return out;
  });

  router.get('/api/catalogs/:cat/options', (ctx) => options(ctx.params.cat, ctx.query));
  router.get('/api/catalogs/:cat', (ctx) => list(ctx.params.cat, ctx.query));
  router.get('/api/catalogs/:cat/:id', (ctx) => {
    const c = getCatalog(ctx.params.cat);
    const row = get(`SELECT * FROM ${c.table} WHERE id=?`, Number(ctx.params.id));
    if (!row) throw notFound();
    return row;
  });
  router.post('/api/catalogs/:cat', (ctx) => create(ctx.params.cat, ctx.body));
  router.put('/api/catalogs/:cat/:id', (ctx) => update(ctx.params.cat, Number(ctx.params.id), ctx.body));
  router.del('/api/catalogs/:cat/:id', (ctx) => remove(ctx.params.cat, Number(ctx.params.id)));
}

module.exports = { register, CATALOGS, list, getCatalog, options };
