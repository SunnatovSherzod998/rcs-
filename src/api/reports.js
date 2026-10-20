'use strict';
/**
 * ОТЧЁТЫ / HISOBOTLAR
 * (1C "Отчёты" bo'limi)
 */
const { all, get } = require('../db');
const { bad } = require('../lib/http');

function period(query) {
  const to = query.date_to || new Date().toISOString().slice(0, 10);
  const from = query.date_from || to.slice(0, 8) + '01';
  if (from > to) throw bad('Boshlang‘ich sana tugash sanasidan katta / Начало больше окончания');
  return { from, to };
}

async function register(router) {
  // ---------------------------------------------------------- Dashboard
  router.get('/api/reports/dashboard',async (ctx) => {
    const wh = Number(ctx.query.warehouse_id) || 0;
    const whClause = wh ? 'AND warehouse_id = ?' : '';
    const whArgs = wh ? [wh] : [];

    const totals = await get(
      `SELECT COUNT(*) AS positions, COALESCE(SUM(qty),0) AS qty, COALESCE(SUM(amount),0) AS amount
         FROM reg_stock_balances WHERE 1=1 ${wh ? 'AND warehouse_id = ?' : ''}`, ...whArgs
    );
    const products = await get(
      `SELECT COUNT(*) AS c FROM catalog_products WHERE is_active = 1 AND is_service = 0`
    );
    const warehouses = await get(`SELECT COUNT(*) AS c FROM catalog_warehouses WHERE is_active = 1`);
    const counterparties = await get(`SELECT COUNT(*) AS c FROM catalog_counterparties WHERE is_active = 1`);
    const drafts = await get(`SELECT COUNT(*) AS c FROM documents WHERE status = 'DRAFT'`);
    const belowMin = await all(
      `SELECT p.id, p.sku, p.name_ru, p.name_uz, p.min_stock, u.code AS unit,
              COALESCE((SELECT SUM(b.qty) FROM reg_stock_balances b
                         WHERE b.product_id = p.id ${wh ? 'AND b.warehouse_id = ?' : ''}), 0) AS qty
         FROM catalog_products p
         LEFT JOIN catalog_units u ON u.id = p.unit_id
        WHERE p.is_active = 1 AND p.is_service = 0 AND p.min_stock > 0
          AND COALESCE((SELECT SUM(b.qty) FROM reg_stock_balances b
                  WHERE b.product_id = p.id ${wh ? 'AND b.warehouse_id = ?' : ''}), 0) < p.min_stock
        ORDER BY (p.min_stock - COALESCE((SELECT SUM(b.qty) FROM reg_stock_balances b
                  WHERE b.product_id = p.id ${wh ? 'AND b.warehouse_id = ?' : ''}), 0)) DESC LIMIT 15`,
      ...whArgs
    );
    const debt = await get(`SELECT COALESCE(SUM(amount),0) AS debt FROM reg_debt_movements`);
    const debtByParty = await all(
      `SELECT cp.name_ru, cp.name_uz, COALESCE(SUM(m.amount),0) AS amount
         FROM reg_debt_movements m JOIN catalog_counterparties cp ON cp.id = m.counterparty_id
        GROUP BY m.counterparty_id ORDER BY ABS(SUM(m.amount)) DESC LIMIT 10`
    );
    const recent = await all(
      `SELECT d.id, d.type, d.number, d.date, d.status, d.total_amount, d.total_qty,
              w.name_ru AS warehouse, cp.name_ru AS counterparty
         FROM documents d
         LEFT JOIN catalog_warehouses w ON w.id = d.warehouse_id
         LEFT JOIN catalog_counterparties cp ON cp.id = d.counterparty_id
        ORDER BY d.id DESC LIMIT 10`
    );
    const neg = await get(
      `SELECT COUNT(*) AS c FROM reg_stock_balances WHERE qty < 0 ${wh ? 'AND warehouse_id = ?' : ''}`, ...whArgs
    );
    const chart = await all(
      `SELECT date, SUM(qty_in) AS in_qty, SUM(qty_out) AS out_qty
         FROM reg_stock_movements WHERE 1=1 ${wh ? 'AND warehouse_id = ?' : ''}
        GROUP BY date ORDER BY date DESC LIMIT 30`, ...whArgs
    );

    // Ishchilar bo'yicha sotuvlar (joriy oy) — limit va bonus uchun
    const month = new Date().toISOString().slice(0, 7);
    const empSales = await all(
      `SELECT e.id, e.name_uz, e.name_ru, e.position, e.sales_limit, e.bonus_percent,
              e.base_salary,
              COALESCE(SUM(d.total_amount), 0) AS month_sales,
              COUNT(d.id) AS doc_count
         FROM catalog_employees e
         LEFT JOIN documents d
                ON d.employee_id = e.id
               AND d.type = 'ISSUE' AND d.status = 'POSTED' AND d.base_type = 'SALE'
               AND substr(d.date, 1, 7) = ?
                ${wh ? 'AND d.warehouse_id = ?' : ''}
        WHERE e.is_active = 1
        GROUP BY e.id
        ORDER BY month_sales DESC
        LIMIT 10`,
      month, ...whArgs
    );

    // Kunlik sotuvlar — xodimlar bo'yicha (oxirgi 30 kun)
    const salesByEmpDay = await all(
      `SELECT d.date, d.employee_id,
              e.name_uz, e.name_ru,
              SUM(d.total_qty) AS qty,
              SUM(d.total_amount) AS amount,
              COUNT(d.id) AS docs
         FROM documents d
         JOIN catalog_employees e ON e.id = d.employee_id
        WHERE d.type = 'ISSUE' AND d.status = 'POSTED' AND d.base_type = 'SALE'
          AND d.employee_id IS NOT NULL
          AND d.date >= date('now', '-89 days')
          ${wh ? 'AND d.warehouse_id = ?' : ''}
        GROUP BY d.date, d.employee_id
        ORDER BY d.date DESC, qty DESC`,
      ...whArgs
    );

    return {
      totals, products: products.c, warehouses: warehouses.c,
      counterparties: counterparties.c, drafts: drafts.c,
      below_min: belowMin, negative_count: neg.c,
      debt_total: debt.debt, debt_by_party: debtByParty, recent, chart,
      emp_sales: empSales, sales_by_emp_day: salesByEmpDay,
    };
  });

  // ---------------------------------------------------------- Приход/Расход за период
  router.get('/api/reports/turnover',async (ctx) => {
    const { from, to } = period(ctx.query);
    const wh = Number(ctx.query.warehouse_id) || 0;
    return all(
      `SELECT date,
              SUM(CASE WHEN qty_in  > 0 THEN qty_in  ELSE 0 END) AS in_qty,
              SUM(CASE WHEN qty_in  > 0 THEN amount ELSE 0 END) AS in_amount,
              SUM(CASE WHEN qty_out > 0 THEN qty_out ELSE 0 END) AS out_qty,
              SUM(CASE WHEN qty_out > 0 THEN amount ELSE 0 END) AS out_amount
         FROM reg_stock_movements
        WHERE date >= ? AND date <= ? ${wh ? 'AND warehouse_id = ?' : ''}
        GROUP BY date ORDER BY date`,
      ...(wh ? [from, to, wh] : [from, to])
    );
  });

  // ---------------------------------------------------------- Прибыль (foyda)
  router.get('/api/reports/profit',async (ctx) => {
    const { from, to } = period(ctx.query);
    const wh = Number(ctx.query.warehouse_id) || 0;
    const byProduct = await all(
      `SELECT p.id, p.sku, p.name_ru, p.name_uz, u.code AS unit,
              SUM(CASE WHEN m.qty_out > 0 THEN m.qty_out ELSE 0 END) AS sold_qty,
              SUM(CASE WHEN m.qty_out > 0 THEN m.amount ELSE 0 END) AS revenue,
              SUM(CASE WHEN m.qty_in  > 0 THEN m.qty_in  ELSE 0 END) AS bought_qty,
              SUM(CASE WHEN m.qty_in  > 0 THEN m.amount ELSE 0 END) AS cost_in
         FROM reg_stock_movements m
         JOIN catalog_products p ON p.id = m.product_id
         LEFT JOIN catalog_units u ON u.id = p.unit_id
        WHERE m.date >= ? AND m.date <= ? ${wh ? 'AND m.warehouse_id = ?' : ''}
        GROUP BY p.id HAVING sold_qty > 0
        ORDER BY revenue DESC LIMIT 500`,
      ...(wh ? [from, to, wh] : [from, to])
    );
    // foyda = sotuv summasi - o'rtacha tannarx * sotilgan miqdor
    let revenue = 0, cost = 0;
    for (const r of byProduct) {
      const avg = Number(r.sold_qty) > 0 ? Number(r.cost_in) / Math.max(Number(r.bought_qty), 1e-9) : 0;
      r.cost_out = r.sold_qty * avg;
      r.profit = Number(r.revenue) - r.cost_out;
      r.margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
      revenue += Number(r.revenue);
      cost += Number(r.cost_out);
    }
    return { from, to, rows: byProduct, total_revenue: revenue, total_cost: cost, total_profit: revenue - cost };
  });

  // ---------------------------------------------------------- Oтчёт по продажам
  router.get('/api/reports/sales',async (ctx) => {
    const { from, to } = period(ctx.query);
    const wh = Number(ctx.query.warehouse_id) || 0;
    return all(
      `SELECT d.id, d.number, d.date, d.total_amount, d.total_cost, d.total_qty,
              cp.name_ru AS counterparty, cp.name_uz AS counterparty_uz,
              w.name_ru AS warehouse, w.name_uz AS warehouse_uz,
              cu.code AS currency, u.full_name AS manager,
              (d.total_amount - d.total_cost) AS profit
         FROM documents d
         LEFT JOIN catalog_counterparties cp ON cp.id = d.counterparty_id
         LEFT JOIN catalog_warehouses w ON w.id = d.warehouse_id
         LEFT JOIN catalog_currencies cu ON cu.id = d.currency_id
         LEFT JOIN catalog_employees e ON e.id = d.employee_id
         LEFT JOIN users u ON u.id = d.created_by
        WHERE d.type='ISSUE' AND d.status='POSTED' AND d.base_type='SALE'
          AND d.date >= ? AND d.date <= ? ${wh ? 'AND d.warehouse_id = ?' : ''}
        ORDER BY d.date DESC, d.number DESC LIMIT 1000`,
      ...(wh ? [from, to, wh] : [from, to])
    );
  });

  // ---------------------------------------------------------- Oтчёт по закупкам
  router.get('/api/reports/purchases',async (ctx) => {
    const { from, to } = period(ctx.query);
    const wh = Number(ctx.query.warehouse_id) || 0;
    return all(
      `SELECT d.id, d.number, d.date, d.total_amount, d.total_qty,
              cp.name_ru AS counterparty, cp.name_uz AS counterparty_uz,
              w.name_ru AS warehouse, w.name_uz AS warehouse_uz, cu.code AS currency
         FROM documents d
         LEFT JOIN catalog_counterparties cp ON cp.id = d.counterparty_id
         LEFT JOIN catalog_warehouses w ON w.id = d.warehouse_id
         LEFT JOIN catalog_currencies cu ON cu.id = d.currency_id
        WHERE d.type IN ('RECEIPT','OPENING') AND d.status='POSTED'
          AND d.date >= ? AND d.date <= ? ${wh ? 'AND d.warehouse_id = ?' : ''}
        ORDER BY d.date DESC, d.number DESC LIMIT 1000`,
      ...(wh ? [from, to, wh] : [from, to])
    );
  });

  // ---------------------------------------------------------- Инвентаризация — расхождения
  router.get('/api/reports/inventory-diff',async (ctx) => {
    const { from, to } = period(ctx.query);
    const wh = Number(ctx.query.warehouse_id) || 0;
    return all(
      `SELECT d.number, d.date, w.name_ru AS warehouse, w.name_uz AS warehouse_uz,
              p.sku, p.name_ru, p.name_uz, u.code AS unit,
              l.qty_system, l.qty, (l.qty - COALESCE(l.qty_system,0)) AS diff,
              l.price, (l.qty - COALESCE(l.qty_system,0)) * l.price AS diff_amount
         FROM document_lines l
         JOIN documents d ON d.id = l.document_id
         JOIN catalog_products p ON p.id = l.product_id
         LEFT JOIN catalog_units u ON u.id = p.unit_id
         LEFT JOIN catalog_warehouses w ON w.id = d.warehouse_id
        WHERE d.type='INVENTORY' AND d.status='POSTED'
          AND d.date >= ? AND d.date <= ? ${wh ? 'AND d.warehouse_id = ?' : ''}
          AND ABS(l.qty - COALESCE(l.qty_system,0)) > 0.000001
        ORDER BY d.date DESC, ABS(l.qty - COALESCE(l.qty_system,0)) DESC LIMIT 1000`,
      ...(wh ? [from, to, wh] : [from, to])
    );
  });

  // ---------------------------------------------------------- Списание (yo'qotish)
  router.get('/api/reports/writeoff',async (ctx) => {
    const { from, to } = period(ctx.query);
    const wh = Number(ctx.query.warehouse_id) || 0;
    return all(
      `SELECT d.number, d.date, d.reason, w.name_ru AS warehouse, w.name_uz AS warehouse_uz,
              p.sku, p.name_ru, p.name_uz, u.code AS unit,
              SUM(l.qty) AS qty, SUM(l.amount) AS amount
         FROM document_lines l
         JOIN documents d ON d.id = l.document_id
         JOIN catalog_products p ON p.id = l.product_id
         LEFT JOIN catalog_units u ON u.id = p.unit_id
         LEFT JOIN catalog_warehouses w ON w.id = d.warehouse_id
        WHERE d.type='ISSUE' AND d.status='POSTED' AND d.base_type <> 'SALE'
          AND d.date >= ? AND d.date <= ? ${wh ? 'AND d.warehouse_id = ?' : ''}
        GROUP BY d.id, p.id
        ORDER BY d.date DESC LIMIT 1000`,
      ...(wh ? [from, to, wh] : [from, to])
    );
  });

  // ---------------------------------------------------------- Движения по товару (карточка)
  router.get('/api/register/stock/product-card',async (ctx) => {
    const pid = Number(ctx.query.product_id);
    if (!pid) throw bad('product_id kerak / Требуется product_id');
    const wh = Number(ctx.query.warehouse_id) || 0;
    const to = ctx.query.date_to || '9999-12-31';
    const from = ctx.query.date_from || '0000-01-01';

    const opening = await get(
      `SELECT COALESCE(SUM(qty_in - qty_out),0) AS qty, COALESCE(SUM(amount),0) AS amount
         FROM reg_stock_movements
        WHERE product_id = ? AND date < ? ${wh ? 'AND warehouse_id = ?' : ''}`,
      ...(wh ? [pid, from, wh] : [pid, from])
    );
    const rows = await all(
      `SELECT m.*, d.number AS doc_number, d.type AS doc_type, d.base_type, d.note AS doc_note,
              w.name_ru AS warehouse, w.name_uz AS warehouse_uz, l.code AS location_code
         FROM reg_stock_movements m
         LEFT JOIN documents d ON d.id = m.document_id
         LEFT JOIN catalog_warehouses w ON w.id = m.warehouse_id
         LEFT JOIN catalog_locations l ON l.id = m.location_id
        WHERE m.product_id = ? AND m.date >= ? AND m.date <= ? ${wh ? 'AND m.warehouse_id = ?' : ''}
        ORDER BY m.date, m.id LIMIT 2000`,
      ...(wh ? [pid, from, to, wh] : [pid, from, to])
    );
    let run = opening.qty;
    const lines = [{ doc_number: null, date: from, qty_in: 0, qty_out: 0, is_opening: true, amount: opening.amount }];
    for (const m of rows) {
      run += m.qty_in - m.qty_out;
      lines.push({ ...m, balance: run });
    }
    const p = await get('SELECT * FROM catalog_products WHERE id=?', pid);
    return { product: p, opening, lines, closing: { qty: run } };
  });

  // ---------------------------------------------------------- Jurnal (amallar)
  router.get('/api/reports/audit',async (ctx) => {
    return all(
      `SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`,
      Math.min(Number(ctx.query.limit) || 200, 2000)
    );
  });
}

module.exports = { register };
