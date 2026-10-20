'use strict';
/**
 * 2D ОМБОР ХАРИТАСИ / СКЛАДСКАЯ КАРТА
 *
 * Ombor "kinoteatr zali" uslubida chiziladi:
 *   Зона (A, B, C)  ->  Ряд (qator)  ->  Ярус (qavat)  ->  Ячейка (joy)
 * Har bir "joy" bitta mahsulotni (yoki uning qismini) saqlaydi.
 */
const { all, get, run, tx } = require('../db');
const { bad, notFound } = require('../lib/http');
const stock = require('../services/stock');

// Katalog zonasiga "joy" qoidalari
const DEFAULT_MAP = { zones: 'A,B,C', rows: 4, levels: 2, slots: 10 };

// ------------------------------------------------------------- Strukturani yaratish

/**
 * Omborga 2D skelet yaratadi (mavjud joylarni o'chirmaydi).
 * zones: "A,B,C" · rows: qatorlar · levels: qavatlar · slots: qator uzunligi
 */
async function buildWarehouseMap(warehouseId, opt = {}) {
  const wh = await get('SELECT * FROM catalog_warehouses WHERE id = ?', warehouseId);
  if (!wh) throw notFound('Ombor topilmadi / Склад не найден');

  const zones = String(opt.zones || wh.map_zones || DEFAULT_MAP.zones)
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const rows = int(opt.rows ?? wh.map_rows, DEFAULT_MAP.rows, 1, 50);
  const levels = int(opt.levels ?? wh.map_levels, DEFAULT_MAP.levels, 1, 10);
  const slots = int(opt.slots ?? wh.map_slots, DEFAULT_MAP.slots, 1, 100);

  await run(
    `UPDATE catalog_warehouses SET map_zones=?, map_rows=?, map_levels=?, map_slots=? WHERE id=?`,
    zones.join(','), rows, levels, slots, warehouseId
  );

  let created = 0;
  await tx(async () => {
    for (const z of zones) {
      for (let r = 1; r <= rows; r++) {
        for (let l = 1; l <= levels; l++) {
          for (let p = 1; p <= slots; p++) {
            const code = `${z}-${String(r).padStart(2, '0')}-${l}-${String(p).padStart(2, '0')}`;
            const res = await run(
              `INSERT INTO catalog_locations
                 (warehouse_id, code, name_uz, name_ru, kind, zone, row_no, level_no, pos, capacity, is_active)
               VALUES (?,?,?,?,'CELL',?,?,?,?,0,1)
               ON CONFLICT(warehouse_id, code) DO UPDATE SET
                 zone=excluded.zone, row_no=excluded.row_no,
                 level_no=excluded.level_no, pos=excluded.pos`,
              warehouseId, code,
              `${z} zona · ${r}-qator · ${l}-qavat · ${p}-joy`,
              `Зона ${z} · ряд ${r} · ярус ${l} · место ${p}`,
              z, r, l, p
            );
            if (res.changes > 0) created++;
          }
        }
      }
    }
  });
  return { warehouse_id: warehouseId, zones, rows, levels, slots, created, total: zones.length * rows * levels * slots };
}

