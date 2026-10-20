'use strict';
/**
 * ISHCHILAR OYLIGI / ЗАРПЛАТА СОТРУДНИКОВ
 *
 * - Har bir xodim uchun oylik sotuv limiti (sales_limit)
 * - Limitdan oshgan har bir sotuv summasiga bonus foizi (bonus_percent)
 * - Bonus reg_employee_bonuses jadvalida saqlanadi (append-only)
 */
const { all, get, run, tx } = require('../db');

/**
 * Xodimning joriy oy sotuv summasini hisoblaydi.
 * @param {number} employeeId
 * @param {string} date YYYY-MM-DD — shu kungacha bo'lgan sotuvlar
 */
async function monthSales(employeeId, date) {
  const month = String(date || '').slice(0, 7);  // YYYY-MM
  const r = await get(
    `SELECT COALESCE(SUM(total_amount),0) AS total
       FROM documents
      WHERE employee_id = ? AND type = 'ISSUE' AND status = 'POSTED'
        AND base_type = 'SALE' AND substr(date, 1, 7) = ?`,
    employeeId, month
  );
  return r ? r.total : 0;
}

/**
 * Xodimning bonus summasini qayta hisoblaydi (reg_employee_bonuses dan).
 */
async function recalcBonusTotal(employeeId) {
  const r = await get(
    `SELECT COALESCE(SUM(bonus_amount),0) AS total FROM reg_employee_bonuses WHERE employee_id = ?`,
    employeeId
  );
  const total = Math.round((r ? r.total : 0) * 100) / 100;
  await run('UPDATE catalog_employees SET bonus_total = ? WHERE id = ?', total, employeeId);
  return total;
}

/**
 * Hujjat o'tkazilganda chaqiladi.
 * ISSUE + SALE + employee_id bo'lsa — limitdan oshgan qism uchun bonus qo'shadi.
 * Hujjat bekor qilinsa — bonus ham o'chiriladi.
 */
async function applyBonus(doc, unposted = false) {
  if (!doc.employee_id) return null;
  if (doc.type !== 'ISSUE' || (doc.base_type || 'SALE') !== 'SALE') return null;
  if (doc.status !== 'POSTED') return null;

  const emp = await get('SELECT * FROM catalog_employees WHERE id = ?', doc.employee_id);
  if (!emp) return null;

  // Eslatma: bu funksiya `post`/`unpost` tranzaksiyasi ICHIDA chaqiriladi —
  // shuning uchun ichki tranzaksiya ochilmaydi (SQLite: "transaction within a transaction").
  // Oldingo bonus o'chirish (unpost yoki qayta post)
  await run('DELETE FROM reg_employee_bonuses WHERE document_id = ?', doc.id);

  if (unposted) {
    await recalcBonusTotal(doc.employee_id);
    return { bonus: 0, over_limit: 0 };
  }

  const saleAmount = Math.round((doc.total_amount || 0) * 100) / 100;
  const limit = emp.sales_limit || 0;
  const overLimit = Math.max(0, saleAmount - limit);
  const bonus = Math.round(overLimit * (emp.bonus_percent || 0));

  if (bonus > 0) {
    await run(
      `INSERT INTO reg_employee_bonuses (employee_id, document_id, date, doc_type, sale_amount, over_limit, bonus_amount, note)
       VALUES (?,?,?,?,?,?,?,?)`,
      doc.employee_id, doc.id, doc.date, 'ISSUE', saleAmount, overLimit, bonus,
      `Sotuv #${doc.number}`
    );
  }

  await recalcBonusTotal(doc.employee_id);
  return { bonus, over_limit: overLimit };
}

/**
 * Ishchilar oyligi sahifasi uchun ma'lumotlar.
 */
async function salaryList() {
  const employees = await all(
    `SELECT e.*, w.name_ru AS warehouse_name_ru, w.name_uz AS warehouse_name_uz
       FROM catalog_employees e
       LEFT JOIN catalog_warehouses w ON w.id = e.warehouse_id
      ORDER BY e.name_ru`
  );
  const result = [];
  const month = new Date().toISOString().slice(0, 7);
  for (const e of employees) {
    const sales = await monthSales(e.id, month);
    const limit = e.sales_limit || 0;
    const overLimit = Math.max(0, sales - limit);
    const pendingBonus = Math.round(overLimit * (e.bonus_percent || 0) / 100 * 100) / 100;
    const bonusPaid = await get(
      `SELECT COALESCE(SUM(bonus_amount),0) AS total FROM reg_employee_bonuses WHERE employee_id = ?`,
      e.id
    );
    result.push({
      ...e,
      month_sales: sales,
      over_limit: overLimit,
      pending_bonus: pendingBonus,
      bonus_paid: bonusPaid ? bonusPaid.total : 0,
    });
  }
  return result;
}

/**
 * Xodimning bonus tarixi.
 */
async function bonusHistory(employeeId) {
  return all(
    `SELECT b.*, d.number AS doc_number
       FROM reg_employee_bonuses b
       LEFT JOIN documents d ON d.id = b.document_id
      WHERE b.employee_id = ?
      ORDER BY b.date DESC, b.id DESC LIMIT 200`,
    employeeId
  );
}

module.exports = { monthSales, applyBonus, salaryList, bonusHistory, recalcBonusTotal };
