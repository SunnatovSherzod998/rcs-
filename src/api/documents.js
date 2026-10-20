'use strict';
/**
 * ДОКУМЕНТЫ / HUJJATLAR
 */
const { all, get, run, buildWhere } = require('../db');
const { bad } = require('../lib/http');
const stock = require('../services/stock');

const TYPE_LABELS = {
  OPENING:   { uz: 'Boshlang‘ich qoldiq', ru: 'Начальные остатки' },
  RECEIPT:   { uz: 'Kirim (Приход)', ru: 'Приход' },
  ISSUE:     { uz: 'Chiqim (Расход)', ru: 'Расход' },
  TRANSFER:  { uz: 'Ko‘chirish (Перемещение)', ru: 'Перемещение' },
  PLACEMENT: { uz: 'Joylash (Размещение)', ru: 'Размещение' },
  PICK:      { uz: 'Yig‘ish (Выборка)', ru: 'Выборка' },
  INVENTORY: { uz: 'Inventarizatsiya', ru: 'Инвентаризация' },
  PAYMENT:   { uz: 'To‘lov (Оплата)', ru: 'Оплата' },
};

const ISSUE_REASONS = {
  SALE:     { uz: 'Sotish', ru: 'Продажа' },
  WRITEOFF: { uz: 'Yo‘qotish / buzilish', ru: 'Списание / порча' },
  USAGE:    { uz: 'Ichki ishlatish', ru: 'Внутреннее использование' },
  RETURN:   { uz: 'Qaytarish', ru: 'Возврат' },
  SAMPLE:   { uz: 'Namuna', ru: 'Образец' },
};

