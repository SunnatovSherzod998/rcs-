/**
 * ЖУРНАЛ ДОКУМЕНТОВ / HUJJATLAR JURNALI
 */
import { api, auth, getWarehouseFilter } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import {
  h, card, dataTable, pageHead, btn, iconBtn, modal, confirmDialog, statusBadge, tr,
  toast, spinner, num, money, qtyFmt, fmtDate, errorBox,
} from '../ui.js';
import { openEditor } from './editor.js';
import { go } from '../app.js';
import { feat, DOC_FEAT } from '../features.js';

export const DOC_LABEL = {
  OPENING:   'm_opening',
  RECEIPT:   'm_receipt',
  ISSUE:     'm_issue',
  TRANSFER:  'm_transfer',
  PLACEMENT: 'm_placement',
  PICK:      'm_pick',
  INVENTORY: 'm_inventory',
  PAYMENT:   'm_payment',
};
export const DOC_ICON = {
  OPENING: '⏱', RECEIPT: '↓', ISSUE: '↑', TRANSFER: '⇄',
  PLACEMENT: '▩', PICK: '▤', INVENTORY: '☑', PAYMENT: '₽',
};

export async function journalPage(root, presetType) {
  const state = {
    type: presetType || '', status: '', warehouse_id: getWarehouseFilter(),
    counterparty_id: '', q: '', date_from: '', date_to: '',
    offset: 0, limit: 100, rows: [], total: 0, sum_amount: 0, sum_qty: 0,
  };

  root.replaceChildren();
  const options = await api.get('/api/documents-meta/types');
  const enabledTypes = options.types.filter((x) => feat(DOC_FEAT[x.value]));
  const defaultNewType = (presetType && feat(DOC_FEAT[presetType]))
    ? presetType
    : (enabledTypes[0]?.value || null);

  const newBtn = defaultNewType
    ? btn('+ ' + (presetType ? t(DOC_LABEL[presetType]) : t('new_doc')), {
        cls: 'btn-primary', icon: '＋',
        onClick: () => openEditor(defaultNewType, null, () => load()),
      })
    : null;

  root.append(pageHead(t('m_journal'),
    presetType ? t(DOC_LABEL[presetType]) : t('m_documents'),
    newBtn
  ));

  // ------- filtr
  const fType = select([{ value: '', label: t('all') }, ...enabledTypes.map((x) => ({ value: x.value, label: t2Label(x) }))], state.type, (v) => { state.type = v; state.offset = 0; load(); });
  const fStatus = select([
    { value: '', label: t('all') },
    { value: 'DRAFT', label: t('st_draft') },
    { value: 'POSTED', label: t('st_posted') },
  ], state.status, (v) => { state.status = v; state.offset = 0; load(); });
  const fWh = select([{ value: '', label: t('all') }, ...(await optsWarehouses()).map((w) => ({ value: w.id, label: fn(w, 'name_uz', 'name_ru') }))],
    String(state.warehouse_id || ''), (v) => { state.warehouse_id = v; state.offset = 0; load(); });
  const fCp = select([{ value: '', label: t('all') }, ...(await optsCounterparties()).map((c) => ({ value: c.id, label: fn(c, 'name_uz', 'name_ru') }))],
    '', (v) => { state.counterparty_id = v; state.offset = 0; load(); });
  const fFrom = h('input', { type: 'date', onchange: (e) => { state.date_from = e.target.value; state.offset = 0; load(); } });
  const fTo = h('input', { type: 'date', onchange: (e) => { state.date_to = e.target.value; state.offset = 0; load(); } });
  const fQ = h('input', {
    type: 'search', placeholder: t('search_ph'),
    oninput: debounce((e) => { state.q = e.target.value; state.offset = 0; load(); }, 280),
  });

  const tableBox = h('div', {});
  const foot = h('div', { class: 'table-foot' });

  root.append(card(null,
    h('div', { class: 'filter-bar' },
      fld(t('doc_type'), fType), fld(t('doc_status'), fStatus), fld(t('warehouse'), fWh),
      fld(t('counterparty'), fCp), fld(t('from'), fFrom), fld(t('to'), fTo),
      h('div', { class: 'search-input' }, fQ),
      h('button', { class: 'btn', text: t('reset'), onClick: () => {
        Object.assign(state, { type: presetType || '', status: '', counterparty_id: '', q: '', date_from: '', date_to: '', offset: 0 });
        fType.value = state.type; fStatus.value = ''; fCp.value = ''; fQ.value = ''; fFrom.value = ''; fTo.value = '';
        load();
      } })
    ),
    tableBox, foot
  ));

  async function load() {
    tableBox.replaceChildren(spinner());
    const res = await api.get('/api/documents', state);
    state.rows = res.rows; state.total = res.total; state.sum_amount = res.sum_amount; state.sum_qty = res.sum_qty;
    tableBox.replaceChildren(dataTable({
      columns: columns(),
      rows: res.rows,
      rowCls: (r) => (r.status === 'DRAFT' ? 'row-warn' : ''),
      onRowClick: (r) => openEditor(r.type, r.id, load),
    }));
    foot.replaceChildren(
      h('span', {},
        h('b', { text: num(res.total) }), ' ' + t('total').toLowerCase() +
        '  ·  ' + t('amount') + ': ' + h('b', { text: money(res.sum_amount) }) +
        '  ·  ' + t('qty') + ': ' + h('b', { text: qtyFmt(res.sum_qty) })
      ),
      pager(res)
    );
  }

  function columns() {
    const c = [
      { key: 'id', title: 'ID', width: '48px', render: (r) => h('span', { class: 'dim mono', text: r.id }) },
      { key: 'type', title: t('doc_type'), render: (r) => h('span', {},
          h('span', { class: 'dim', text: DOC_ICON[r.type] + ' ' }),
          t(DOC_LABEL[r.type] || r.type)) },
      { key: 'number', title: t('doc_number'), align: 'right', width: '80px',
        render: (r) => h('b', { text: r.number }) },
      { key: 'date', title: t('date'), width: '100px', render: (r) => fmtDate(r.date) },
      { key: 'wh', title: t('warehouse'), render: (r) => {
          if (r.type === 'TRANSFER') return fn(r, 'warehouse_name_ru', 'warehouse_name_uz') + ' → ' + fn(r, 'dest_name_ru', 'dest_name_uz');
          return fn(r, 'warehouse_name_ru', 'warehouse_name_uz') || '—';
        } },
      { key: 'cp', title: t('counterparty'), render: (r) => fn(r, 'counterparty_name_ru', 'counterparty_name_uz') || '—' },
      { key: 'lines_count', title: 'Qator', align: 'right', width: '65px' },
      { key: 'total_qty', title: t('qty'), align: 'right', width: '95px', render: (r) => qtyFmt(r.total_qty) },
      { key: 'total_amount', title: t('amount'), align: 'right', width: '125px', render: (r) => money(r.total_amount) },
      { key: 'status', title: t('doc_status'), width: '160px', render: (r) => statusBadge(r.status) },
      { key: 'posted_by_name', title: t('posted_by'), width: '130px', render: (r) => fn(r, 'posted_by_name', 'created_by_name') || '—' },
    ];
    c.push({
      key: 'act', title: t('actions'), align: 'right', width: '190px',
      render: (r) => h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } },
        r.status === 'DRAFT' && auth.can('documents.post')
          ? iconBtn('✓', t('post'), () => doPost(r)) : null,
        r.status === 'POSTED' && auth.can('documents.post')
          ? iconBtn('↩', t('unpost'), () => doUnpost(r)) : null,
        r.status !== 'POSTED' && auth.can('documents.write')
          ? iconBtn('✎', t('edit'), () => openEditor(r.type, r.id, load)) : null,
        iconBtn('⧉', t('print'), () => printDoc(r.id)),
        r.status !== 'POSTED' && auth.can('documents.write')
          ? iconBtn('🗑', t('delete'), () => doDelete(r)) : null
      ),
    });
    return c;
  }

  async function doPost(r) {
    try { await api.post(`/api/documents/${r.id}/post`); toast(t('posted_at')); load(); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function doUnpost(r) {
    confirmDialog(`${t('confirm')} — ${t('unpost')} №${r.number}?`, async () => {
      try { await api.post(`/api/documents/${r.id}/unpost`); toast(t('unpost')); load(); }
      catch (e) { toast(e.message, 'err'); }
    }, t('unpost'));
  }
  function doDelete(r) {
    confirmDialog(`${t('confirm')} ${t('delete')} №${r.number}?`, async () => {
      try { await api.del(`/api/documents/${r.id}`); toast(t('deleted')); load(); }
      catch (e) { toast(e.message, 'err'); }
    });
  }
  function printDoc(id) { openEditor(null, id, load, true); }

  function pager(res) {
    const p = h('div', { class: 'pager' });
    p.append(h('button', { text: '‹', disabled: state.offset === 0, onClick: () => { state.offset = Math.max(0, state.offset - state.limit); load(); } }));
    p.append(h('span', { class: 'dim', text: `${Math.floor(state.offset / state.limit) + 1} / ${Math.max(1, Math.ceil(res.total / state.limit))}` }));
    p.append(h('button', { text: '›', disabled: state.offset + state.limit >= res.total, onClick: () => { state.offset += state.limit; load(); } }));
    return p;
  }

  function t2Label(x) {
    return getLang() === 'uz' ? x.label.uz : x.label.ru;
  }
  function fld(label, input) {
    return h('div', { class: 'fb-field' }, h('label', { text: label }), input);
  }
  function select(options, value, onChange) {
    return h('select', { onchange: (e) => onChange(e.target.value) },
      ...options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value), text: o.label })));
  }

  await load();
}

export async function optsWarehouses() {
  if (!window.__wh) window.__wh = await api.get('/api/catalogs/warehouses/options');
  return window.__wh;
}
export async function optsCounterparties() {
  if (!window.__cp) window.__cp = await api.get('/api/catalogs/counterparties/options', { limit: 2000 });
  return window.__cp;
}
export async function optsProducts() {
  if (!window.__pr) window.__pr = await api.get('/api/products-lookup/list', { limit: 2000 });
  return window.__pr;
}
export async function optsEmployees() {
  if (!window.__em) window.__em = await api.get('/api/catalogs/employees/options', { limit: 2000 });
  return window.__em;
}
export async function optsCurrencies() {
  if (!window.__cu) window.__cu = await api.get('/api/catalogs/currencies/options', { limit: 50 });
  return window.__cu;
}

function debounce(fn, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }
