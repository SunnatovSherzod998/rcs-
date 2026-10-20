'use strict';
/**
 * REGISTRI / РЕГИСТРЫ
 * Hujjatni o'tkazish (проведение) va bekor qilish (отмена проведения).
 *
 * Har bir o'tkazilgan qator reg_stock_movements ga yoziladi (append-only),
 * reg_stock_balances esa tez qoldiq uchun yangilanadi — xuddi 1C dagi
 * "Регистр накопления" + "Итоги регистра" ga o'xshaydi.
 */
const { all, get, run, tx, nextNumber } = require('../db');
const { HttpError } = require('../lib/http');
const salary = require('./salary');

const TYPE = {
  OPENING:   'RECEIPT',   // Начальные остатки
  RECEIPT:   'RECEIPT',   // Приход
  ISSUE:     'ISSUE',     // Расход
  TRANSFER:  'TRANSFER',  // Перемещение (склад -> склад)
  PLACEMENT: 'PLACEMENT', // Размещение (разрез -> ячейка)
  PICK:      'PICK',      // Выборка (ячейка -> разрез)
  INVENTORY: 'INVENTORY', // Инвентаризация
  PAYMENT:   'PAYMENT',   // Оплата (qarz)
};

const DOC_TYPES = Object.keys(TYPE);
const STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'];

/** Biznes xatolari -> HTTP 400 (ilovaga tushunarli xabar) */
class BizError extends HttpError {
  constructor(message, code) { super(400, message, code || 'BIZ'); }
}

// ---------------------------------------------------------------- helpers

async function getLines(docId) {
  return all('SELECT * FROM document_lines WHERE document_id = ? ORDER BY line_no, id', docId);
}

function normLocation(locId) {
  return locId ? Number(locId) : 0;
}

/** Balans kalitlari bo'yicha qoldiqni harakatlardan qayta hisoblaydi */
async function recalcKey(productId, warehouseId, locationId) {
  const m = await get(
    `SELECT COALESCE(SUM(qty_in),0) AS qin, COALESCE(SUM(qty_out),0) AS qout,
            COALESCE(SUM(amount),0) AS amt, MAX(date) AS d
       FROM reg_stock_movements
      WHERE product_id = ? AND warehouse_id = ? AND COALESCE(location_id,0) = ?`,
    productId, warehouseId, normLocation(locationId)
  );
  const qty = r2((m.qin || 0) - (m.qout || 0));
  const amt = r2(m.amt || 0);
  const key = [productId, warehouseId, normLocation(locationId)];
  if (Math.abs(qty) < 1e-9 && Math.abs(amt) < 1e-6) {
    await run('DELETE FROM reg_stock_balances WHERE product_id=? AND warehouse_id=? AND location_id=?', ...key);
  } else {
    await run(
      `INSERT INTO reg_stock_balances (product_id, warehouse_id, location_id, qty, amount, last_date)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(product_id, warehouse_id, location_id)
       DO UPDATE SET qty=excluded.qty, amount=excluded.amount, last_date=excluded.last_date`,
      ...key, qty, amt, m.d || null
    );
  }
  return { qty, amount: amt };
}

/** 2 kasrli yaxlitlash (og'irlik kasrlari hisobotni ifloslantiradi) */
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Mahsulotning joriy o‘rtacha tannarxi (ombor bo‘yicha) */
async function avgCost(productId, warehouseId, prod) {
  const pr = await get('SELECT cost FROM reg_prices WHERE product_id=? AND warehouse_id=?', productId, warehouseId);
  if (pr && pr.cost > 0) return pr.cost;
  const p = prod || await get('SELECT cost_price FROM catalog_products WHERE id=?', productId);
  return p?.cost_price || 0;
}