function int(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ------------------------------------------------------------- 2D xarita

/**
 * @param {number} warehouseId
 * @param {object} q  brand_id, category_id, only_occupied, q (qidiruv), group_by
 */
async function warehouseMap(warehouseId, q = {}) {
  const wh = await get('SELECT * FROM catalog_warehouses WHERE id = ?', warehouseId);
  if (!wh) throw notFound('Ombor topilmadi / Склад не найден');

  // 1) butun ombor bo'yicha pozitsiyalar + qoldiqlar
  const where = ['b.warehouse_id = ?'];
  const params = [warehouseId];
  if (q.zone) { where.push('l.zone = ?'); params.push(String(q.zone).toUpperCase()); }
  if (q.brand_id) { where.push('p.brand_id = ?'); params.push(q.brand_id); }
  if (q.category_id) { where.push('p.category_id = ?'); params.push(q.category_id); }
  if (q.only_occupied === '1') { where.push('b.qty > 0'); }
  if (q.q) {
    where.push('(p.sku LIKE ? OR p.barcode LIKE ? OR p.name_ru LIKE ? OR p.name_uz LIKE ?)');
    for (let i = 0; i < 4; i++) params.push(`%${q.q}%`);
  }

  const contents = await all(
    `SELECT b.location_id, b.product_id, b.qty, b.amount,
            p.sku, p.barcode, p.name_ru, p.name_uz, p.unit_id, p.min_stock, p.cost_price,
            p.brand_id, u.code AS unit_code, u.name_ru AS unit_ru,
            cat.id AS cat_id, cat.name_ru AS category, cat.name_uz AS category_uz,
            br.name_ru AS brand, br.name_uz AS brand_uz, l.zone AS loc_zone
       FROM reg_stock_balances b
       JOIN catalog_products p ON p.id = b.product_id
       LEFT JOIN catalog_locations l ON l.id = b.location_id
       LEFT JOIN catalog_units u ON u.id = p.unit_id
       LEFT JOIN catalog_categories cat ON cat.id = p.category_id
       LEFT JOIN catalog_brands br ON br.id = p.brand_id
      WHERE ${where.join(' AND ')} AND b.qty <> 0`,
    ...params
  );

  // 2) joylar (skelet) — faqat haqiqiy kataklar (zone to'ldirilgan)
  const locs = await all(
    `SELECT id, code, zone, row_no, level_no, pos, capacity, kind
       FROM catalog_locations
      WHERE warehouse_id = ? AND is_active = 1 AND zone IS NOT NULL AND zone <> ''
        ${q.zone ? 'AND zone = ?' : ''}
      ORDER BY zone, row_no, level_no, pos`,
    ...(q.zone ? [warehouseId, String(q.zone).toUpperCase()] : [warehouseId])
  );

  // 3) indekslar
  const byLoc = new Map();
  for (const c of contents) {
    if (!c.location_id) continue;
    if (!byLoc.has(c.location_id)) byLoc.set(c.location_id, []);
    byLoc.get(c.location_id).push(c);
  }

  // 4) skeletni qayta tuzish
  const locMap = new Map();
  for (const l of locs) {
    locMap.set(l.id, {
      id: l.id, code: l.code, zone: l.zone || '—', row: l.row_no || 1,
      level: l.level_no || 1, pos: l.pos || 1, capacity: l.capacity || 0,
      qty: 0, amount: 0, items: byLoc.get(l.id) || [],
    });
  }

  const zonesMap = new Map();
  for (const cell of locMap.values()) {
    const z = cell.zone;
    if (!zonesMap.has(z)) zonesMap.set(z, { zone: z, rows: new Map(), cells: 0, occupied: 0, qty: 0, amount: 0 });
    const Z = zonesMap.get(z);
    Z.cells++;
    for (const it of cell.items) { Z.qty += it.qty; Z.amount += it.amount; }
    if (cell.items.length) Z.occupied++;
    const rk = cell.row * 1000 + cell.level;
    if (!Z.rows.has(rk)) {
      Z.rows.set(rk, {
        row: cell.row, level: cell.level, slots: [],
        cells: 0, occupied: 0, qty: 0, amount: 0,
      });
    }
    const R = Z.rows.get(rk);
    R.slots.push(cell);
    R.cells++;
    for (const it of cell.items) { R.qty += it.qty; R.amount += it.amount; }
    if (cell.items.length) R.occupied++;
    cell.qty = cell.items.reduce((s, i) => s + i.qty, 0);
    cell.amount = cell.items.reduce((s, i) => s + i.amount, 0);
  }

  const zones = [...zonesMap.values()]
    .sort((a, b) => a.zone.localeCompare(b.zone))
    .map((Z) => ({
      zone: Z.zone, cells: Z.cells, occupied: Z.occupied, qty: Z.qty, amount: Z.amount,
      rows: [...Z.rows.values()]
        .sort((a, b) => a.row - b.row || a.level - b.level)
        .map((R) => ({ ...R, slots: R.slots.sort((a, b) => a.pos - b.pos) })),
    }));

  // 5) bo'sh joylar
  const emptyCells = zones.reduce((s, Z) => s + (Z.cells - Z.occupied), 0);
  const withoutLocation = (await get(
    `SELECT COUNT(DISTINCT b.product_id) AS c
       FROM reg_stock_balances b JOIN catalog_products p ON p.id = b.product_id
      WHERE b.warehouse_id = ? AND b.qty > 0 AND COALESCE(b.location_id, 0) = 0`,
    warehouseId
  )).c;

  return {
    warehouse: wh,
    zones,
    summary: {
      cells: zones.reduce((s, Z) => s + Z.cells, 0),
      occupied: zones.reduce((s, Z) => s + Z.occupied, 0),
      empty: emptyCells,
      fill_rate: zones.reduce((s, Z) => s + Z.cells, 0)
        ? Math.round(zones.reduce((s, Z) => s + Z.occupied, 0) / zones.reduce((s, Z) => s + Z.cells, 0) * 100) : 0,
      qty: contents.reduce((s, c) => s + c.qty, 0),
      amount: contents.reduce((s, c) => s + c.amount, 0),
      products: new Set(contents.map((c) => c.product_id)).size,
      without_location: withoutLocation,
    },
  };
}

// ------------------------------------------------------------- Joylashuv

/** Mahsulotni aynan katakka qo'yish (qo'lda joylash) */
async function placeProduct(warehouseId, locationId, productId, qty) {
  const loc = await get('SELECT * FROM catalog_locations WHERE id=? AND warehouse_id=?', locationId, warehouseId);
  if (!loc) throw bad('Joy topilmadi / Место не найдено');
  const p = await get('SELECT * FROM catalog_products WHERE id=?', productId);
  if (!p) throw bad('Tovar topilmadi / Товар не найден');
  if (loc.capacity > 0 && qty > loc.capacity) {
    throw bad(`Joy sig‘imi ${loc.capacity} — ${qty} sig‘maydi / Ёмкость ${loc.capacity}`);
  }
  return { ok: true, message: `${p.sku} → ${loc.code}`, product_id: productId, location_id: locationId };
}

/**
 * Bo'sh joylarga avtomatik joylash (1C uslubidagi "размещение").
 * `apply=1` bo'lsa haqiqiy PLACEMENT hujjati yaratib, o'tkazadi.
 */
async function autoPlace(warehouseId, opt = {}) {
  const maxPerCell = Number(opt.max_per_cell) || 0;
  const zone = opt.zone || null;

  const need = await all(
    `SELECT b.product_id, SUM(b.qty) AS qty, p.sku, p.name_ru, p.name_uz
       FROM reg_stock_balances b
       JOIN catalog_products p ON p.id = b.product_id
      WHERE b.warehouse_id = ? AND b.qty > 0 AND COALESCE(b.location_id,0) = 0
      GROUP BY b.product_id ORDER BY SUM(b.qty) DESC`,
    warehouseId
  );
  const free = await all(
    `SELECT l.id, l.code, l.zone, l.row_no, l.level_no, l.pos, l.capacity
       FROM catalog_locations l
      WHERE l.warehouse_id = ? AND l.is_active = 1 AND l.zone IS NOT NULL
        ${zone ? 'AND l.zone = ?' : ''}
        AND NOT EXISTS (SELECT 1 FROM reg_stock_balances b
                         WHERE b.location_id = l.id AND b.qty > 0)
      ORDER BY l.zone, l.row_no, l.level_no, l.pos`,
    ...(zone ? [warehouseId, zone] : [warehouseId])
  );

  // reja: har bir SKU uchun bitta bo'sh katak
  const plan = need.slice(0, free.length).map((n, i) => ({
    product_id: n.product_id, sku: n.sku, qty: n.qty,
    location_id: free[i].id, code: free[i].code,
    zone: free[i].zone, row: free[i].row_no, level: free[i].level_no, pos: free[i].pos,
  }));

  const res = {
    warehouse_id: warehouseId,
    products: need.length,
    free_cells: free.length,
    to_place: plan.length,
    unplaced: need.length - plan.length,
    plan,
  };

  if (opt.apply === '1' || opt.apply === true) {
    res.applied = await applyPlacement(warehouseId, plan);
  }
  return res;
}

/** Reja asosida PLACEMENT hujjati yaratib o'tkazadi */
async function applyPlacement(warehouseId, plan) {
  if (!plan.length) return { documents: 0, lines: 0 };
  const date = new Date().toISOString().slice(0, 10);
  let docs = 0, lines = 0;
  // 1 hujjatda ko'pi bilan 200 qator
  for (let i = 0; i < plan.length; i += 200) {
    const chunk = plan.slice(i, i + 200);
    const created = await stock.createDocument({
      type: 'PLACEMENT', date, warehouse_id: warehouseId,
      note: 'Avtomatik joylash (размещение)',
      lines: chunk.map((c) => ({ product_id: c.product_id, location_id: c.location_id, qty: c.qty, price: 0 })),
    }, { id: null, login: 'system' });
    await stock.post(created.document.id, { id: null, login: 'system' });
    docs++;
    lines += chunk.length;
  }
  return { documents: docs, lines };
}

// ------------------------------------------------------------- Turlar / Brendlar

/** Turlar (категории) kesimidagi qoldiq — alohida ko'rsatish */
async function byCategories(warehouseId, q = {}) {
  const where = ['1=1'];
  const params = [];
  if (warehouseId) { where.push('b.warehouse_id = ?'); params.push(warehouseId); }
  if (q.brand_id) { where.push('p.brand_id = ?'); params.push(q.brand_id); }
  const rows = await all(
    `SELECT cat.id, cat.code, cat.name_ru, cat.name_uz, cat.parent_id,
            COUNT(DISTINCT p.id) AS products,
            COUNT(DISTINCT b.product_id) AS in_stock,
            COALESCE(SUM(b.qty), 0) AS qty,
            COALESCE(SUM(b.amount), 0) AS amount
       FROM reg_stock_balances b
       JOIN catalog_products p ON p.id = b.product_id
       JOIN catalog_categories cat ON cat.id = p.category_id
       LEFT JOIN catalog_brands br ON br.id = p.brand_id
      WHERE ${where.join(' AND ')}
      GROUP BY cat.id ORDER BY amount DESC`,
    ...params
  );
  return rows;
}

/** Brendlar kesimidagi qoldiq — alohida ko'rsatish */
async function byBrands(warehouseId, q = {}) {
  const where = ['1=1'];
  const params = [];
  if (warehouseId) { where.push('b.warehouse_id = ?'); params.push(warehouseId); }
  if (q.category_id) { where.push('p.category_id = ?'); params.push(q.category_id); }
  return all(
    `SELECT br.id, br.code, br.name_ru, br.name_uz, br.country,
            COUNT(DISTINCT p.id) AS products,
            COUNT(DISTINCT b.product_id) AS in_stock,
            COALESCE(SUM(b.qty), 0) AS qty,
            COALESCE(SUM(b.amount), 0) AS amount
       FROM reg_stock_balances b
       JOIN catalog_products p ON p.id = b.product_id
       JOIN catalog_brands br ON br.id = p.brand_id
       LEFT JOIN catalog_categories cat ON cat.id = p.category_id
      WHERE ${where.join(' AND ')}
      GROUP BY br.id ORDER BY amount DESC`,
    ...params
  );
}

/** Tovar -> qaysi ombor, qaysi zonada, qaysi qator/qavat/joyda */
async function productPlacement(productId) {
  return all(
    `SELECT b.warehouse_id, w.code AS warehouse_code,
            w.name_ru AS warehouse_ru, w.name_uz AS warehouse_uz,
            l.id AS location_id, l.code AS location_code,
            l.zone, l.row_no, l.level_no, l.pos,
            b.qty, b.amount,
            CASE WHEN l.id IS NULL THEN '—' ELSE
              l.zone || ' zona · ' || l.row_no || '-qator · ' || l.level_no || '-qavat · ' || l.pos || '-joy'
            END AS place
       FROM reg_stock_balances b
       JOIN catalog_warehouses w ON w.id = b.warehouse_id
       LEFT JOIN catalog_locations l ON l.id = b.location_id
      WHERE b.product_id = ? AND b.qty <> 0
      ORDER BY w.code, l.code`,
    productId
  );
}

// ------------------------------------------------------------- Routes

async function register(router) {
  // 2D xarita
  router.get('/api/warehouse/map', async (ctx) => {
    const wh = Number(ctx.query.warehouse_id);
    if (!wh) throw bad('warehouse_id kerak / Требуется warehouse_id');
    return warehouseMap(wh, ctx.query);
  });

  // Skelet yaratish / yangilash
  router.post('/api/warehouse/map/build', async (ctx) => {
    const b = ctx.body || {};
    const wh = Number(b.warehouse_id);
    if (!wh) throw bad('warehouse_id kerak / Требуется warehouse_id');
    return buildWarehouseMap(wh, b);
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // Avtomatik joylash rejasi
  router.get('/api/warehouse/auto-place', async (ctx) => {
    const wh = Number(ctx.query.warehouse_id);
    if (!wh) throw bad('warehouse_id kerak / Требуется warehouse_id');
    return autoPlace(wh, ctx.query);
  });

  // Mahsulot joylashuvi
  router.get('/api/warehouse/product-placement', async (ctx) => {
    const pid = Number(ctx.query.product_id);
    if (!pid) throw bad('product_id kerak / Требуется product_id');
    return productPlacement(pid);
  });

  // Turlar / Brendlar
  router.get('/api/warehouse/by-category', async (ctx) =>
    await byCategories(Number(ctx.query.warehouse_id) || 0, ctx.query));
  router.get('/api/warehouse/by-brand', async (ctx) =>
    await byBrands(Number(ctx.query.warehouse_id) || 0, ctx.query));

  // Qisqa: ombor bo'yicha barcha joylar (editor uchun select)
  router.get('/api/warehouse/cells',async (ctx) => {
    const wh = Number(ctx.query.warehouse_id);
    if (!wh) throw bad('warehouse_id kerak / Требуется warehouse_id');
    return all(
      `SELECT l.id, l.code, l.zone, l.row_no, l.level_no, l.pos, l.capacity,
              (SELECT COALESCE(SUM(b.qty),0) FROM reg_stock_balances b
                WHERE b.location_id = l.id AND b.qty > 0) AS qty,
              (SELECT p.sku FROM reg_stock_balances b JOIN catalog_products p ON p.id = b.product_id
                WHERE b.location_id = l.id AND b.qty > 0 LIMIT 1) AS sku
         FROM catalog_locations l
        WHERE l.warehouse_id = ? AND l.is_active = 1 AND l.zone IS NOT NULL AND l.zone <> ''
        ORDER BY l.zone, l.row_no, l.level_no, l.pos LIMIT 2000`,
      wh
    );
  });
}

module.exports = {
  register, buildWarehouseMap, warehouseMap, autoPlace, placeProduct,
  byCategories, byBrands, productPlacement, DEFAULT_MAP,
};
