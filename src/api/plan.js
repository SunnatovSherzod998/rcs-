'use strict';
/**
 * 2D БИНО РЕЖАСИ / 2D ПЛАН ЗДАНИЯ
 *
 *   Xona (комната)  →  Stellaj (стеллаж)  →  Katak (ячейка)  →  Tovar (товар + фото)
 *
 * Bino rejasida xonalar o'z o'rnida chiziladi (pos_x / pos_y),
 * xona bosilganda ichidagi stellajlar ko'rinadi,
 * stellajdagi katak bosilganda tovar kartasi (rasmi bilan) ochiladi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { all, get, run, tx, DATA_DIR } = require('../db');
const { bad, notFound } = require('../lib/http');
const stock = require('../services/stock');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ROOM_KINDS = {
  STORAGE:    { uz: 'Saqlash', ru: 'Хранение' },
  RECEIVING:  { uz: 'Qabul qilish', ru: 'Приёмка' },
  SHIPPING:   { uz: 'Yuborish', ru: 'Отгрузка' },
  COOLING:    { uz: 'Sovuq xona', ru: 'Холодная' },
  QUARANTINE: { uz: 'Karantin', ru: 'Карантин' },
  BUFFER:     { uz: 'Bufer', ru: 'Буфер' },
};

// ============================================================ BINO REJASINI QURISH

/**
 * Omborga xona + stellaj + katak skeletini quradi (binoning rejasiga mos).
 * @param {number} warehouseId
 * @param {object} opt  {cols, rooms, racks_per_room, levels, slots}
 */
async function buildPlan(warehouseId, opt = {}) {
  const wh = await get('SELECT * FROM catalog_warehouses WHERE id = ?', warehouseId);
  if (!wh) throw notFound('Ombor topilmadi / Склад не найден');

  const cols = int(opt.cols ?? wh.map_cols, 3, 1, 10);
  const roomCount = int(opt.rooms ?? wh.map_rooms, 6, 1, 60);
  const racksPerRoom = int(opt.racks_per_room, 3, 1, 20);
  const levels = int(opt.levels, 2, 1, 8);
  const slots = int(opt.slots, 4, 1, 30);

  const startNum = 100;
  let roomsCreated = 0, racksCreated = 0, cellsCreated = 0;

  await tx(async () => {
    await run('UPDATE catalog_warehouses SET map_cols=?, map_rooms=? WHERE id=?', cols, roomCount, warehouseId);

    for (let i = 0; i < roomCount; i++) {
      const code = String(startNum + i + 1);
      const row = Math.floor(i / cols);
      const col = i % cols;

      // xona turi: 1-qabul, oxirgi-yuborish, orasida saqlash
      let kind = 'STORAGE';
      if (i === 0) kind = 'RECEIVING';
      else if (i === roomCount - 1) kind = 'SHIPPING';
      else if (col === 0 && row > 0) kind = 'QUARANTINE';
      else if (row === Math.floor(roomCount / cols) - 1) kind = 'COOLING';

      const roomCode = wh.code + '-' + code;
      await run(
        `INSERT INTO catalog_rooms (warehouse_id, code, name_uz, name_ru, kind, floor, pos_x, pos_y, width, height, temperature, is_active)
         VALUES (?,?,?,?,?,1,?,?,2,2,?,1)
         ON CONFLICT(warehouse_id, code) DO UPDATE SET kind=excluded.kind`,
        warehouseId, roomCode,
        `Xona ${code} — ${ROOM_KINDS[kind]?.uz || kind}`,
        `Комната ${code} — ${ROOM_KINDS[kind]?.ru || kind}`,
        kind, col * 3, row * 3,
        kind === 'COOLING' ? 4 : null
      );
      const room = await get('SELECT id FROM catalog_rooms WHERE warehouse_id=? AND code=?', warehouseId, roomCode);
      const roomId = room.id;

      for (let r = 1; r <= racksPerRoom; r++) {
        const rackCode = `${roomCode}-S${String(r).padStart(2, '0')}`;
        await run(
          `INSERT INTO catalog_racks (room_id, code, name_uz, name_ru, kind, pos_x, pos_y, levels, capacity, is_active)
           VALUES (?,?,?,?,'RACK',?,?,?,0,1)
           ON CONFLICT(room_id, code) DO UPDATE SET levels=excluded.levels`,
          roomId, rackCode,
          `${code}-xona, ${r}-stellaj`,
          `${code}-комната, стеллаж ${r}`,
          (r - 1) % slots, Math.floor((r - 1) / slots), levels
        );
        const rack = await get('SELECT id FROM catalog_racks WHERE room_id=? AND code=?', roomId, rackCode);
        const rackId = rack.id;

        for (let l = 1; l <= levels; l++) {
          for (let p = 1; p <= slots; p++) {
            const cellCode = `${rackCode}-${l}-${String(p).padStart(2, '0')}`;
            const res = await run(
              `INSERT INTO catalog_locations
                 (warehouse_id, code, name_uz, name_ru, kind, room_id, rack_id, level_no, pos, capacity, is_active)
               VALUES (?,?,?,?,'CELL',?,?,?,?,0,1)
               ON CONFLICT(warehouse_id, code) DO UPDATE SET room_id=excluded.room_id, rack_id=excluded.rack_id`,
              warehouseId, cellCode,
              `${code}-xona / ${r}-stellaj / ${l}-qavat / ${p}-joy`,
              `${code}-комната / стеллаж ${r} / ярус ${l} / место ${p}`,
              roomId, rackId, l, p
            );
            if (res.changes > 0) cellsCreated++;
          }
        }
        racksCreated++;
      }
      roomsCreated++;
    }
  });

  return {
    warehouse_id: warehouseId,
    rooms: roomCount,
    racks: roomsCreated * racksPerRoom,
    cells: roomsCreated * racksPerRoom * levels * slots,
    created: { rooms: roomsCreated, racks: racksCreated, cells: cellsCreated },
    layout: { cols, racks_per_room: racksPerRoom, levels, slots },
  };
}