async function addMovement(m) {
  const qtyIn = r2(m.qty_in);
  const qtyOut = r2(m.qty_out);
  await run(
    `INSERT INTO reg_stock_movements
      (document_id, document_line_id, date, doc_type, product_id, warehouse_id,
       location_id, qty_in, qty_out, price, amount, counterparty_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    m.document_id, m.line_id ?? null, m.date, m.doc_type, m.product_id, m.warehouse_id,
    normLocation(m.location_id), qtyIn, qtyOut, r2(m.price), r2(m.amount),
    m.counterparty_id ?? null
  );
  await recalcKey(m.product_id, m.warehouse_id, m.location_id);
}

async function addDebt(m) {
  await run(
    `INSERT INTO reg_debt_movements (document_id, date, counterparty_id, warehouse_id, amount, note)
     VALUES (?,?,?,?,?,?)`,
    m.document_id, m.date, m.counterparty_id, m.warehouse_id ?? null, m.amount || 0, m.note ?? null
  );
}

/** Mahsulotning ombor bo'yicha joriy qoldig'i */
async function qtyOnHand(productId, warehouseId, locationId = null) {
  if (locationId === null || locationId === undefined) {
    const r = await get(
      'SELECT COALESCE(SUM(qty),0) AS q FROM reg_stock_balances WHERE product_id=? AND warehouse_id=?',
      productId, warehouseId
    );
    return r.q || 0;
  }
  const r = await get(
    'SELECT qty FROM reg_stock_balances WHERE product_id=? AND warehouse_id=? AND location_id=?',
    productId, warehouseId, normLocation(locationId)
  );
  return r ? r.qty : 0;
}

/** Omborning manfiy qoldiqga ruxsat berish qoidasi */
async function allowNegative(warehouseId) {
  const w = await get('SELECT is_negative_allowed FROM catalog_warehouses WHERE id = ?', warehouseId);
  return !!(w && w.is_negative_allowed);
}

/** Chiqim qilingan miqdorni tekshiradi (manfiy qoldiq nazorati) */
async function checkNegative(lines, warehouseId) {
  if (await allowNegative(warehouseId)) return;
  const w = await get('SELECT is_negative_allowed FROM catalog_warehouses WHERE id=?', warehouseId);
  if (w && w.is_negative_allowed) return;
  const problems = [];
  const byProduct = new Map();
  for (const l of lines) {
    const cur = byProduct.get(l.product_id) ?? await qtyOnHand(l.product_id, warehouseId);
    byProduct.set(l.product_id, cur - (l.qty || 0));
  }
  for (const [pid, left] of byProduct) {
    if (left < -1e-9) {
      const p = await get('SELECT sku, name_ru FROM catalog_products WHERE id=?', pid);
      problems.push(`${p ? p.sku + ' ' + p.name_ru : '#' + pid} → qoldiq ${left}`);
    }
  }
  if (problems.length) {
    throw new BizError(
      'Manfiy qoldiq mumkin emas / Отрицательный остаток: ' + problems.join('; ')
    );
  }
}

// ---------------------------------------------------------------- documents

/**
 * Hujjatning xodimini aniqlaydi:
 *   1) forma orqali qo'lda tanlangan xodim
 *   2) joriy foydalanuvchiga bog'langan xodim (users.employee_id)
 *   3) kassir bo'lmasa — oxirgi xodim (POS uchun qulaylik)
 */
async function employeeOf(data, user) {
  if (data.employee_id) return Number(data.employee_id);
  if (user?.employee_id) return Number(user.employee_id);
  // POS/kassa: rol bo'yicha xodimni avtomatik tanlash
  const roleEmp = await get(
    `SELECT e.id FROM catalog_employees e
      JOIN users u ON u.employee_id = e.id
     WHERE u.id = ?`, user?.id ?? 0
  );
  if (roleEmp) return roleEmp.id;
  const last = await get(`SELECT id FROM catalog_employees WHERE is_active = 1 ORDER BY id LIMIT 1`);
  const v = last ? Number(last.id) : null;
  if (v === null || Number.isNaN(v)) {
    console.error('[DEBUG] employeeOf -> ', { last, user: user && { id: user.id, employee_id: user.employee_id } });
  }
  return v;
}

async function recalcTotals(docId) {
  const doc = await get('SELECT * FROM documents WHERE id=?', docId);
  const lines = await getLines(docId);
  let totalQty = 0, totalAmount = 0, totalCost = 0;
  for (const l of lines) {
    const p = await get('SELECT cost_price, is_service FROM catalog_products WHERE id=?', l.product_id);
    const isInv = doc.type === 'INVENTORY';
    const sysQty = isInv ? (l.qty_system ?? 0) : 0;
    const effQty = isInv ? (l.qty - sysQty) : (l.qty || 0);
    const sign = isInv ? 1 : 1;
    totalQty += isInv ? Math.abs(effQty) : (l.qty || 0);
    totalAmount += (l.amount || 0) * (isInv ? sign : 1);
    if (!isInv) totalCost += (l.qty || 0) * ((p?.cost_price) || 0);
  }
  await run(
    'UPDATE documents SET total_qty=?, total_amount=?, total_cost=? WHERE id=?',
    totalQty, totalAmount, totalCost, docId
  );
  return get('SELECT * FROM documents WHERE id=?', docId);
}

/** Hujjatni o'tkazish (провести) */
async function post(docId, user) {
  return tx(async () => {
    const doc = await get('SELECT * FROM documents WHERE id=?', docId);
    if (!doc) throw new BizError('Hujjat topilmadi / Документ не найден');
    if (doc.status === 'POSTED') throw new BizError('Hujjat allaqachon o‘tkazilgan / Документ уже проведён');

    const lines = await getLines(docId);
    if (!lines.length) throw new BizError('Hujjat bo‘sh / Документ пуст');

    if (doc.type !== 'TRANSFER' && !doc.warehouse_id) {
      throw new BizError('Ombor tanlanmagan / Не указан склад');
    }
    if (doc.type === 'TRANSFER' && (!doc.warehouse_id || !doc.dest_warehouse_id)) {
      throw new BizError('Ikkala ombor ham ko‘rsatilishi kerak / Нужно указать оба склада');
    }
    if (doc.type === 'TRANSFER' && doc.warehouse_id === doc.dest_warehouse_id) {
      throw new BizError('Omborlar bir xil bo‘lmasligi kerak / Склады должны различаться');
    }

    // 1) Chiqim / ko'chirishda manfiy qoldiqni tekshirish
    if (doc.type === 'ISSUE' || doc.type === 'TRANSFER') {
      await checkNegative(lines, doc.warehouse_id);
    }
    // 1b) PICK: katakda yetarli tovar borligini tekshirish
    if (doc.type === 'PICK') {
      for (const l of lines) {
        if (!l.location_id) throw new BizError('Pick uchun joy (katak) ko‘rsatilishi shart / Для выборки указано место (ячейку)');
        const have = await qtyOnHand(l.product_id, doc.warehouse_id, l.location_id);
        if ((l.qty || 0) - have > 1e-9) {
          const p = await get('SELECT sku, name_ru FROM catalog_products WHERE id=?', l.product_id);
          throw new BizError(
            `Katakda yetarli emas: ${p ? p.sku + ' ' + p.name_ru : '#' + l.product_id} — ` +
            `mavjud ${have}, so‘ralgan ${l.qty} / В ячейке недостаточно: ${have} из ${l.qty}`
          );
        }
      }
    }
    // 1c) PLACEMENT: umumiy qoldiqda yetarli tovar borligini tekshirish
    if (doc.type === 'PLACEMENT') {
      for (const l of lines) {
        if (!l.location_id) throw new BizError('Joylash uchun katak ko‘rsatilishi shart / Для размещения указана ячейка');
        const have = await qtyOnHand(l.product_id, doc.warehouse_id, 0);
        if ((l.qty || 0) - have > 1e-9) {
          const p = await get('SELECT sku, name_ru FROM catalog_products WHERE id=?', l.product_id);
          throw new BizError(
            `Joylash uchun yetarli yo‘q: ${p ? p.sku + ' ' + p.name_ru : '#' + l.product_id} — ` +
            `mavjud ${have}, kerak ${l.qty} / Недостаточно для размещения: ${have} из ${l.qty}`
          );
        }
      }
    }

    const date = doc.date;
    const isInv = doc.type === 'INVENTORY';

    for (const l of lines) {
      const prod = await get('SELECT * FROM catalog_products WHERE id=?', l.product_id);
      if (!prod) throw new BizError(`Tovar #${l.product_id} topilmadi`);

      if (isInv) {
        // Инвентаризация: faqat FARQ (разница) bo'yicha harakat
        const sys = l.qty_system ?? 0;
        const fact = l.qty ?? 0;
        const diff = fact - sys;
        if (Math.abs(diff) < 1e-9) continue;
        const price = l.price || prod.cost_price || 0;
        await addMovement({
          document_id: docId, line_id: l.id, date, doc_type: doc.type,
          product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: l.location_id,
          qty_in: diff > 0 ? diff : 0,
          qty_out: diff < 0 ? -diff : 0,
          price, amount: diff * price,
          counterparty_id: doc.counterparty_id,
        });
        await recalcTotals(docId);
      } else {
        switch (doc.type) {
          case 'OPENING':
          case 'RECEIPT':
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: l.location_id,
              qty_in: l.qty || 0, qty_out: 0,
              price: l.price, amount: l.amount,
              counterparty_id: doc.counterparty_id,
            });
            break;

          case 'ISSUE':
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: l.location_id,
              qty_in: 0, qty_out: l.qty || 0,
              price: l.price, amount: l.amount,
              counterparty_id: doc.counterparty_id,
            });
            break;

          case 'TRANSFER':
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: l.location_id,
              qty_in: 0, qty_out: l.qty || 0,
              price: l.price, amount: 0,
              counterparty_id: doc.counterparty_id,
            });
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.dest_warehouse_id, location_id: l.dest_location_id ?? null,
              qty_in: l.qty || 0, qty_out: 0,
              price: l.price, amount: 0,
              counterparty_id: doc.counterparty_id,
            });
            break;

          case 'PLACEMENT': {
            // Размещение: umumiy qoldiq (location 0) -> aniq katak
            // Qiymat ishorasi: chiqimda manfiy, kirishda musbat (ombor jami o'zgarmaydi)
            const c = await avgCost(l.product_id, doc.warehouse_id, prod);
            const val = r2((l.qty || 0) * c);
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: 0,
              qty_in: 0, qty_out: l.qty || 0,
              price: c, amount: -val, counterparty_id: doc.counterparty_id,
            });
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: l.location_id,
              qty_in: l.qty || 0, qty_out: 0,
              price: c, amount: val, counterparty_id: doc.counterparty_id,
            });
            break;
          }

          case 'PICK': {
            // Выборка: katak -> umumiy qoldiq
            const c = await avgCost(l.product_id, doc.warehouse_id, prod);
            const val = r2((l.qty || 0) * c);
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: l.location_id,
              qty_in: 0, qty_out: l.qty || 0,
              price: c, amount: -val, counterparty_id: doc.counterparty_id,
            });
            await addMovement({
              document_id: docId, line_id: l.id, date, doc_type: doc.type,
              product_id: l.product_id, warehouse_id: doc.warehouse_id, location_id: 0,
              qty_in: l.qty || 0, qty_out: 0,
              price: c, amount: val, counterparty_id: doc.counterparty_id,
            });
            break;
          }

          case 'PAYMENT':
            // faqat qarz registriga tegiladi
            break;
          default:
            throw new BizError('Noma’lum hujjat turi: ' + doc.type);
        }
      }

      // orta tannarx registrini yangilash
      if (doc.type === 'RECEIPT' || doc.type === 'OPENING' || doc.type === 'INVENTORY') {
        const cur = await get(
          'SELECT qty, amount FROM reg_stock_balances WHERE product_id=? AND warehouse_id=? AND location_id=0',
          l.product_id, doc.warehouse_id
        );
        const oldQty = cur?.qty ?? 0, oldAmt = cur?.amount ?? 0;
        const addQty = (doc.type === 'INVENTORY' ? (l.qty - (l.qty_system ?? 0)) : l.qty) || 0;
        const addAmt = addQty * (l.price || prod.cost_price || 0);
        const newQty = oldQty + addQty;
        const newAmt = oldAmt + addAmt;
        const avg = newQty > 1e-9 ? newAmt / newQty : (l.price || prod.cost_price || 0);
        await run(
          `INSERT INTO reg_prices (product_id, warehouse_id, cost, updated_at)
           VALUES (?,?,?, datetime('now','localtime'))
           ON CONFLICT(product_id, warehouse_id) DO UPDATE SET cost=excluded.cost, updated_at=excluded.updated_at`,
          l.product_id, doc.warehouse_id, avg
        );
      }
    }

    // 2) Qarz registr (взаиморасчёты)
    //    + = bizning qarzimiz (kontragent yetkazib beruvchi / biz to‘lagan)
    //    - = ularning qarzi (kontragent mijoz / biz to‘lagan)
    if (doc.counterparty_id) {
      // Jami summa `recalcTotals` da yangilanadi — shuning uchun yangilaymiz
      const totals = await recalcTotals(docId);
      const totalAmount = totals.total_amount || 0;
      let amount = 0;
      switch (doc.type) {
        case 'RECEIPT':
        case 'OPENING':
          amount = totalAmount;                            // biz tovar oldik -> qarzimiz
          break;
        case 'ISSUE':
          if ((doc.base_type || 'SALE') === 'SALE') {
            amount = -totalAmount;                         // mijozga sotdik -> ularning qarzi
          }
          break;
        case 'PAYMENT':
          // base_type: 'IN' — mijozdan pul oldik (qarz kamayadi)
          //            'OUT' — yetkazib beruvchiga to'ladik (qarz kamayadi)
          amount = (doc.base_type || 'IN') === 'OUT'
            ? totalAmount
            : -totalAmount;
          break;
        default:
          amount = 0;
      }
      if (Math.abs(amount) > 1e-9) {
        await addDebt({
          document_id: docId, date, counterparty_id: doc.counterparty_id,
          warehouse_id: doc.warehouse_id, amount,
          note: doc.reason || doc.note || null,
        });
      }
    }

    const t = await recalcTotals(docId);
    await run(
      "UPDATE documents SET status='POSTED', posted_at=datetime('now','localtime'), posted_by=? WHERE id=?",
      user?.id ?? null, docId
    );

    // Ishchi bonusi (limitdan oshgan sotuv uchun) — status POSTED bo'lgandan keyin
    const posted = await get('SELECT * FROM documents WHERE id=?', docId);
    const bonusInfo = await salary.applyBonus(posted);

    return { ok: true, document: posted, status: 'POSTED', bonus: bonusInfo };
  });
}

