/**
 * РЕГИСТРЫ / REGISTRLAR: qoldiqlar, harakatlar, aylanma, qarzlar, narxlar
 */
import { api, auth, getWarehouseFilter } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import {
  h, card, dataTable, pageHead, btn, money, num, qtyFmt, fmtDate, toast, spinner, modal,
} from '../ui.js';
import { optsWarehouses } from './journal.js';
import { openEditor } from './editor.js';

const TYPE_LBL = {
  OPENING: 'm_opening', RECEIPT: 'm_receipt', ISSUE: 'm_issue',
  TRANSFER: 'm_transfer', INVENTORY: 'm_inventory', PAYMENT: 'm_payment',
};

// ============================================================== ОСТАТКИ
export async function balancesPage(root) {
  const state = { warehouse_id: getWarehouseFilter(), q: '', only_positive: 0, only_negative: 0, offset: 0, limit: 300, group: false };
  const whs = await optsWarehouses();

  root.replaceChildren();
  root.append(pageHead(t('m_balances'),
    t('registers') + ' · ' + t('m_balances'),
    btn(t('export'), { icon: '⭳', onClick: () => api.download('balances') })));

  const fWh = h('select', { onchange: (e) => { state.warehouse_id = e.target.value; state.offset = 0; load(); } },
    h('option', { value: '', text: t('all') }),
    ...whs.map((w) => h('option', { value: w.id, selected: String(state.warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const fQ = h('input', { type: 'search', placeholder: t('search_ph'), oninput: deb((e) => { state.q = e.target.value; state.offset = 0; load(); }, 280) });
  const fPos = h('input', { type: 'checkbox', onchange: (e) => { state.only_positive = e.target.checked ? 1 : 0; state.offset = 0; load(); } });
  const fNeg = h('input', { type: 'checkbox', onchange: (e) => { state.only_negative = e.target.checked ? 1 : 0; state.offset = 0; load(); } });
  const fGroup = h('input', { type: 'checkbox', onchange: (e) => { state.group = e.target.checked; load(); } });

  const box = h('div', {});
  const foot = h('div', { class: 'table-foot' });

  root.append(card(null,
    h('div', { class: 'filter-bar' },
      h('div', { class: 'fb-field' }, h('label', { text: t('warehouse') }), fWh),
      h('div', { class: 'search-input' }, fQ),
      chk(fPos, t('m_receipt')), chk(fNeg, t('d_negative')), chk(fGroup, 'Guruhlash / Группировка')
    ), box, foot));

  async function load() {
    box.replaceChildren(spinner());
    if (state.group) {
      const rows = await api.get('/api/register/stock/balances/grouped', state);
      box.replaceChildren(dataTable({ columns: groupedCols(), rows, maxHeight: 'calc(100vh - 300px)',
        onRowClick: (r) => productCard(r.product_id) }));
      foot.replaceChildren(h('span', { text: num(rows.length) + ' ' + t('total').toLowerCase() }));
      return;
    }
    const res = await api.get('/api/register/stock/balances', state);
    box.replaceChildren(dataTable({
      columns: cols(), rows: res.rows, maxHeight: 'calc(100vh - 300px)',
      rowCls: (r) => (r.is_negative ? 'row-err' : r.below_min ? 'row-warn' : ''),
      onRowClick: (r) => productCard(r.product_id),
    }));
    foot.replaceChildren(
      h('span', {},
        h('b', { text: num(res.total) }), ' pozitsiya  ·  ',
        h('b', { text: qtyFmt(res.sum_qty) }), ' ' + t('qty').toLowerCase() + '  ·  ',
        h('b', { text: money(res.sum_amount) }), ' UZS'),
      pager(res));
  }

  function cols() {
    return [
      { key: 'sku', title: 'SKU', width: '105px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
      { key: 'name', title: t('name'), render: (r) => h('span', {}, fn(r, 'name_uz', 'name_ru'),
          r.barcode ? h('span', { class: 'dim mono', text: ' ' + r.barcode }) : null) },
      { key: 'cat', title: 'Toifa', width: '140px', render: (r) => fn(r, 'category_uz', 'category') },
      { key: 'wh', title: t('warehouse'), width: '150px', render: (r) => fn(r, 'warehouse_name_uz', 'warehouse_name_ru') },
      { key: 'loc', title: 'Joy', width: '80px', render: (r) => r.location_code || '—' },
      { key: 'unit', title: 'Birlik', width: '70px', render: (r) => r.unit_code || '—' },
      { key: 'qty', title: t('qty'), align: 'right', width: '110px',
        render: (r) => h('span', { class: r.qty < 0 ? 'neg' : '', text: qtyFmt(r.qty) }) },
      { key: 'min', title: 'Min', align: 'right', width: '90px',
        render: (r) => (r.min_stock ? h('span', { class: r.below_min ? 'neg' : 'dim', text: qtyFmt(r.min_stock) }) : '—') },
      { key: 'avg_cost', title: 'O‘rt. tannarx', align: 'right', width: '120px', render: (r) => money(r.avg_cost) },
      { key: 'amount', title: t('amount'), align: 'right', width: '130px', render: (r) => money(r.amount) },
      { key: 'flag', title: '', width: '110px', align: 'center', render: (r) =>
        r.is_negative ? h('span', { class: 'badge b-red', text: t('d_negative') })
        : r.below_min ? h('span', { class: 'badge b-orange', text: t('d_below_min') }) : '' },
    ];
  }
  function groupedCols() {
    return [
      { key: 'sku', title: 'SKU', width: '105px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
      { key: 'name', title: t('name'), render: (r) => fn(r, 'name_uz', 'name_ru') },
      { key: 'cat', title: 'Toifa', width: '150px', render: (r) => r.category || '—' },
      { key: 'whs', title: 'Omborlar', align: 'right', width: '90px' },
      { key: 'qty', title: t('qty'), align: 'right', width: '120px', render: (r) => qtyFmt(r.qty) },
      { key: 'min', title: 'Min', align: 'right', width: '90px', render: (r) => r.min_stock ? qtyFmt(r.min_stock) : '—' },
      { key: 'avg', title: 'O‘rt. tannarx', align: 'right', width: '120px',
        render: (r) => (r.qty > 0 ? money(r.amount / r.qty) : money(r.cost_price)) },
      { key: 'amount', title: t('amount'), align: 'right', width: '130px', render: (r) => money(r.amount) },
      { key: 'sale', title: 'Potensial', align: 'right', width: '140px',
        render: (r) => h('span', { class: 'pos', text: money(r.qty * (r.sale_price || 0)) }) },
    ];
  }
  function chk(input, label) {
    return h('label', { class: 'fb-field', style: { flexDirection: 'row', alignItems: 'center', gap: '5px' } },
      input, h('span', { style: { fontSize: '12px' }, text: label }));
  }
  function pager(res) {
    const p = h('div', { class: 'pager' });
    p.append(h('button', { text: '‹', disabled: state.offset === 0, onClick: () => { state.offset = Math.max(0, state.offset - state.limit); load(); } }));
    p.append(h('span', { class: 'dim', text: `${Math.floor(state.offset / state.limit) + 1} / ${Math.max(1, Math.ceil(res.total / state.limit))}` }));
    p.append(h('button', { text: '›', disabled: state.offset + state.limit >= res.total, onClick: () => { state.offset += state.limit; load(); } }));
    return p;
  }

  await load();
}

// ============================================================== ДВИЖЕНИЯ
export async function movementsPage(root) {
  const state = { warehouse_id: getWarehouseFilter(), q: '', doc_type: '', date_from: '', date_to: '', offset: 0, limit: 300 };
  const whs = await optsWarehouses();

  root.replaceChildren();
  root.append(pageHead(t('m_movements'), t('registers'), btn(t('export'), { icon: '⭳', onClick: () => api.download('movements') })));

  const fWh = h('select', { onchange: (e) => { state.warehouse_id = e.target.value; state.offset = 0; load(); } },
    h('option', { value: '', text: t('all') }),
    ...whs.map((w) => h('option', { value: w.id, selected: String(state.warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const fType = h('select', { onchange: (e) => { state.doc_type = e.target.value; state.offset = 0; load(); } },
    h('option', { value: '', text: t('all') }),
    ...Object.entries(TYPE_LBL).map(([v, l]) => h('option', { value: v, text: t(l) })));
  const fFrom = h('input', { type: 'date', onchange: (e) => { state.date_from = e.target.value; state.offset = 0; load(); } });
  const fTo = h('input', { type: 'date', onchange: (e) => { state.date_to = e.target.value; state.offset = 0; load(); } });
  const fQ = h('input', { type: 'search', placeholder: t('search_ph'), oninput: deb((e) => { state.q = e.target.value; state.offset = 0; load(); }, 280) });

  const box = h('div', {});
  const foot = h('div', { class: 'table-foot' });
  root.append(card(null,
    h('div', { class: 'filter-bar' },
      h('div', { class: 'fb-field' }, h('label', { text: t('warehouse') }), fWh),
      h('div', { class: 'fb-field' }, h('label', { text: t('doc_type') }), fType),
      h('div', { class: 'fb-field' }, h('label', { text: t('from') }), fFrom),
      h('div', { class: 'fb-field' }, h('label', { text: t('to') }), fTo),
      h('div', { class: 'search-input' }, fQ)),
    box, foot));

  async function load() {
    box.replaceChildren(spinner());
    const res = await api.get('/api/register/stock/movements', state);
    box.replaceChildren(dataTable({
      rows: res.rows, maxHeight: 'calc(100vh - 300px)',
      onRowClick: (r) => api.get('/api/documents/' + r.document_id).then((d) => openEditor(d.type, d.id, load, true)),
      columns: [
        { key: 'date', title: t('date'), width: '100px', render: (r) => fmtDate(r.date) },
        { key: 'doc', title: 'Hujjat', width: '165px', render: (r) =>
            h('a', { href: '#', onclick: (e) => e.stopPropagation(), text: t(TYPE_LBL[r.doc_type] || r.doc_type) + ' №' + r.doc_number }) },
        { key: 'sku', title: 'SKU', width: '100px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
        { key: 'name', title: t('product'), render: (r) => fn(r, 'name_uz', 'name_ru') },
        { key: 'wh', title: t('warehouse'), width: '140px', render: (r) => fn(r, 'warehouse_name_uz', 'warehouse_name_ru') },
        { key: 'in', title: 'Kirim (+)', align: 'right', width: '105px',
          render: (r) => (r.qty_in ? h('span', { class: 'pos', text: qtyFmt(r.qty_in) }) : '') },
        { key: 'out', title: 'Chiqim (−)', align: 'right', width: '105px',
          render: (r) => (r.qty_out ? h('span', { class: 'neg', text: qtyFmt(r.qty_out) }) : '') },
        { key: 'amount', title: t('amount'), align: 'right', width: '125px', render: (r) => money(r.amount) },
        { key: 'cp', title: t('counterparty'), render: (r) => r.counterparty_name_ru || '—' },
      ],
    }));
    foot.replaceChildren(h('span', {},
      h('b', { text: num(res.total) }), ' harakat  ·  +' + h('b', { text: qtyFmt(res.sum_in) }) +
      '  /  −' + h('b', { text: qtyFmt(res.sum_out) })));
  }
  await load();
}

// ============================================================== ОБОРОТКА
export async function turnoverPage(root) {
  const state = { warehouse_id: getWarehouseFilter(), date_from: '', date_to: '' };
  const whs = await optsWarehouses();
  root.replaceChildren();
  root.append(pageHead(t('m_turnover'), 'Opening · Kirim · Chiqim · Closing'));

  const fWh = h('select', { onchange: (e) => { state.warehouse_id = e.target.value; load(); } },
    h('option', { value: '', text: t('all') }),
    ...whs.map((w) => h('option', { value: w.id, selected: String(state.warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const fFrom = h('input', { type: 'date', value: '', onchange: (e) => { state.date_from = e.target.value; load(); } });
  const fTo = h('input', { type: 'date', value: '', onchange: (e) => { state.date_to = e.target.value; load(); } });
  const box = h('div', {});
  const foot = h('div', { class: 'table-foot' });

  root.append(card(null,
    h('div', { class: 'filter-bar' },
      h('div', { class: 'fb-field' }, h('label', { text: t('warehouse') }), fWh),
      h('div', { class: 'fb-field' }, h('label', { text: t('from') }), fFrom),
      h('div', { class: 'fb-field' }, h('label', { text: t('to') }), fTo)),
    box, foot));

  async function load() {
    box.replaceChildren(spinner());
    const rows = await api.get('/api/register/stock/turnover', state);
    const sum = rows.reduce((a, r) => ({
      oq: a.oq + r.opening_qty, oa: a.oa + r.opening_amount,
      iq: a.iq + r.in_qty, ia: a.ia + r.in_amount,
      gq: a.gq + r.out_qty, ga: a.ga + r.out_amount,
    }), { oq: 0, oa: 0, iq: 0, ia: 0, gq: 0, ga: 0 });

    const tbl = h('table', { class: 'grid' },
      h('thead', {}, h('tr', {},
        h('th', { text: 'SKU' }), h('th', { text: t('product') }), h('th', { text: 'Birlik' }),
        h('th', { class: 'num', text: 'Boshlang‘ich' }), h('th', { class: 'num', text: 'Summa' }),
        h('th', { class: 'num', text: 'Kirim' }), h('th', { class: 'num', text: 'Summa' }),
        h('th', { class: 'num', text: 'Chiqim' }), h('th', { class: 'num', text: 'Summa' }),
        h('th', { class: 'num', text: 'Yakuniy' }), h('th', { class: 'num', text: 'Summa' })
      )),
      h('tbody', {},
        ...rows.map((r) => h('tr', {},
          h('td', { class: 'mono', text: r.sku }),
          h('td', { text: fn(r, 'name_uz', 'name_ru') }),
          h('td', { text: r.unit_code || '' }),
          h('td', { class: 'num', text: qtyFmt(r.opening_qty) }),
          h('td', { class: 'num', text: money(r.opening_amount) }),
          h('td', { class: 'num pos', text: qtyFmt(r.in_qty) }),
          h('td', { class: 'num', text: money(r.in_amount) }),
          h('td', { class: 'num neg', text: qtyFmt(r.out_qty) }),
          h('td', { class: 'num', text: money(r.out_amount) }),
          h('td', { class: 'num', text: qtyFmt(r.closing_qty) }),
          h('td', { class: 'num', text: money(r.closing_amount) })
        )),
        h('tr', { class: 'tfoot-tr' },
          h('td', { colspan: 3, text: t('total') }),
          h('td', { class: 'num', text: qtyFmt(sum.oq) }), h('td', { class: 'num', text: money(sum.oa) }),
          h('td', { class: 'num', text: qtyFmt(sum.iq) }), h('td', { class: 'num', text: money(sum.ia) }),
          h('td', { class: 'num', text: qtyFmt(sum.gq) }), h('td', { class: 'num', text: money(sum.ga) }),
          h('td', { class: 'num', text: qtyFmt(sum.oq + sum.iq - sum.gq) }),
          h('td', { class: 'num', text: money(sum.oa + sum.ia - sum.ga) })
        )));

    box.replaceChildren(h('div', { class: 'table-wrap', style: { maxHeight: 'calc(100vh - 300px)' } }, tbl));
    foot.replaceChildren(h('span', { text: num(rows.length) + ' pozitsiya' }));
  }
  await load();
}

// ============================================================== ВЗАИМОРАСЧЁТЫ
export async function debtPage(root) {
  const state = { q: '' };
  root.replaceChildren();
  root.append(pageHead(t('m_debt'), 'Kontragentlar qarzi / Долги контрагентов',
    btn(t('export'), { icon: '⭳', onClick: () => api.download('debt') })));

  const fQ = h('input', { type: 'search', placeholder: t('search_ph'), oninput: deb((e) => { state.q = e.target.value; load(); }, 280) });
  const box = h('div', {});
  const foot = h('div', { class: 'table-foot' });
  root.append(card(null,
    h('div', { class: 'filter-bar' }, h('div', { class: 'search-input' }, fQ)), box, foot));

  async function load() {
    box.replaceChildren(spinner());
    const rows = await api.get('/api/register/debt/balances', state);
    const total = rows.reduce((s, r) => s + r.debt, 0);
    box.replaceChildren(dataTable({
      rows, maxHeight: 'calc(100vh - 300px)',
      rowCls: (r) => (r.debt > 0 ? 'row-warn' : r.debt < 0 ? 'row-ok' : ''),
      onRowClick: (r) => showHistory(r),
      columns: [
        { key: 'code', title: t('code'), width: '110px', render: (r) => h('span', { class: 'mono', text: r.code || '—' }) },
        { key: 'name', title: t('counterparty'), render: (r) => fn(r, 'name_uz', 'name_ru') },
        { key: 'kind', title: t('doc_type'), width: '140px' },
        { key: 'phone', title: 'Telefon', width: '160px', render: (r) => r.phone || '—' },
        { key: 'tax_id', title: 'STIR', width: '140px', render: (r) => h('span', { class: 'mono', text: r.tax_id || '—' }) },
        { key: 'debt', title: t('amount'), align: 'right', width: '160px',
          render: (r) => h('b', { class: r.debt > 0 ? 'neg' : r.debt < 0 ? 'pos' : 'dim', text: money(r.debt) }) },
        { key: 'sign', title: '', align: 'center', width: '150px', render: (r) =>
            r.debt > 0 ? h('span', { class: 'badge b-orange', text: 'Bizning qarz' })
            : r.debt < 0 ? h('span', { class: 'badge b-green', text: 'Mijoz qarzi' })
            : h('span', { class: 'dim', text: '—' }) },
      ],
    }));
    foot.replaceChildren(h('span', {},
      h('b', { text: num(rows.length) }), ' kontragent  ·  Net: ',
      h('b', { class: total > 0 ? 'neg' : 'pos', text: money(total) })));
  }

  async function showHistory(cp) {
    const rows = await api.get('/api/register/debt/movements', { counterparty_id: cp.id });
    const m = modal({
      title: (t('m_debt')) + ' · ' + fn(cp, 'name_uz', 'name_ru'),
      width: 860,
      body: dataTable({
        rows,
        columns: [
          { key: 'date', title: t('date'), width: '100px', render: (r) => fmtDate(r.date) },
          { key: 'doc', title: 'Hujjat', width: '165px', render: (r) => t(TYPE_LBL[r.doc_type] || '') + ' №' + r.doc_number },
          { key: 'amount', title: t('amount'), align: 'right', render: (r) =>
            h('span', { class: r.amount > 0 ? 'neg' : 'pos', text: (r.amount > 0 ? '+' : '') + money(r.amount) }) },
          { key: 'note', title: t('note'), render: (r) => r.note || '—' },
        ],
      }),
      actions: (close) => [btn(t('close'), { onClick: close })],
    });
  }

  await load();
}

// ============================================================== ЦЕНЫ
export async function pricesPage(root) {
  const state = { warehouse_id: getWarehouseFilter() };
  const whs = await optsWarehouses();
  root.replaceChildren();
  root.append(pageHead(t('m_prices'), 'Registr narxlari / Регистр цен'));

  const fWh = h('select', { onchange: (e) => { state.warehouse_id = e.target.value; load(); } },
    h('option', { value: '', text: t('all') }),
    ...whs.map((w) => h('option', { value: w.id, selected: String(state.warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const box = h('div', {});
  root.append(card(null, h('div', { class: 'filter-bar' },
    h('div', { class: 'fb-field' }, h('label', { text: t('warehouse') }), fWh)), box));

  async function load() {
    box.replaceChildren(spinner());
    const rows = await api.get('/api/register/prices', state);
    box.replaceChildren(dataTable({
      rows, maxHeight: 'calc(100vh - 260px)',
      rowCls: (r) => (Math.abs(r.diff) > 0.5 ? 'row-warn' : ''),
      columns: [
        { key: 'sku', title: 'SKU', width: '110px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
        { key: 'name', title: t('name'), render: (r) => fn(r, 'name_uz', 'name_ru') },
        { key: 'wh', title: t('warehouse'), width: '160px', render: (r) => r.warehouse || '—' },
        { key: 'cost_price', title: 'Katalog tannarxi', align: 'right', render: (r) => money(r.cost_price) },
        { key: 'avg_cost', title: 'O‘rtacha tannarx', align: 'right', render: (r) => money(r.avg_cost) },
        { key: 'diff', title: 'Farq', align: 'right', render: (r) =>
          h('span', { class: r.diff > 0 ? 'neg' : r.diff < 0 ? 'pos' : 'dim', text: money(r.diff) }) },
        { key: 'sale_price', title: 'Sotish narxi', align: 'right', render: (r) => money(r.sale_price) },
        { key: 'margin', title: 'Marja %', align: 'right', render: (r) => {
          if (!r.avg_cost || !r.sale_price) return '—';
          const m = (r.sale_price - r.avg_cost) / r.sale_price * 100;
          return h('span', { class: m < 0 ? 'neg' : 'pos', text: m.toFixed(1) + '%' });
        } },
        { key: 'updated_at', title: 'Yangilangan', width: '160px', render: (r) => r.updated_at || '—' },
      ],
    }));
  }
  await load();
}

// ============================================================== TOVAR KARTASI
export async function productCard(productId, warehouseId) {
  const d = await api.get('/api/register/stock/product-card', { product_id: productId, warehouse_id: warehouseId || getWarehouseFilter() });
  const p = d.product;
  let run = d.opening.qty;

  const tbl = h('table', { class: 'grid' },
    h('thead', {}, h('tr', {},
      h('th', { text: t('date') }), h('th', { text: 'Hujjat' }), h('th', { class: 'num', text: 'Kirim' }),
      h('th', { class: 'num', text: 'Chiqim' }), h('th', { class: 'num', text: 'Qoldiq' }), h('th', { text: t('note') })
    )),
    h('tbody', {},
      h('tr', { class: 'tfoot-tr' },
        h('td', { text: 'Boshlang‘ich' }), h('td', {}), h('td', {}),
        h('td', { class: 'num', text: qtyFmt(d.opening.qty) }),
        h('td', { class: 'num', text: qtyFmt(d.opening.qty) }),
        h('td', { text: money(d.opening.amount) })),
      ...d.lines.filter((l) => !l.is_opening).map((l) => {
        run += l.qty_in - l.qty_out;
        return h('tr', {},
          h('td', { text: fmtDate(l.date) }),
          h('td', { text: t(TYPE_LBL[l.doc_type] || l.doc_type) + ' №' + l.doc_number }),
          h('td', { class: 'num pos', text: l.qty_in ? qtyFmt(l.qty_in) : '' }),
          h('td', { class: 'num neg', text: l.qty_out ? qtyFmt(l.qty_out) : '' }),
          h('td', { class: 'num', text: qtyFmt(run) }),
          h('td', { text: l.doc_note || l.base_type || '' })
        );
      })));

  modal({
    title: 'TOVAR KARTASI / КАРТОЧКА ТОВАРА: ' + p.sku,
    width: 1000,
    body: h('div', {},
      h('div', { class: 'alert alert-info' },
        h('b', { text: getLang() === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz) }),
        '  ·  ' + t('qty') + ': ' + h('b', { text: qtyFmt(d.closing.qty) }) +
        '  ·  ' + t('cost') + ': ' + money(p.cost_price) +
        '  ·  ' + t('price') + ': ' + money(p.sale_price) +
        (p.barcode ? '  ·  Barcode: ' + p.barcode : '')),
      h('div', { class: 'table-wrap', style: { maxHeight: '440px' } }, tbl)),
    actions: (close) => [btn(t('close'), { onClick: close })],
  });
}

function deb(fn, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }
