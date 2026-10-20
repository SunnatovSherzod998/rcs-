'use strict';
/**
 * РЕГИСТРЫ / REGISTRLAR
 * Остатки, движения, взаиморасчёты, цены
 */
const { all, get } = require('../db');
const stock = require('../services/stock');

async function register(router) {
  // ------------------------------------------------------------ ОСТАТКИ
  // Текущий остаток (регистр накопления)
  router.get('/api/register/stock/balances',async (ctx) => {
    const q = ctx.query;
    const where = [];
    const params = [];

    if (q.warehouse_id) { where.push('b.warehouse_id = ?'); params.push(q.warehouse_id); }
    if (q.product_id) { where.push('b.product_id = ?'); params.push(q.product_id); }
    if (q.category_id) { where.push('p.category_id = ?'); params.push(q.category_id); }
    if (q.brand_id) { where.push('p.brand_id = ?'); params.push(q.brand_id); }
    if (q.only_positive === '1') { where.push('b.qty > 0'); }
    if (q.only_negative === '1') { where.push('b.qty < 0'); }
    if (q.q) {
      where.push('(p.sku LIKE ? OR p.barcode LIKE ? OR p.name_ru LIKE ? OR p.name_uz LIKE ?)');
      for (let i = 0; i < 4; i++) params.push(`%${q.q}%`);
    }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(Number(q.limit) || 200, 5000);
    const offset = Number(q.offset) || 0;

    const rows = await all(
      `SELECT p.id AS product_id, p.sku, p.barcode, p.name_ru, p.name_uz,
              u.code AS unit_code, u.name_ru AS unit_ru,
              cat.name_ru AS category, cat.name_uz AS category_uz,
              br.name_ru AS brand, br.name_uz AS brand_uz,
              b.warehouse_id, w.name_ru AS warehouse_name_ru, w.name_uz AS warehouse_name_uz,
              b.location_id, l.code AS location_code,
              b.qty, b.amount, p.min_stock, p.cost_price, p.sale_price, p.is_service,
              COALESCE(pr.cost, p.cost_price) AS avg_cost,
              CASE WHEN b.qty < 0 THEN 1 ELSE 0 END AS is_negative,
              CASE WHEN p.min_stock > 0 AND b.qty < p.min_stock THEN 1 ELSE 0 END AS below_min
         FROM reg_stock_balances b
         JOIN catalog_products p ON p.id = b.product_id
         LEFT JOIN catalog_warehouses w ON w.id = b.warehouse_id
         LEFT JOIN catalog_locations l ON l.id = b.location_id
         LEFT JOIN catalog_units u ON u.id = p.unit_id
         LEFT JOIN catalog_categories cat ON cat.id = p.category_id
         LEFT JOIN catalog_brands br ON br.id = p.brand_id
         LEFT JOIN reg_prices pr ON pr.product_id = p.id AND pr.warehouse_id = b.warehouse_id
         ${w}
         ORDER BY w.code, p.sku, l.code
         LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
    const tot = await get(
      `SELECT COUNT(*) AS c, COALESCE(SUM(b.qty),0) AS qty, COALESCE(SUM(b.amount),0) AS amount
         FROM reg_stock_balances b
         JOIN catalog_products p ON p.id = b.product_id
         LEFT JOIN catalog_categories cat ON cat.id = p.category_id
         LEFT JOIN catalog_brands br ON br.id = p.brand_id
         ${w}`,
      ...params
    );
    return { rows, total: tot.c, sum_qty: tot.qty, sum_amount: tot.amount, limit, offset };
  });

  // Группировка по товару (все склады в одной строке)
  router.get('/api/register/stock/balances/grouped',async (ctx) => {
    const q = ctx.query;
    const where = [];
    const params = [];
    if (q.warehouse_id) { where.push('b.warehouse_id = ?'); params.push(q.warehouse_id); }
    if (q.q) {
      where.push('(p.sku LIKE ? OR p.barcode LIKE ? OR p.name_ru LIKE ? OR p.name_uz LIKE ?)');
      for (let i = 0; i < 4; i++) params.push(`%${q.q}%`);
    }
    if (q.category_id) { where.push('p.category_id = ?'); params.push(q.category_id); }
    // agregatli filtrlar WHERE'da emas, HAVING'da bo'lishi shart
    const having = [];
    if (q.only_positive === '1') having.push('SUM(b.qty) > 0');
    if (q.only_negative === '1') having.push('SUM(b.qty) < 0');
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const hv = having.length ? 'HAVING ' + having.join(' AND ') : '';
    return all(
      `SELECT p.id AS product_id, p.sku, p.barcode, p.name_ru, p.name_uz, p.image_url,
              u.code AS unit_code, u.name_ru AS unit_ru,
              cat.name_ru AS category, br.name_ru AS brand,
              SUM(b.qty) AS qty, SUM(b.amount) AS amount,
              MIN(p.min_stock) AS min_stock, MIN(p.cost_price) AS cost_price, MIN(p.sale_price) AS sale_price,
              COUNT(DISTINCT b.warehouse_id) AS warehouses
         FROM reg_stock_balances b
         JOIN catalog_products p ON p.id = b.product_id
         LEFT JOIN catalog_units u ON u.id = p.unit_id
         LEFT JOIN catalog_categories cat ON cat.id = p.category_id
         LEFT JOIN catalog_brands br ON br.id = p.brand_id
         ${w}
         GROUP BY p.id
         ${hv}
         ORDER BY p.sku LIMIT ?`,
      ...params, Math.min(Number(q.limit) || 500, 5000)
    );
  });

  // Минимальные остатки / Maximum alert
  router.get('/api/register/stock/below-min',async (ctx) => {
    const whId = Number(ctx.query.warehouse_id) || 0;
    return all(
      `SELECT p.id, p.sku, p.barcode, p.name_ru, p.name_uz, p.min_stock, p.max_stock,
              u.code AS unit_code, w.id AS warehouse_id, w.name_ru AS warehouse, w.name_uz AS warehouse_uz,
              COALESCE(b.qty, 0) AS qty,
              p.min_stock - COALESCE(b.qty,0) AS need
         FROM catalog_products p
         CROSS JOIN catalog_warehouses w
         LEFT JOIN reg_stock_balances b
                ON b.product_id = p.id AND b.warehouse_id = w.id
         LEFT JOIN catalog_units u ON u.id = p.unit_id
        WHERE p.is_active = 1 AND p.is_service = 0 AND p.min_stock > 0
          AND w.is_active = 1 ${whId ? 'AND w.id = ?' : ''}
          AND COALESCE(b.qty, 0) < p.min_stock
        ORDER BY need DESC LIMIT 500`,
      ...(whId ? [whId] : [])
    );
  });

  // ------------------------------------------------------------ ДВИЖЕНИЯ
  router.get('/api/register/stock/movements',async (ctx) => {
    const q = ctx.query;
    const where = [];
    const params = [];
    if (q.warehouse_id) { where.push('(m.warehouse_id = ?)'); params.push(q.warehouse_id); }
    if (q.product_id) { where.push('m.product_id = ?'); params.push(q.product_id); }
    if (q.doc_type) { where.push('m.doc_type = ?'); params.push(q.doc_type); }
    if (q.document_id) { where.push('m.document_id = ?'); params.push(q.document_id); }
    if (q.date_from) { where.push('m.date >= ?'); params.push(q.date_from); }
    if (q.date_to) { where.push('m.date <= ?'); params.push(q.date_to); }
    if (q.q) {
      where.push('(p.sku LIKE ? OR p.name_ru LIKE ? OR p.name_uz LIKE ?)');
      for (let i = 0; i < 3; i++) params.push(`%${q.q}%`);
    }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(Number(q.limit) || 200, 5000);
    const offset = Number(q.offset) || 0;
    const rows = await all(
      `SELECT m.*, p.sku, p.name_ru, p.name_uz, u.code AS unit_code,
              w.name_ru AS warehouse_name_ru, w.name_uz AS warehouse_name_uz,
              d.number AS doc_number, d.note AS doc_note, d.base_type,
              cp.name_ru AS counterparty_name_ru
         FROM reg_stock_movements m
         JOIN catalog_products p ON p.id = m.product_id
         LEFT JOIN catalog_warehouses w ON w.id = m.warehouse_id
         LEFT JOIN catalog_units u ON u.id = p.unit_id
         LEFT JOIN documents d ON d.id = m.document_id
         LEFT JOIN catalog_counterparties cp ON cp.id = m.counterparty_id
         ${w}
         ORDER BY m.date DESC, m.id DESC LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
    const tot = await get(
      `SELECT COUNT(*) AS c, COALESCE(SUM(m.qty_in),0) AS in_qty, COALESCE(SUM(m.qty_out),0) AS out_qty
         FROM reg_stock_movements m JOIN catalog_products p ON p.id=m.product_id ${w}`, ...params
    );
    return { rows, total: tot.c, sum_in: tot.in_qty, sum_out: tot.out_qty, limit, offset };
  });

  // ------------------------------------------------------------ ОБОРОТКА
  // Оборотно-сальдовая ведомость
  router.get('/api/register/stock/turnover',async (ctx) => {
    const q = ctx.query;
    const whId = Number(q.warehouse_id) || 0;
    const from = q.date_from || '0000-01-01';
    const to = q.date_to || '9999-12-31';

    return all(
      `SELECT p.id AS product_id, p.sku, p.barcode, p.name_ru, p.name_uz,
              u.code AS unit_code,
              COALESCE(s.qty, 0)  AS opening_qty,
              COALESCE(s.amt, 0)  AS opening_amount,
              COALESCE(i.qty, 0)  AS in_qty,  COALESCE(i.amt, 0) AS in_amount,
              COALESCE(o.qty, 0)  AS out_qty, COALESCE(o.amt, 0) AS out_amount,
              COALESCE(s.qty,0) + COALESCE(i.qty,0) - COALESCE(o.qty,0) AS closing_qty,
              COALESCE(s.amt,0) + COALESCE(i.amt,0) - COALESCE(o.amt,0) AS closing_amount
         FROM catalog_products p
         LEFT JOIN catalog_units u ON u.id = p.unit_id
         LEFT JOIN (
              SELECT product_id,
                     SUM(qty_in - qty_out) AS qty, SUM(amount) AS amt
                FROM reg_stock_movements
               WHERE date < ? ${whId ? 'AND warehouse_id = ?' : ''}
               GROUP BY product_id
         ) s ON s.product_id = p.id
         LEFT JOIN (
              SELECT product_id, SUM(qty_in) AS qty, SUM(amount) AS amt
                FROM reg_stock_movements
               WHERE date >= ? AND date <= ? AND qty_in > 0 ${whId ? 'AND warehouse_id = ?' : ''}
               GROUP BY product_id
         ) i ON i.product_id = p.id
         LEFT JOIN (
              SELECT product_id, SUM(qty_out) AS qty, SUM(amount) AS amt
                FROM reg_stock_movements
               WHERE date >= ? AND date <= ? AND qty_out > 0 ${whId ? 'AND warehouse_id = ?' : ''}
               GROUP BY product_id
         ) o ON o.product_id = p.id
        WHERE p.is_active = 1
          AND (COALESCE(s.qty,0) <> 0 OR COALESCE(i.qty,0) <> 0 OR COALESCE(o.qty,0) <> 0)
          ${q.category_id ? 'AND p.category_id = ?' : ''}
        ORDER BY p.sku LIMIT 2000`,
      ...(whId ? [from, whId, from, to, whId, from, to, whId] : [from, from, to, from, to]),
      ...(q.category_id ? [q.category_id] : [])
    );
  });

  // ------------------------------------------------------------ ВЗАИМОРАСЧЁТЫ
  router.get('/api/register/debt/balances',async (ctx) => {
    const q = ctx.query;
    const where = ['cp.is_active = 1'];
    const params = [];
    if (q.warehouse_id) { where.push('(d.warehouse_id = ? OR d.warehouse_id IS NULL)'); params.push(q.warehouse_id); }
    if (q.q) {
      where.push('(cp.name_ru LIKE ? OR cp.name_uz LIKE ? OR cp.code LIKE ?)');
      for (let i = 0; i < 3; i++) params.push(`%${q.q}%`);
    }
    if (q.only_debt === '1') where.push('COALESCE(d.debt,0) <> 0');

    const rows = await all(
      `SELECT cp.id, cp.code, cp.name_ru, cp.name_uz, cp.kind, cp.phone, cp.tax_id,
              COALESCE(d.debt, 0) AS debt,
              COALESCE(d.debt_uz, 0) AS debt_uz
         FROM catalog_counterparties cp
         LEFT JOIN (
           SELECT counterparty_id, SUM(amount) AS debt, SUM(amount) AS debt_uz
             FROM reg_debt_movements GROUP BY counterparty_id
         ) d ON d.counterparty_id = cp.id
        WHERE ${where.join(' AND ')}
        ORDER BY ABS(COALESCE(d.debt,0)) DESC, cp.name_ru LIMIT 500`,
      ...params
    );
    return rows;
  });

  router.get('/api/register/debt/movements',async (ctx) => {
    const q = ctx.query;
    const where = [];
    const params = [];
    if (q.counterparty_id) { where.push('m.counterparty_id = ?'); params.push(q.counterparty_id); }
    if (q.date_from) { where.push('m.date >= ?'); params.push(q.date_from); }
    if (q.date_to) { where.push('m.date <= ?'); params.push(q.date_to); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    return all(
      `SELECT m.*, cp.name_ru AS counterparty, cp.name_uz AS counterparty_uz,
              d.number AS doc_number, d.type AS doc_type, d.base_type
         FROM reg_debt_movements m
         JOIN catalog_counterparties cp ON cp.id = m.counterparty_id
         LEFT JOIN documents d ON d.id = m.document_id
         ${w} ORDER BY m.date DESC, m.id DESC LIMIT 1000`,
      ...params
    );
  });

  // ------------------------------------------------------------ ЦЕНЫ
  router.get('/api/register/prices',async (ctx) => {
    const whId = Number(ctx.query.warehouse_id) || 0;
    return all(
      `SELECT p.id, p.sku, p.name_ru, p.name_uz, p.cost_price, p.sale_price,
              pr.warehouse_id, w.name_ru AS warehouse, pr.cost AS avg_cost, pr.updated_at,
              (pr.cost - p.cost_price) AS diff
         FROM catalog_products p
         LEFT JOIN reg_prices pr ON pr.product_id = p.id ${whId ? 'AND pr.warehouse_id = ?' : ''}
         LEFT JOIN catalog_warehouses w ON w.id = pr.warehouse_id
        WHERE p.is_active = 1 AND (pr.cost IS NOT NULL ${whId ? 'OR 1=1' : ''})
        ORDER BY p.sku LIMIT 1000`,
      ...(whId ? [whId] : [])
    );
  });
}

module.exports = { register };