/** O'tkazishni bekor qilish (отмена проведения) */
async function unpost(docId, user) {
  return tx(async () => {
    const doc = await get('SELECT * FROM documents WHERE id=?', docId);
    if (!doc) throw new BizError('Hujjat topilmadi / Документ не найден');
    if (doc.status !== 'POSTED') throw new BizError('Hujjat o‘tkazilmagan / Документ не проведён');

    // qaysi kalitlarni qayta hisoblash kerak
    const affected = await all(
      `SELECT DISTINCT product_id, warehouse_id, COALESCE(location_id,0) AS location_id
         FROM reg_stock_movements WHERE document_id=?`,
      docId
    );
    await run('DELETE FROM reg_stock_movements WHERE document_id=?', docId);
    await run('DELETE FROM reg_debt_movements WHERE document_id=?', docId);
    for (const a of affected) await recalcKey(a.product_id, a.warehouse_id, a.location_id);

    await run(
      "UPDATE documents SET status='DRAFT', posted_at=NULL, posted_by=NULL WHERE id=?",
      docId
    );
    // Ishchi bonusini o'chirish (agar edi)
    const bonusInfo = await salary.applyBonus(doc, true);
    return { ok: true, document: await get('SELECT * FROM documents WHERE id=?', docId), status: 'DRAFT', bonus_removed: bonusInfo };
  });
}

