/**
 * ОТЧЁТЫ / HISOBOTLAR
 */
import { api, auth, getWarehouseFilter } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import {
  h, card, dataTable, pageHead, btn, money, num, qtyFmt, fmtDate, toast, spinner, kpi, monthStart, today, modal,
} from '../ui.js';
import { optsWarehouses, DOC_LABEL } from './journal.js';
import { productCard } from './registers.js';

const TYPE_LBL = DOC_LABEL;

/** Umumiy hisobot sahifasi */
async function reportPage(root, { title, path, params, columns, kpis, exportKind, onRow }) {
  const whs = await optsWarehouses();
  const state = { warehouse_id: getWarehouseFilter(), date_from: monthStart(), date_to: today(), ...params };

  root.replaceChildren();
  root.append(pageHead(title, '', btn(t('print'), { icon: '🖨', onClick: () => window.print() })));

  const fWh = h('select', { onchange: (e) => { state.warehouse_id = e.target.value; load(); } },
    h('option', { value: '', text: t('all') }),
    ...whs.map((w) => h('option', { value: w.id, selected: String(state.warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const fFrom = h('input', { type: 'date', value: state.date_from, onchange: (e) => { state.date_from = e.target.value; load(); } });
  const fTo = h('input', { type: 'date', value: state.date_to, onchange: (e) => { state.date_to = e.target.value; load(); } });

  const kpiBox = h('div', { class: 'kpi-row' });
  const box = h('div', {});
  const foot = h('div', { class: 'table-foot' });

  const quick = h('div', { class: 'btn-row' },
    btn(getLang() === 'uz' ? 'Bugun' : 'Сегодня', { cls: 'btn-sm', onClick: () => { const d = today(); fFrom.value = d; fTo.value = d; state.date_from = d; state.date_to = d; load(); } }),
    btn(getLang() === 'uz' ? 'Bu oy' : 'Этот месяц', { cls: 'btn-sm', onClick: () => { fFrom.value = monthStart(); fTo.value = today(); state.date_from = monthStart(); state.date_to = today(); load(); } }),
    btn(getLang() === 'uz' ? 'O‘tgan oy' : 'Прошлый месяц', { cls: 'btn-sm', onClick: () => {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      const last = d.toISOString().slice(0, 10);
      fFrom.value = last.slice(0, 8) + '01'; fTo.value = last;
      state.date_from = fFrom.value; state.date_to = last; load();
    } }),
    btn(getLang() === 'uz' ? 'Yil' : 'Год', { cls: 'btn-sm', onClick: () => { fFrom.value = today().slice(0, 4) + '-01-01'; fTo.value = today(); state.date_from = fFrom.value; state.date_to = today(); load(); } })
  );

  root.append(card(null, h('div', { class: 'filter-bar' },
    h('div', { class: 'fb-field' }, h('label', { text: t('warehouse') }), fWh),
    h('div', { class: 'fb-field' }, h('label', { text: t('from') }), fFrom),
    h('div', { class: 'fb-field' }, h('label', { text: t('to') }), fTo),
    quick)));
  root.append(kpiBox);
  root.append(card(null, box, foot));

  async function load() {
    box.replaceChildren(spinner());
    let rows = [];
    try { rows = await api.get(path, state); }
    catch (e) { box.replaceChildren(h('div', { class: 'alert alert-err', text: e.message })); return; }
    if (!Array.isArray(rows)) rows = rows.rows || [];

    // KPI
    kpiBox.replaceChildren();
    if (kpis) kpiBox.replaceChildren(...kpis(rows, state));

    const total = rows.reduce((a, r) => a + Number(r.total_amount || r.amount || r.diff_amount || 0), 0);
    const qtyTotal = rows.reduce((a, r) => a + Number(r.qty || r.total_qty || 0), 0);

    box.replaceChildren(dataTable({
      rows, maxHeight: 'calc(100vh - 380px)',
      onRowClick: onRow,
      columns: columns(),
    }));
    foot.replaceChildren(
      h('span', {}, h('b', { text: num(rows.length) }), ' ' + t('total').toLowerCase() +
        (total ? '  ·  ' + money(total) : '') + (qtyTotal ? '  ·  ' + qtyFmt(qtyTotal) : '')),
      exportKind ? btn(t('export'), { icon: '⭳', onClick: () => api.download(exportKind) }) : null
    );
  }

  await load();
}

// ============================================================== ПРИХОД/РАСХОД
export async function turnoverReport(root) {
  await reportPage(root, {
    title: t('m_documents') + ' · ' + (getLang() === 'uz' ? 'Kirim/Chiqim dinamikasi' : 'Динамика прихода/расхода'),
    path: '/api/reports/turnover',
    exportKind: 'movements',
    kpis: (rows) => [
      kpi(getLang() === 'uz' ? 'Kunlar' : 'Дней', num(rows.length)),
      kpi('Kirim (+)', qtyFmt(rows.reduce((s, r) => s + r.in_qty, 0)), '', 'ok'),
      kpi('Chiqim (−)', qtyFmt(rows.reduce((s, r) => s + r.out_qty, 0)), '', 'warn'),
      kpi('Saldo', qtyFmt(rows.reduce((s, r) => s + r.in_qty - r.out_qty, 0))),
    ],
    columns: () => [
      { key: 'date', title: t('date'), width: '110px', render: (r) => fmtDate(r.date) },
      { key: 'in_qty', title: 'Kirim qty', align: 'right', render: (r) => h('span', { class: 'pos', text: qtyFmt(r.in_qty) }) },
      { key: 'in_amount', title: 'Kirim summa', align: 'right', render: (r) => money(r.in_amount) },
      { key: 'out_qty', title: 'Chiqim qty', align: 'right', render: (r) => h('span', { class: 'neg', text: qtyFmt(r.out_qty) }) },
      { key: 'out_amount', title: 'Chiqim summa', align: 'right', render: (r) => money(r.out_amount) },
      { key: 'net', title: 'Netto', align: 'right', render: (r) => {
        const n = r.in_qty - r.out_qty;
        return h('span', { class: n >= 0 ? 'pos' : 'neg', text: qtyFmt(n) });
      } },
    ],
  });
}

// ============================================================== ПРИБЫЛЬ
export async function profitReport(root) {
  const whs = await optsWarehouses();
  const state = { warehouse_id: getWarehouseFilter(), date_from: monthStart(), date_to: today() };
  root.replaceChildren();
  root.append(pageHead(t('m_profit'), t('reports')));

  const fWh = h('select', { onchange: (e) => { state.warehouse_id = e.target.value; load(); } },
    h('option', { value: '', text: t('all') }),
    ...whs.map((w) => h('option', { value: w.id, selected: String(state.warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const fFrom = h('input', { type: 'date', value: state.date_from, onchange: (e) => { state.date_from = e.target.value; load(); } });
  const fTo = h('input', { type: 'date', value: state.date_to, onchange: (e) => { state.date_to = e.target.value; load(); } });
  const kpiBox = h('div', { class: 'kpi-row' });
  const box = h('div', {});
  const foot = h('div', { class: 'table-foot' });

  root.append(card(null, h('div', { class: 'filter-bar' },
    h('div', { class: 'fb-field' }, h('label', { text: t('warehouse') }), fWh),
    h('div', { class: 'fb-field' }, h('label', { text: t('from') }), fFrom),
    h('div', { class: 'fb-field' }, h('label', { text: t('to') }), fTo))));
  root.append(kpiBox);
  root.append(card(null, box, foot));

  async function load() {
    box.replaceChildren(spinner());
    const d = await api.get('/api/reports/profit', state);
    kpiBox.replaceChildren(
      kpi(getLang() === 'uz' ? 'Tovar turi' : 'Позиций', num(d.rows.length)),
      kpi(getLang() === 'uz' ? 'Savdo' : 'Выручка', money(d.total_revenue) + ' UZS', '', 'ok'),
      kpi(getLang() === 'uz' ? 'Tannarx' : 'Себест.', money(d.total_cost) + ' UZS', '', 'warn'),
      kpi('Foyda', money(d.total_profit) + ' UZS',
        d.total_revenue > 0 ? (d.total_profit / d.total_revenue * 100).toFixed(1) + '% marja' : '',
        d.total_profit >= 0 ? 'ok' : 'err')
    );
    box.replaceChildren(dataTable({
      rows: d.rows, maxHeight: 'calc(100vh - 380px)',
      onRowClick: (r) => productCard(r.product_id, state.warehouse_id),
      rowCls: (r) => (r.profit < 0 ? 'row-err' : ''),
      columns: [
        { key: 'sku', title: 'SKU', width: '105px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
        { key: 'name', title: t('product'), render: (r) => fn(r, 'name_uz', 'name_ru') },
        { key: 'sold_qty', title: getLang() === 'uz' ? 'Sotilgan' : 'Продано', align: 'right', render: (r) => qtyFmt(r.sold_qty) },
        { key: 'revenue', title: getLang() === 'uz' ? 'Tushum' : 'Выручка', align: 'right', render: (r) => money(r.revenue) },
        { key: 'cost_out', title: getLang() === 'uz' ? 'Tannarx' : 'Себест.', align: 'right', render: (r) => money(r.cost_out) },
        { key: 'profit', title: 'Foyda', align: 'right', render: (r) => h('b', { class: r.profit >= 0 ? 'pos' : 'neg', text: money(r.profit) }) },
        { key: 'margin', title: 'Marja', align: 'right', render: (r) =>
            h('span', { class: r.margin >= 0 ? 'pos' : 'neg', text: r.margin.toFixed(1) + '%' }) },
      ],
    }));
    foot.replaceChildren(h('span', { text: `${d.from} — ${d.to}  ·  ${num(d.rows.length)}` }));
  }
  await load();
}

// ============================================================== ПРОДАЖИ
export async function salesReport(root) {
  await reportPage(root, {
    title: t('m_sales'),
    path: '/api/reports/sales',
    exportKind: 'documents',
    kpis: (rows) => [
      kpi(getLang() === 'uz' ? 'Cheklar' : 'Чеков', num(rows.length)),
      kpi(getLang() === 'uz' ? 'Tushum' : 'Выручка', money(rows.reduce((s, r) => s + r.total_amount, 0)) + ' UZS', '', 'ok'),
      kpi(getLang() === 'uz' ? 'Foyda' : 'Прибыль', money(rows.reduce((s, r) => s + (r.profit || 0), 0)) + ' UZS', '', 'ok'),
      kpi(getLang() === 'uz' ? 'Tovar' : 'Товаров', qtyFmt(rows.reduce((s, r) => s + r.total_qty, 0))),
    ],
    columns: () => [
      { key: 'number', title: t('doc_number'), align: 'right', width: '85px', render: (r) => h('b', { text: r.number }) },
      { key: 'date', title: t('date'), width: '105px', render: (r) => fmtDate(r.date) },
      { key: 'counterparty', title: t('counterparty'), render: (r) => fn(r, 'counterparty_uz', 'counterparty') || '—' },
      { key: 'warehouse', title: t('warehouse'), width: '150px', render: (r) => fn(r, 'warehouse_uz', 'warehouse') },
      { key: 'total_qty', title: t('qty'), align: 'right', width: '90px', render: (r) => qtyFmt(r.total_qty) },
      { key: 'total_amount', title: t('amount'), align: 'right', width: '130px', render: (r) => money(r.total_amount) },
      { key: 'total_cost', title: t('cost'), align: 'right', width: '130px', render: (r) => money(r.total_cost) },
      { key: 'profit', title: 'Foyda', align: 'right', width: '130px',
        render: (r) => h('b', { class: r.profit >= 0 ? 'pos' : 'neg', text: money(r.profit) }) },
      { key: 'manager', title: 'Xodim', width: '140px', render: (r) => r.manager || '—' },
    ],
  });
}

// ============================================================== ЗАКУПКИ
export async function purchasesReport(root) {
  await reportPage(root, {
    title: t('m_purchases'),
    path: '/api/reports/purchases',
    exportKind: 'documents',
    kpis: (rows) => [
      kpi(getLang() === 'uz' ? 'Hujjatlar' : 'Документов', num(rows.length)),
      kpi(getLang() === 'uz' ? 'Xarid summa' : 'Сумма закупок', money(rows.reduce((s, r) => s + r.total_amount, 0)) + ' UZS', '', 'ok'),
      kpi(getLang() === 'uz' ? 'Tovar' : 'Товаров', qtyFmt(rows.reduce((s, r) => s + r.total_qty, 0))),
    ],
    columns: () => [
      { key: 'number', title: t('doc_number'), align: 'right', width: '85px', render: (r) => h('b', { text: r.number }) },
      { key: 'date', title: t('date'), width: '105px', render: (r) => fmtDate(r.date) },
      { key: 'counterparty', title: t('counterparty'), render: (r) => fn(r, 'counterparty_uz', 'counterparty') || '—' },
      { key: 'warehouse', title: t('warehouse'), width: '150px', render: (r) => fn(r, 'warehouse_uz', 'warehouse') },
      { key: 'total_qty', title: t('qty'), align: 'right', width: '90px', render: (r) => qtyFmt(r.total_qty) },
      { key: 'total_amount', title: t('amount'), align: 'right', width: '140px', render: (r) => money(r.total_amount) },
      { key: 'currency', title: t('currency'), width: '80px' },
    ],
  });
}

// ============================================================== СПИСАНИЕ
export async function writeoffReport(root) {
  const REASONS = { SALE: 'Sotish', WRITEOFF: 'Yo‘qotish', USAGE: 'Ishlatish', RETURN: 'Qaytarish', SAMPLE: 'Namuna' };
  await reportPage(root, {
    title: t('m_writeoff'),
    path: '/api/reports/writeoff',
    kpis: (rows) => [
      kpi(getLang() === 'uz' ? 'Qatorlar' : 'Строк', num(rows.length)),
      kpi(getLang() === 'uz' ? 'Yozilgan' : 'Списано', qtyFmt(rows.reduce((s, r) => s + r.qty, 0)), '', 'warn'),
      kpi('Summa', money(rows.reduce((s, r) => s + r.amount, 0)) + ' UZS', '', 'err'),
    ],
    columns: () => [
      { key: 'date', title: t('date'), width: '105px', render: (r) => fmtDate(r.date) },
      { key: 'number', title: t('doc_number'), align: 'right', width: '85px' },
      { key: 'sku', title: 'SKU', width: '105px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
      { key: 'name', title: t('product'), render: (r) => fn(r, 'name_uz', 'name_ru') },
      { key: 'warehouse', title: t('warehouse'), width: '150px', render: (r) => fn(r, 'warehouse_uz', 'warehouse') },
      { key: 'qty', title: t('qty'), align: 'right', width: '100px', render: (r) => h('span', { class: 'neg', text: qtyFmt(r.qty) }) },
      { key: 'amount', title: t('amount'), align: 'right', width: '130px', render: (r) => money(r.amount) },
    ],
  });
}

// ============================================================== ИНВЕНТАРИЗАЦИЯ ФАРҚИ
export async function invDiffReport(root) {
  await reportPage(root, {
    title: t('m_invdiff'),
    path: '/api/reports/inventory-diff',
    kpis: (rows) => {
      const plus = rows.filter((r) => r.diff > 0), minus = rows.filter((r) => r.diff < 0);
      return [
        kpi(getLang() === 'uz' ? 'Farqli qatorlar' : 'Расхождений', num(rows.length), '', rows.length ? 'warn' : ''),
        kpi('+' + (getLang() === 'uz' ? ' Ko‘p chiqdi' : ' Излишки'), qtyFmt(plus.reduce((s, r) => s + r.diff, 0)), '', 'ok'),
        kpi('−' + (getLang() === 'uz' ? ' Kam qoldi' : ' Недостачи'), qtyFmt(Math.abs(minus.reduce((s, r) => s + r.diff, 0))), '', 'err'),
        kpi(getLang() === 'uz' ? 'Summa' : 'Сумма', money(rows.reduce((s, r) => s + r.diff_amount, 0)) + ' UZS', '', 'err'),
      ];
    },
    columns: () => [
      { key: 'date', title: t('date'), width: '105px', render: (r) => fmtDate(r.date) },
      { key: 'number', title: t('doc_number'), align: 'right', width: '85px' },
      { key: 'warehouse', title: t('warehouse'), width: '150px', render: (r) => fn(r, 'warehouse_uz', 'warehouse') },
      { key: 'sku', title: 'SKU', width: '105px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
      { key: 'name', title: t('product'), render: (r) => fn(r, 'name_uz', 'name_ru') },
      { key: 'qty_system', title: 'Tizimda', align: 'right', width: '100px', render: (r) => qtyFmt(r.qty_system) },
      { key: 'qty', title: 'Hisobda', align: 'right', width: '100px', render: (r) => qtyFmt(r.qty) },
      { key: 'diff', title: 'Farq', align: 'right', width: '100px',
        render: (r) => h('b', { class: r.diff > 0 ? 'pos' : 'neg', text: (r.diff > 0 ? '+' : '') + qtyFmt(r.diff) }) },
      { key: 'diff_amount', title: 'Summa', align: 'right', width: '130px',
        render: (r) => h('span', { class: r.diff_amount >= 0 ? 'pos' : 'neg', text: money(r.diff_amount) }) },
    ],
  });
}

// ============================================================== МИН. ОСТАТОК
export async function belowMinReport(root) {
  const whs = await optsWarehouses();
  const state = { warehouse_id: getWarehouseFilter() };
  root.replaceChildren();
  root.append(pageHead(t('m_belowmin'), t('d_alerts')));

  const fWh = h('select', { onchange: (e) => { state.warehouse_id = e.target.value; load(); } },
    h('option', { value: '', text: t('all') }),
    ...whs.map((w) => h('option', { value: w.id, selected: String(state.warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const box = h('div', {});
  const foot = h('div', { class: 'table-foot' });
  root.append(card(null, h('div', { class: 'filter-bar' },
    h('div', { class: 'fb-field' }, h('label', { text: t('warehouse') }), fWh)), box, foot));

  async function load() {
    box.replaceChildren(spinner());
    const rows = await api.get('/api/register/stock/below-min', state);
    box.replaceChildren(dataTable({
      rows, maxHeight: 'calc(100vh - 260px)',
      onRowClick: (r) => productCard(r.id, state.warehouse_id),
      columns: [
        { key: 'sku', title: 'SKU', width: '110px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
        { key: 'name', title: t('product'), render: (r) => fn(r, 'name_uz', 'name_ru') },
        { key: 'barcode', title: 'Barcode', width: '150px', render: (r) => h('span', { class: 'mono', text: r.barcode || '—' }) },
        { key: 'warehouse', title: t('warehouse'), width: '160px', render: (r) => fn(r, 'warehouse_uz', 'warehouse') },
        { key: 'qty', title: t('qty_short'), align: 'right', width: '110px', render: (r) => h('span', { class: 'neg', text: qtyFmt(r.qty) }) },
        { key: 'min_stock', title: t('m_belowmin'), align: 'right', width: '100px', render: (r) => qtyFmt(r.min_stock) },
        { key: 'need', title: getLang() === 'uz' ? 'Buyurtma berish' : 'Заказать', align: 'right', width: '140px',
          render: (r) => h('b', { class: 'neg', text: qtyFmt(r.need) }) },
      ],
    }));
    foot.replaceChildren(h('span', {}, h('b', { text: num(rows.length) }), ' pozitsiya — ' + t('d_alerts').toLowerCase()));
  }
  await load();
}

// ============================================================== AUDIT
export async function auditReport(root) {
  await reportPage(root, {
    title: t('m_audit'),
    path: '/api/reports/audit',
    columns: () => [
      { key: 'ts', title: 'Vaqt', width: '160px' },
      { key: 'user_login', title: 'Foydalanuvchi', width: '150px' },
      { key: 'action', title: 'Amal', width: '200px' },
      { key: 'entity', title: 'Obyekt', width: '120px' },
      { key: 'entity_id', title: 'ID', align: 'right', width: '70px' },
      { key: 'details', title: t('note'), render: (r) => r.details || '' },
    ],
  });
}