function int(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ============================================================ 1-QAVAT: XONALAR

/** Ombordagi barcha xonalar (reja + statistika) */
async function buildingPlan(warehouseId, q = {}) {
  const wh = await get('SELECT * FROM catalog_warehouses WHERE id = ?', warehouseId);
  if (!wh) throw notFound('Ombor topilmadi / Склад не найден');

  const where = ['r.warehouse_id = ?', 'r.is_active = 1'];
  const params = [warehouseId];
  if (q.kind) { where.push('r.kind = ?'); params.push(q.kind); }
  if (q.q) {
    where.push('(r.code LIKE ? OR r.name_ru LIKE ? OR r.name_uz LIKE ?)');
    for (let i = 0; i < 3; i++) params.push(`%${q.q}%`);
  }

  const rooms = await all(
    `SELECT r.*,
            (SELECT COUNT(*) FROM catalog_racks k WHERE k.room_id = r.id AND k.is_active = 1) AS racks,
            (SELECT COUNT(*) FROM catalog_locations l WHERE l.room_id = r.id AND l.is_active = 1) AS cells,
            (SELECT COUNT(DISTINCT b.product_id) FROM reg_stock_balances b
               JOIN catalog_locations l ON l.id = b.location_id
              WHERE l.room_id = r.id AND b.qty > 0) AS products,
            (SELECT COALESCE(SUM(b.qty),0) FROM reg_stock_balances b
               JOIN catalog_locations l ON l.id = b.location_id
              WHERE l.room_id = r.id AND b.qty > 0) AS qty,
            (SELECT COALESCE(SUM(b.amount),0) FROM reg_stock_balances b
               JOIN catalog_locations l ON l.id = b.location_id
              WHERE l.room_id = r.id AND b.qty > 0) AS amount,
            (SELECT COUNT(DISTINCT b.product_id) FROM reg_stock_balances b
               JOIN catalog_locations l ON l.id = b.location_id
              WHERE l.room_id = r.id AND b.qty > 0) AS used_cells
      FROM catalog_rooms r
     WHERE ${where.join(' AND ')}
     ORDER BY r.floor, r.pos_y, r.pos_x`,
    ...params
  );

  // reja o'lchamlari
  const maxX = Math.max(2, ...rooms.map((r) => r.pos_x + r.width));
  const maxY = Math.max(2, ...rooms.map((r) => r.pos_y + r.height));

  const summary = {
    rooms: rooms.length,
    racks: rooms.reduce((s, r) => s + r.racks, 0),
    cells: rooms.reduce((s, r) => s + r.cells, 0),
    used_cells: rooms.reduce((s, r) => s + (r.used_cells || 0), 0),
    products: new Set().size,
    qty: rooms.reduce((s, r) => s + (r.qty || 0), 0),
    amount: rooms.reduce((s, r) => s + (r.amount || 0), 0),
  };
  summary.fill_rate = summary.cells
    ? Math.round(summary.used_cells / summary.cells * 100) : 0;

  return { warehouse: wh, rooms, grid: { cols: maxX, rows: maxY }, summary };
}

// ============================================================ 2-QAVAT: XONA ICHI

/** Xona ichidagi stellajlar va ularning kataklari */
async function roomDetail(roomId, q = {}) {
  const room = await get('SELECT * FROM catalog_rooms WHERE id = ?', roomId);
  if (!room) throw notFound('Xona topilmadi / Комната не найдена');

  const racks = await all(
    `SELECT k.*,
            (SELECT COUNT(*) FROM catalog_locations l WHERE l.rack_id = k.id AND l.is_active = 1) AS cells,
            (SELECT COUNT(*) FROM reg_stock_balances b
               JOIN catalog_locations l ON l.id = b.location_id
              WHERE l.rack_id = k.id AND b.qty > 0) AS used,
            (SELECT COALESCE(SUM(b.qty),0) FROM reg_stock_balances b
               JOIN catalog_locations l ON l.id = b.location_id
              WHERE l.rack_id = k.id AND b.qty > 0) AS qty,
            (SELECT COALESCE(SUM(b.amount),0) FROM reg_stock_balances b
               JOIN catalog_locations l ON l.id = b.location_id
              WHERE l.rack_id = k.id AND b.qty > 0) AS amount
      FROM catalog_racks k
     WHERE k.room_id = ? AND k.is_active = 1
     ORDER BY k.pos_y, k.pos_x, k.code`,
    roomId
  );

  // har bir stellaj uchun qavatlar -> kataklar
  const cellsWhere = ['l.room_id = ?', 'l.is_active = 1'];
  const cellParams = [roomId];
  if (q.only_occupied === '1') cellsWhere.push('b.qty > 0');
  if (q.brand_id) { cellsWhere.push('p.brand_id = ?'); cellParams.push(q.brand_id); }
  if (q.category_id) { cellsWhere.push('p.category_id = ?'); cellParams.push(q.category_id); }
  if (q.q) {
    cellsWhere.push('(p.sku LIKE ? OR p.barcode LIKE ? OR p.name_ru LIKE ? OR p.name_uz LIKE ?)');
    for (let i = 0; i < 4; i++) cellParams.push(`%${q.q}%`);
  }

  const contents = await all(
    `SELECT l.id AS location_id, l.rack_id, l.level_no, l.pos, l.code, l.capacity,
            b.product_id, b.qty, b.amount,
            p.sku, p.barcode, p.name_ru, p.name_uz, p.image_url, p.color, p.min_stock,
            u.code AS unit_code, u.name_ru AS unit_ru,
            br.id AS brand_id, br.name_ru AS brand, br.name_uz AS brand_uz,
            cat.id AS cat_id, cat.name_ru AS category, cat.name_uz AS category_uz
       FROM catalog_locations l
       JOIN reg_stock_balances b ON b.location_id = l.id
       JOIN catalog_products p ON p.id = b.product_id
       LEFT JOIN catalog_units u ON u.id = p.unit_id
       LEFT JOIN catalog_brands br ON br.id = p.brand_id
       LEFT JOIN catalog_categories cat ON cat.id = p.category_id
      WHERE ${cellsWhere.join(' AND ')} AND b.qty <> 0`,
    ...cellParams
  );

  const byCell = new Map();
  for (const c of contents) {
    if (!byCell.has(c.location_id)) byCell.set(c.location_id, []);
    byCell.get(c.location_id).push(c);
  }

  const rackList = racks.map((k) => {
    const levels = [];
    for (let l = 1; l <= (k.levels || 1); l++) levels.push({ level: l, cells: [] });
    return { ...k, levels };
  });
  const rackMap = new Map(rackList.map((k) => [k.id, k]));

  // bo'sh kataklarni ham qo'shish
  const emptyCells = await all(
    `SELECT id, rack_id, level_no, pos, code, capacity FROM catalog_locations
      WHERE room_id = ? AND is_active = 1`, roomId
  );
  for (const c of emptyCells) {
    const k = rackMap.get(c.rack_id);
    if (!k) continue;
    const lv = k.levels.find((x) => x.level === c.level_no) || k.levels[0];
    if (!byCell.has(c.id)) lv.cells.push({ ...c, items: [] });
  }

  for (const [locId, items] of byCell) {
    const k = rackMap.get(items[0].rack_id);
    if (!k) continue;
    const lv = k.levels.find((x) => x.level === items[0].level_no) || k.levels[0];
    lv.cells.push({
      id: locId, rack_id: items[0].rack_id, level_no: items[0].level_no,
      pos: items[0].pos, code: items[0].code, capacity: items[0].capacity,
      qty: items.reduce((s, i) => s + i.qty, 0),
      amount: items.reduce((s, i) => s + i.amount, 0),
      items,
    });
  }
  for (const k of rackList) {
    for (const lv of k.levels) {
      lv.cells.sort((a, b) => a.pos - b.pos);
      lv.qty = lv.cells.reduce((s, c) => s + c.qty, 0);
      lv.amount = lv.cells.reduce((s, c) => s + c.amount, 0);
    }
  }

  const wh = await get('SELECT id, code, name_ru, name_uz FROM catalog_warehouses WHERE id=?', room.warehouse_id);

  return {
    room, warehouse: wh, racks: rackList,
    summary: {
      racks: racks.length,
      cells: rackList.reduce((s, k) => s + k.levels.reduce((a, l) => a + l.cells.length, 0), 0),
      used: contents.length,
      qty: contents.reduce((s, c) => s + c.qty, 0),
      amount: Math.round(contents.reduce((s, c) => s + c.amount, 0) * 100) / 100,
      products: new Set(contents.map((c) => c.product_id)).size,
    },
  };
}

// ============================================================ 3-QAVAT: TOVAR KARTASI

/** Tovar kartasi: rasm + barcha ombor/xona/joy ma'lumotlari */
async function productCard(productId) {
  const p = await get(
    `SELECT p.*, u.code AS unit_code, u.name_ru AS unit_ru, u.name_uz AS unit_uz,
            br.id AS brand_id, br.name_ru AS brand, br.name_uz AS brand_uz,
            cat.id AS cat_id, cat.name_ru AS category, cat.name_uz AS category_uz,
            cur.code AS currency
       FROM catalog_products p
       LEFT JOIN catalog_units u ON u.id = p.unit_id
       LEFT JOIN catalog_brands br ON br.id = p.brand_id
       LEFT JOIN catalog_categories cat ON cat.id = p.category_id
       LEFT JOIN catalog_currencies cur ON cur.id = p.currency_id
      WHERE p.id = ?`, productId
  );
  if (!p) throw notFound('Tovar topilmadi / Товар не найден');

  const placement = await all(
    `SELECT b.warehouse_id, w.code AS warehouse_code, w.name_ru AS warehouse_ru, w.name_uz AS warehouse_uz,
            b.location_id, l.code AS location_code, l.level_no, l.pos,
            r.id AS room_id, r.code AS room_code, r.name_ru AS room_ru, r.name_uz AS room_uz, r.kind AS room_kind,
            k.code AS rack_code,
            b.qty, b.amount
       FROM reg_stock_balances b
       JOIN catalog_warehouses w ON w.id = b.warehouse_id
       LEFT JOIN catalog_locations l ON l.id = b.location_id
       LEFT JOIN catalog_rooms r ON r.id = l.room_id
       LEFT JOIN catalog_racks k ON k.id = l.rack_id
      WHERE b.product_id = ? AND b.qty <> 0
      ORDER BY w.code, r.code, k.code, l.code`,
    productId
  );

  // omborlar kesimida
  const byWarehouse = await all(
    `SELECT b.warehouse_id, w.code, w.name_ru, w.name_uz, SUM(b.qty) AS qty, SUM(b.amount) AS amount
       FROM reg_stock_balances b JOIN catalog_warehouses w ON w.id = b.warehouse_id
      WHERE b.product_id = ? AND b.qty <> 0
      GROUP BY b.warehouse_id ORDER BY w.code`,
    productId
  );

  // harakatlar
  const movements = await all(
    `SELECT m.date, m.doc_type, m.qty_in, m.qty_out, d.number,
            w.name_ru AS warehouse_ru, w.name_uz AS warehouse_uz
       FROM reg_stock_movements m
       LEFT JOIN documents d ON d.id = m.document_id
       LEFT JOIN catalog_warehouses w ON w.id = m.warehouse_id
      WHERE m.product_id = ? ORDER BY m.date DESC, m.id DESC LIMIT 60`,
    productId
  );

  const totalQty = byWarehouse.reduce((s, w) => s + w.qty, 0);
  const avgCost = totalQty > 0
    ? byWarehouse.reduce((s, w) => s + w.amount, 0) / totalQty : p.cost_price;

  return {
    product: p,
    image: p.image_url || null,
    by_warehouse: byWarehouse,
    placement,
    movements,
    totals: {
      qty: totalQty,
      amount: Math.round(byWarehouse.reduce((s, w) => s + w.amount, 0) * 100) / 100,
      avg_cost: Math.round(avgCost * 100) / 100,
      retail_total: Math.round(totalQty * (p.sale_price || 0) * 100) / 100,
      potential_profit: Math.round((totalQty * ((p.sale_price || 0) - avgCost)) * 100) / 100,
      locations: placement.filter((x) => x.location_id).length,
    },
  };
}

// ============================================================ RASM YUKLASH

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
};