/** Yangi hujjat yaratish */
async function createDocument(data, user) {
  const type = String(data.type || '').toUpperCase();
  if (!DOC_TYPES.includes(type)) throw new BizError('Noma’lum hujjat turi: ' + type);

  return tx(async () => {
    const number = await nextNumber('doc_' + type);
    const date = data.date || new Date().toISOString().slice(0, 10);
    let currencyId = data.currency_id ?? null;
    let rate = data.rate ?? 1;
    if (!currencyId) {
      const base = await get("SELECT id FROM catalog_currencies WHERE code='UZS'");
      currencyId = base?.id ?? null;
    }

    const res = await run(
      `INSERT INTO documents
        (type, number, date, status, warehouse_id, dest_warehouse_id, counterparty_id,
         employee_id, currency_id, rate, reason, base_type, note)
       VALUES (?,?,?, 'DRAFT', ?,?,?,?,?,?,?,?,?)`,
      type, number, date,
      data.warehouse_id ?? null, data.dest_warehouse_id ?? null, data.counterparty_id ?? null,
      await employeeOf(data, user), currencyId, rate, data.reason ?? null,
      data.base_type ?? null, data.note ?? null
    );
    const docId = Number(res.lastInsertRowid);
    await replaceLines(docId, data.lines || []);
    await recalcTotals(docId);
    return { ok: true, document: await get('SELECT * FROM documents WHERE id=?', docId) };
  });
}