async function register(router) {
  // Ro'yxat + filtrlar
  router.get('/api/documents',async (ctx) => {
    const q = ctx.query;
    const where = [];
    const params = [];

    if (q.type) {
      const types = String(q.type).split(',').filter(Boolean);
      where.push(`d.type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
    if (q.status) {
      const st = String(q.status).split(',').filter(Boolean);
      where.push(`d.status IN (${st.map(() => '?').join(',')})`);
      params.push(...st);
    }
    if (q.date_from) { where.push('d.date >= ?'); params.push(q.date_from); }
    if (q.date_to)   { where.push('d.date <= ?'); params.push(q.date_to); }
    if (q.warehouse_id)   { where.push('(d.warehouse_id = ? OR d.dest_warehouse_id = ?)'); params.push(q.warehouse_id, q.warehouse_id); }
    if (q.counterparty_id){ where.push('d.counterparty_id = ?'); params.push(q.counterparty_id); }
    if (q.q) {
      const term = `%${q.q}%`;
      where.push(`(CAST(d.number AS TEXT) LIKE ? OR d.note LIKE ? OR w.name_ru LIKE ? OR w.name_uz LIKE ?
                   OR cp.name_ru LIKE ? OR cp.name_uz LIKE ? OR EXISTS
                     (SELECT 1 FROM document_lines dl JOIN catalog_products p ON p.id=dl.product_id
                       WHERE dl.document_id=d.id AND (p.sku LIKE ? OR p.name_ru LIKE ? OR p.barcode LIKE ?)))`);
      params.push(term, term, term, term, term, term, term, term, term);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(Number(q.limit) || 100, 1000);
    const offset = Number(q.offset) || 0;
    const order = ['number DESC', 'date DESC', 'id DESC'].includes(q.order) ? q.order : 'd.date DESC, d.number DESC, d.id DESC';

    const rows = await all(
      `SELECT d.*, w.name_ru AS warehouse_name_ru, w.name_uz AS warehouse_name_uz,
              w2.name_ru AS dest_name_ru, w2.name_uz AS dest_name_uz,
              cp.name_ru AS counterparty_name_ru, cp.name_uz AS counterparty_name_uz,
              cu.code AS currency_code,
              (SELECT COUNT(*) FROM document_lines dl WHERE dl.document_id = d.id) AS lines_count,
              uc.full_name AS created_by_name, up.full_name AS posted_by_name
         FROM documents d
         LEFT JOIN catalog_warehouses w  ON w.id = d.warehouse_id
         LEFT JOIN catalog_warehouses w2 ON w2.id = d.dest_warehouse_id
         LEFT JOIN catalog_counterparties cp ON cp.id = d.counterparty_id
         LEFT JOIN catalog_currencies cu ON cu.id = d.currency_id
         LEFT JOIN users uc ON uc.id = d.created_by
         LEFT JOIN users up ON up.id = d.posted_by
         ${w} ORDER BY ${order} LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
    const total = (await get(`SELECT COUNT(*) AS c FROM documents d
        LEFT JOIN catalog_warehouses w ON w.id=d.warehouse_id
        LEFT JOIN catalog_counterparties cp ON cp.id=d.counterparty_id ${w}`, ...params)).c;
    const sums = await get(`SELECT COALESCE(SUM(d.total_amount),0) AS amount, COALESCE(SUM(d.total_qty),0) AS qty
                        FROM documents d
                        LEFT JOIN catalog_warehouses w ON w.id=d.warehouse_id
                        LEFT JOIN catalog_counterparties cp ON cp.id=d.counterparty_id ${w}`, ...params);
    return { rows, total, limit, offset, sum_amount: sums.amount, sum_qty: sums.qty };
  });

  // Bitta hujjat
  router.get('/api/documents/:id', async (ctx) => {
    const doc = await stock.getDocument(Number(ctx.params.id));
    if (!doc) throw bad('Hujjat topilmadi / Документ не найден');
    return doc;
  });

  // Yangi
  router.post('/api/documents', async (ctx) => await stock.createDocument(ctx.body, ctx.user));
  // Tahrirlash
  router.put('/api/documents/:id', async (ctx) => await stock.updateDocument(Number(ctx.params.id), ctx.body));
  // O'chirish
  router.del('/api/documents/:id', async (ctx) => await stock.deleteDocument(Number(ctx.params.id)));

  // Провести (kassir ham o'tkazishi mumkin — POS savdo uchun)
  router.post('/api/documents/:id/post', async (ctx) => {
    const r = await stock.post(Number(ctx.params.id), ctx.user);
    return { ...r, document: await stock.getDocument(Number(ctx.params.id)) };
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER', 'CASHIER'] });

  // Отменить проведение
  router.post('/api/documents/:id/unpost', async (ctx) => {
    const r = await stock.unpost(Number(ctx.params.id), ctx.user);
    return { ...r, document: await stock.getDocument(Number(ctx.params.id)) };
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // Kataloglarni to'ldirish uchun
  router.get('/api/documents-meta/types', async () => ({
    types: Object.entries(TYPE_LABELS).map(([value, l]) => ({ value, label: l })),
    reasons: Object.entries(ISSUE_REASONS).map(([value, l]) => ({ value, label: l })),
  }));

  // Hisobot uchun savdo (sale) hujjatlari bo'yicha
  router.get('/api/documents-lookup/sales',async (ctx) => {
    const where = ["d.type='ISSUE'", "d.status='POSTED'", "d.base_type='SALE'"];
    const params = [];
    if (ctx.query.date_from) { where.push('d.date >= ?'); params.push(ctx.query.date_from); }
    if (ctx.query.date_to) { where.push('d.date <= ?'); params.push(ctx.query.date_to); }
    if (ctx.query.warehouse_id) { where.push('d.warehouse_id = ?'); params.push(ctx.query.warehouse_id); }
    return all(
      `SELECT d.id, d.number, d.date, d.total_amount, d.total_cost, d.total_qty,
              cp.name_ru AS counterparty, cu.code AS currency
         FROM documents d
         LEFT JOIN catalog_counterparties cp ON cp.id = d.counterparty_id
         LEFT JOIN catalog_currencies cu ON cu.id = d.currency_id
        WHERE ${where.join(' AND ')} ORDER BY d.date DESC, d.number DESC LIMIT 500`,
      ...params
    );
  });

  // Avtomatik to'ldirish: SKU yoki barcode bo'yicha qoldiq
  router.get('/api/products-lookup/stock',async (ctx) => {
    const code = (ctx.query.code || '').trim();
    if (!code) throw bad('Kod kiriting / Введите код');
    const p = await get(
      `SELECT * FROM catalog_products WHERE barcode = ? OR sku = ? OR lower(name_ru) = lower(?) OR lower(name_uz) = lower(?) LIMIT 1`,
      code, code, code, code
    );
    if (!p) throw bad('Tovar topilmadi / Товар не найден: ' + code);
    const whId = Number(ctx.query.warehouse_id) || 0;
    const balances = await all(
      `SELECT b.warehouse_id, b.location_id, b.qty, b.amount, w.name_ru AS warehouse, w.name_uz AS warehouse_uz,
              l.code AS location_code
         FROM reg_stock_balances b
         JOIN catalog_warehouses w ON w.id = b.warehouse_id
         LEFT JOIN catalog_locations l ON l.id = b.location_id
        WHERE b.product_id = ? ${whId ? 'AND b.warehouse_id = ?' : ''}
        ORDER BY b.warehouse_id, b.location_id`,
      ...(whId ? [p.id, whId] : [p.id])
    );
    return { product: p, balances, total_qty: balances.reduce((s, b) => s + b.qty, 0) };
  });

  // Barcha tovar + qoldiq (katalog + registr)
  router.get('/api/products-lookup/list',async (ctx) => {
    const whId = Number(ctx.query.warehouse_id) || 0;
    const where = ['p.is_active = 1'];
    const params = [];
    if (ctx.query.q) {
      where.push('(p.sku LIKE ? OR p.barcode LIKE ? OR p.name_ru LIKE ? OR p.name_uz LIKE ?)');
      for (let i = 0; i < 4; i++) params.push(`%${ctx.query.q}%`);
    }
    if (ctx.query.category_id) { where.push('p.category_id = ?'); params.push(ctx.query.category_id); }
    return all(
      `SELECT p.id, p.sku, p.barcode, p.name_ru, p.name_uz, p.cost_price, p.sale_price,
              p.min_stock, p.unit_id, u.code AS unit_code,
              COALESCE((SELECT SUM(b.qty) FROM reg_stock_balances b
                         WHERE b.product_id = p.id ${whId ? 'AND b.warehouse_id = ?' : ''}), 0) AS qty
         FROM catalog_products p
         LEFT JOIN catalog_units u ON u.id = p.unit_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.sku LIMIT ?`,
      ...(whId ? [whId, ...params] : params), Math.min(Number(ctx.query.limit) || 100, 1000)
    );
  });
}

module.exports = { register, TYPE_LABELS, ISSUE_REASONS };