/**
 * Rasmdan data URL ni saqlaydi (serverga fayl yozmasdan).
 * Kelajakda: katta fayllar uchun /uploads ga yoziladi.
 */
function saveImage(dataUrl, productId) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) throw bad('Rasm formati noto‘g‘ri / Неверный формат изображения');
  const mime = m[1].toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) throw bad('Faqat JPG/PNG/GIF/WEBP/SVG / Только JPG/PNG/GIF/WEBP/SVG');

  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) {
    throw bad('Rasm 4 MB dan katta / Изображение больше 4 МБ');
  }

  const name = `p${productId || 'x'}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

/** Rasmlarni katalog uchun olish (to'liq ro'yxat + MIME) */
function uploadsInfo() {
  const files = fs.existsSync(UPLOAD_DIR)
    ? fs.readdirSync(UPLOAD_DIR).map((f) => ({
        name: f,
        url: '/uploads/' + f,
        size: fs.statSync(path.join(UPLOAD_DIR, f)).size,
      }))
    : [];
  return { dir: UPLOAD_DIR, count: files.length, files: files.slice(0, 200) };
}

// ============================================================ JOYLASH (xona bo'yicha)

/** Xona bo'yicha avtomatik joylash */
async function autoPlaceRoom(roomId) {
  const room = await get('SELECT * FROM catalog_rooms WHERE id=?', roomId);
  if (!room) throw notFound('Xona topilmadi / Комната не найдена');

  const need = await all(
    `SELECT b.product_id, SUM(b.qty) AS qty
       FROM reg_stock_balances b JOIN catalog_products p ON p.id = b.product_id
      WHERE b.warehouse_id = ? AND b.qty > 0 AND COALESCE(b.location_id,0) = 0
      GROUP BY b.product_id ORDER BY SUM(b.qty) DESC`, room.warehouse_id
  );
  const free = await all(
    `SELECT l.id FROM catalog_locations l
      WHERE l.room_id = ? AND l.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM reg_stock_balances b
                         WHERE b.location_id = l.id AND b.qty > 0)
      ORDER BY l.rack_id, l.level_no, l.pos`, roomId
  );

  const plan = need.slice(0, free.length).map((n, i) => ({
    product_id: n.product_id, qty: n.qty, location_id: free[i].id,
  }));

  let applied = null;
  if (plan.length) {
    const created = await stock.createDocument({
      type: 'PLACEMENT', date: new Date().toISOString().slice(0, 10),
      warehouse_id: room.warehouse_id, note: `Avtomatik joylash: ${room.code}`,
      lines: plan.map((c) => ({ product_id: c.product_id, location_id: c.location_id, qty: c.qty, price: 0 })),
    }, { id: null, login: 'system' });
    await stock.post(created.document.id, { id: null, login: 'system' });
    applied = { document_id: created.document.id, lines: plan.length };
  }
  return {
    room_id: roomId,
    to_place: plan.length,
    remaining: need.length - plan.length,
    applied,
  };
}

/**
 * Ombor bo'yicha avtomatik joylash — tovarlar sig'gancha xonalarga tarqatadi.
 * Avval STORAGE xonalari, keyin QUARANTINE / COOLING
 * (RECEIVING va SHIPPING — vaqtinchalik zaxira).
 */
async function autoPlaceWarehouse(warehouseId) {
  const wh = await get('SELECT * FROM catalog_warehouses WHERE id=?', warehouseId);
  if (!wh) throw notFound('Ombor topilmadi / Склад не найден');

  const rooms = await all(
    `SELECT id, code, kind FROM catalog_rooms
      WHERE warehouse_id = ? AND is_active = 1
      ORDER BY CASE kind WHEN 'STORAGE' THEN 0 WHEN 'QUARANTINE' THEN 1
                        WHEN 'COOLING' THEN 2 WHEN 'RECEIVING' THEN 3
                        WHEN 'SHIPPING' THEN 4 ELSE 5 END, code`,
    warehouseId
  );

  let total = 0, usedRooms = 0;
  const detail = [];
  for (const r of rooms) {
    const res = await autoPlaceRoom(r.id);
    if (res.to_place > 0) {
      total += res.to_place;
      usedRooms++;
      detail.push({ room: r.code, kind: r.kind, placed: res.to_place });
    }
    if (res.remaining === 0) break;
  }
  return { warehouse_id: warehouseId, placed: total, rooms_used: usedRooms, detail };
}

// ============================================================ ROUTES

async function register(router) {
  router.get('/api/plan/rooms', async (ctx) => {
    const wh = Number(ctx.query.warehouse_id);
    if (!wh) throw bad('warehouse_id kerak / Требуется warehouse_id');
    return buildingPlan(wh, ctx.query);
  });

  router.post('/api/plan/build', async (ctx) => {
    const b = ctx.body || {};
    const wh = Number(b.warehouse_id);
    if (!wh) throw bad('warehouse_id kerak / Требуется warehouse_id');
    return buildPlan(wh, b);
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  router.get('/api/plan/room', async (ctx) => {
    const id = Number(ctx.query.room_id);
    if (!id) throw bad('room_id kerak / Требуется room_id');
    return roomDetail(id, ctx.query);
  });

  router.get('/api/plan/product', async (ctx) => {
    const id = Number(ctx.query.product_id);
    if (!id) throw bad('product_id kerak / Требуется product_id');
    return productCard(id);
  });

  router.post('/api/plan/room/auto-place', async (ctx) => {
    const id = Number((ctx.body || {}).room_id);
    if (!id) throw bad('room_id kerak / Требуется room_id');
    return autoPlaceRoom(id);
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  router.post('/api/plan/warehouse/auto-place', async (ctx) => {
    const id = Number((ctx.body || {}).warehouse_id);
    if (!id) throw bad('warehouse_id kerak / Требуется warehouse_id');
    return autoPlaceWarehouse(id);
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // xonaga stellaj qo'shish (1 qator × 4 joy bilan)
  router.post('/api/plan/room/rack',async (ctx) => {
    const roomId = Number((ctx.body || {}).room_id);
    if (!roomId) throw bad('room_id kerak / Требуется room_id');
    const room = await get('SELECT r.*, w.id AS wh_id FROM catalog_rooms r JOIN catalog_warehouses w ON w.id=r.warehouse_id WHERE r.id=?', roomId);
    if (!room) throw notFound('Xona topilmadi / Комната не найдена');
    const n = (await get('SELECT COUNT(*) AS c FROM catalog_racks WHERE room_id=?', roomId)).c + 1;
    const code = `${room.code}-S${String(n).padStart(2, '0')}`;
    await run(`INSERT INTO catalog_racks (room_id, code, name_uz, name_ru, kind, levels, is_active)
         VALUES (?,?,?,?,'RACK',1,1)`,
      roomId, code, `${n}-stellaj`, `Стеллаж ${n}`);
    const rack = await get('SELECT id FROM catalog_racks WHERE room_id=? AND code=?', roomId, code);
    for (let p = 1; p <= 4; p++) {
      await run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind, room_id, rack_id, level_no, pos, capacity, is_active)
           VALUES (?,?,?,?,'CELL',?,?,1,?,0,1) ON CONFLICT(warehouse_id, code) DO NOTHING`,
        room.wh_id, `${code}-1-${String(p).padStart(2, '0')}`, `${code} / 1-qator / ${p}-joy`, `${code} / ряд 1 / место ${p}`,
        roomId, rack.id, p);
    }
    return { ok: true, code };
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // stellajga qator qo'shish (yangi level)
  router.post('/api/plan/rack/row',async (ctx) => {
    const rackId = Number((ctx.body || {}).rack_id);
    if (!rackId) throw bad('rack_id kerak / Требуется rack_id');
    const rack = await get(`SELECT k.*, r.warehouse_id AS wh_id, r.id AS room_id FROM catalog_racks k JOIN catalog_rooms r ON r.id=k.room_id WHERE k.id=?`, rackId);
    if (!rack) throw notFound('Stellaj topilmadi / Стеллаж не найден');
    const newLevel = (rack.levels || 0) + 1;
    await run('UPDATE catalog_racks SET levels=? WHERE id=?', newLevel, rackId);
    // avvalgi qatordagi joylar soniga qarab
    let slots = (await get(`SELECT COUNT(*) AS c FROM catalog_locations WHERE rack_id=? AND level_no=1`, rackId)).c;
    if (!slots) slots = 4;
    for (let p = 1; p <= slots; p++) {
      await run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind, room_id, rack_id, level_no, pos, capacity, is_active)
           VALUES (?,?,?,?,'CELL',?,?,?,?,0,1) ON CONFLICT(warehouse_id, code) DO NOTHING`,
        rack.wh_id, `${rack.code}-${newLevel}-${String(p).padStart(2, '0')}`, `${rack.code} / ${newLevel}-qator / ${p}-joy`, `${rack.code} / ряд ${newLevel} / место ${p}`,
        rack.room_id, rackId, newLevel, p);
    }
    return { ok: true, level: newLevel, slots };
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // o'chirish (soft delete: is_active=0)
  router.post('/api/plan/delete',async (ctx) => {
    const b = ctx.body || {};
    if (b.type === 'room' && b.id) {
      await run('UPDATE catalog_locations SET is_active=0 WHERE room_id=?', Number(b.id));
      await run('UPDATE catalog_racks SET is_active=0 WHERE room_id=?', Number(b.id));
      await run('UPDATE catalog_rooms SET is_active=0 WHERE id=?', Number(b.id));
      return { ok: true };
    }
    if (b.type === 'rack' && b.id) {
      await run('UPDATE catalog_locations SET is_active=0 WHERE rack_id=?', Number(b.id));
      await run('UPDATE catalog_racks SET is_active=0 WHERE id=?', Number(b.id));
      return { ok: true };
    }
    if (b.type === 'row' && b.rack_id && b.level) {
      await run('UPDATE catalog_locations SET is_active=0 WHERE rack_id=? AND level_no=?', Number(b.rack_id), Number(b.level));
      return { ok: true };
    }
    if (b.type === 'cell' && b.id) {
      await run('UPDATE catalog_locations SET is_active=0 WHERE id=?', Number(b.id));
      return { ok: true };
    }
    throw bad('type (room|rack|row|cell) va id/rack_id/level kerak');
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // qatorga yacheyka qo'shish
  router.post('/api/plan/row/cell',async (ctx) => {
    const rackId = Number((ctx.body || {}).rack_id);
    const level = Number((ctx.body || {}).level);
    if (!rackId || !level) throw bad('rack_id va level kerak / Требуется rack_id и level');
    const rack = await get(`SELECT k.*, r.warehouse_id AS wh_id, r.id AS room_id FROM catalog_racks k JOIN catalog_rooms r ON r.id=k.room_id WHERE k.id=?`, rackId);
    if (!rack) throw notFound('Stellaj topilmadi / Стеллаж не найден');
    const pos = ((await get(`SELECT COALESCE(MAX(pos),0) AS m FROM catalog_locations WHERE rack_id=? AND level_no=?`, rackId, level)).m || 0) + 1;
    const code = `${rack.code}-${level}-${String(pos).padStart(2, '0')}`;
    await run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind, room_id, rack_id, level_no, pos, capacity, is_active)
         VALUES (?,?,?,?,'CELL',?,?,?,?,0,1) ON CONFLICT(warehouse_id, code) DO NOTHING`,
      rack.wh_id, code, `${rack.code} / ${level}-qator / ${pos}-joy`, `${rack.code} / ряд ${level} / место ${pos}`,
      rack.room_id, rackId, level, pos);
    return { ok: true, code };
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // omborga yangi xona qo'shish
  // racks/levels/slots berilsa, xona ostidagi stellaj va kataklar ham yaratiladi
  router.post('/api/plan/room',async (ctx) => {
    const b = ctx.body || {};
    const whId = Number(b.warehouse_id);
    if (!whId) throw bad('warehouse_id kerak / Требуется warehouse_id');
    const wh = await get('SELECT * FROM catalog_warehouses WHERE id=?', whId);
    if (!wh) throw notFound('Ombor topilmadi / Склад не найден');
    const n = (await get('SELECT COUNT(*) AS c FROM catalog_rooms WHERE warehouse_id=?', whId)).c;
    const code = b.code && String(b.code).trim() ? String(b.code).trim() : wh.code + '-' + (101 + n);
    const name = b.name && String(b.name).trim() ? String(b.name).trim() : `Xona ${code}`;
    const row = Math.floor(n / 3), col = n % 3;
    const racks = int(b.racks, 0, 0, 20);
    const levels = int(b.levels, 1, 1, 10);
    const slots = int(b.slots, 4, 1, 40);

    const created = await tx(async () => {
      const res = await run(
        `INSERT INTO catalog_rooms (warehouse_id, code, name_uz, name_ru, kind, floor, pos_x, pos_y, width, height, is_active)
         VALUES (?,?,?,?,?,1,?,?,2,2,1)
         ON CONFLICT(warehouse_id, code) DO NOTHING`,
        whId, code, name, name, b.kind || 'STORAGE', col * 3, row * 3
      );
      if (!res.changes) throw bad('Bu kodli xona allaqachon bor / Комната с таким кодом уже есть');
      const room = await get('SELECT id FROM catalog_rooms WHERE warehouse_id=? AND code=?', whId, code);

      let cells = 0;
      for (let s = 1; s <= racks; s++) {
        const rCode = `${code}-S${String(s).padStart(2, '0')}`;
        await run(`INSERT INTO catalog_racks (room_id, code, name_uz, name_ru, kind, levels, is_active)
             VALUES (?,?,?,?,'RACK',?,1)`, room.id, rCode, `${s}-stellaj`, `Стеллаж ${s}`, levels);
        const rack = await get('SELECT id FROM catalog_racks WHERE room_id=? AND code=?', room.id, rCode);
        for (let l = 1; l <= levels; l++) {
          for (let p = 1; p <= slots; p++) {
            await run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind, room_id, rack_id, level_no, pos, capacity, is_active)
                 VALUES (?,?,?,?,'CELL',?,?,?,?,0,1) ON CONFLICT(warehouse_id, code) DO NOTHING`,
              whId, `${rCode}-${l}-${String(p).padStart(2, '0')}`,
              `${rCode} / ${l}-qator / ${p}-joy`, `${rCode} / ряд ${l} / место ${p}`,
              room.id, rack.id, l, p);
            cells++;
          }
        }
      }
      return { room_id: room.id, racks, cells };
    });

    return { ok: true, code, ...created };
  }, { roles: ['ADMIN', 'WAREHOUSE_MANAGER'] });

  // rasm
  router.post('/api/plan/upload',async (ctx) => {
    const url = saveImage(ctx.body?.image, ctx.body?.product_id);
    if (ctx.body?.product_id) {
      await run('UPDATE catalog_products SET image_url=? WHERE id=?', url, Number(ctx.body.product_id));
    }
    return { ok: true, url };
  });

  router.get('/api/plan/uploads', async () => uploadsInfo());

  router.get('/api/plan/kinds', async () => ({
    kinds: Object.entries(ROOM_KINDS).map(([value, l]) => ({ value, label: l })),
  }));
}

module.exports = {
  register, buildPlan, buildingPlan, roomDetail, productCard,
  saveImage, uploadsInfo, autoPlaceRoom, autoPlaceWarehouse, ROOM_KINDS, UPLOAD_DIR,
};