async function replaceLines(docId, lines) {
  const doc = await get('SELECT * FROM documents WHERE id=?', docId);
  if (doc.status === 'POSTED') throw new BizError('O‘tkazilgan hujjatni tahrirlab bo‘lmaydi / Проведённый документ нельзя изменить');
  await run('DELETE FROM document_lines WHERE document_id=?', docId);
  let no = 0;
  for (const l of lines) {
    if (!l.product_id) continue;
    const qty = Number(l.qty || 0);
    const price = Number(l.price || 0);
    const discount = Math.min(100, Math.max(0, Number(l.discount || 0)));
    const amount = r2(qty * price * (1 - discount / 100));
    await run(
      `INSERT INTO document_lines (document_id, line_no, product_id, location_id, dest_location_id, qty, price, amount, discount, qty_system, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      docId, ++no, l.product_id, l.location_id ?? null, l.dest_location_id ?? null, qty, price, amount, discount,
      l.qty_system === undefined || l.qty_system === null ? null : Number(l.qty_system),
      l.note ?? null
    );
  }
  return no;
}

async function updateDocument(id, data) {
  return tx(async () => {
    const doc = await get('SELECT * FROM documents WHERE id=?', id);
    if (!doc) throw new BizError('Hujjat topilmadi / Документ не найден');
    if (doc.status === 'POSTED') throw new BizError('O‘tkazilgan hujjatni tahrirlab bo‘lmaydi / Проведённый документ нельзя изменить');
    await run(
      `UPDATE documents SET date=?, warehouse_id=?, dest_warehouse_id=?, counterparty_id=?,
        employee_id=?, currency_id=?, rate=?, reason=?, base_type=?, note=? WHERE id=?`,
      data.date ?? doc.date,
      data.warehouse_id ?? doc.warehouse_id,
      data.dest_warehouse_id ?? doc.dest_warehouse_id,
      data.counterparty_id ?? doc.counterparty_id,
      data.employee_id ?? doc.employee_id,
      data.currency_id ?? doc.currency_id,
      data.rate ?? doc.rate,
      data.reason ?? doc.reason,
      data.base_type ?? doc.base_type,
      data.note ?? doc.note,
      id
    );
    if (Array.isArray(data.lines)) await replaceLines(id, data.lines);
    await recalcTotals(id);
    return { ok: true, document: await get('SELECT * FROM documents WHERE id=?', id) };
  });
}

async function deleteDocument(id) {
  return tx(async () => {
    const doc = await get('SELECT * FROM documents WHERE id=?', id);
    if (!doc) throw new BizError('Hujjat topilmadi / Документ не найден');
    if (doc.status === 'POSTED') throw new BizError('Avval o‘tkazishni bekor qiling / Сначала отмените проведение');
    await run('DELETE FROM documents WHERE id=?', id);
    return { ok: true, deleted: id };
  });
}

async function getDocument(id) {
  const doc = await get(
    `SELECT d.*,
            w.name_ru AS warehouse_name_ru, w.name_uz AS warehouse_name_uz,
            w2.name_ru AS dest_warehouse_name_ru, w2.name_uz AS dest_warehouse_name_uz,
            c.name_ru AS counterparty_name_ru, c.name_uz AS counterparty_name_uz,
            cu.code AS currency_code,
            e.name_ru AS employee_name_ru, e.name_uz AS employee_name_uz
       FROM documents d
       LEFT JOIN catalog_warehouses w  ON w.id = d.warehouse_id
       LEFT JOIN catalog_warehouses w2 ON w2.id = d.dest_warehouse_id
       LEFT JOIN catalog_counterparties c ON c.id = d.counterparty_id
       LEFT JOIN catalog_currencies cu ON cu.id = d.currency_id
       LEFT JOIN catalog_employees e ON e.id = d.employee_id
      WHERE d.id = ?`,
    id
  );
  if (!doc) return null;
  doc.lines = await all(
    `SELECT l.*, p.sku, p.name_ru, p.name_uz, u.code AS unit_code, u.name_ru AS unit_ru,
            loc.code AS location_code,
            COALESCE(b.qty, 0) AS qty_on_hand
       FROM document_lines l
       JOIN catalog_products p ON p.id = l.product_id
       LEFT JOIN catalog_units u ON u.id = p.unit_id
       LEFT JOIN catalog_locations loc ON loc.id = l.location_id
       LEFT JOIN reg_stock_balances b
              ON b.product_id = l.product_id AND b.warehouse_id = ? AND b.location_id = COALESCE(l.location_id, 0)
      WHERE l.document_id = ? ORDER BY l.line_no, l.id`,
    doc.warehouse_id ?? 0, id
  );
  return doc;
}

module.exports = {
  BizError, TYPE, DOC_TYPES, STATUSES,
  post, unpost, createDocument, updateDocument, deleteDocument, getDocument,
  recalcTotals, getLines, qtyOnHand, recalcKey, checkNegative, addMovement, addDebt,
};
