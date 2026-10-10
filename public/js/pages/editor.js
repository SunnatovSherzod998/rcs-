/**
 * ДОКУМЕНТ / HUJJAT MUHARRIRI
 * 1C uslubidagi oyna: sarlavha + qatorlar + проведение.
 * Barcode skaner bilan ishlaydi.
 */
import { api, auth, getWarehouseFilter } from '../api.js';
import { t, getLang, fn, tl } from '../i18n.js';
import {
  h, btn, iconBtn, modal, toast, spinner, money, qtyFmt, num, fmtDate, today, confirmDialog, dataTable,
} from '../ui.js';
import { DOC_LABEL, optsWarehouses, optsCounterparties, optsEmployees, optsCurrencies } from './journal.js';

const ISSUE_REASONS = {
  SALE:     { uz: 'Sotish', ru: 'Продажа' },
  WRITEOFF: { uz: 'Yo‘qotish / buzilish', ru: 'Списание / порча' },
  USAGE:    { uz: 'Ichki ishlatish', ru: 'Внутреннее использование' },
  RETURN:   { uz: 'Qaytarish', ru: 'Возврат' },
  SAMPLE:   { uz: 'Namuna', ru: 'Образец' },
};
const PAY_DIR = {
  IN:  { uz: 'Mijozdan oldim', ru: 'Получено от клиента' },
  OUT: { uz: 'Yetkazib beruvchiga to‘ladim', ru: 'Оплачено поставщику' },
};

/**
 * @param {string} type  OPENING|RECEIPT|ISSUE|TRANSFER|INVENTORY|PAYMENT
 * @param {number|null} id  mavjud hujjat id (null = yangi)
 * @param {Function} onSaved
 * @param {boolean} readOnly  faqat ko‘rish / chop etish
 */
export async function openEditor(type, id, onSaved, readOnly = false) {
  // modal ichidagi asosiy konteyner — render() shu yerga yozadi
  const body = h('div', {}, spinner());
  const m = modal({
    title: id ? `${t('edit_doc')} №` : t('new_doc'),
    width: 1180,
    body,
  });

  const whList = await optsWarehouses();
  const cpList = await optsCounterparties();
  const empList = await optsEmployees();
  const curList = await optsCurrencies();
  const whFilter = getWarehouseFilter();

  let doc = null;
  let lines = [];
  let isInv = type === 'INVENTORY';
  let curType = type;
  let editable = !readOnly;

  if (id) {
    doc = await api.get('/api/documents/' + id);
    curType = doc.type;
    isInv = doc.type === 'INVENTORY';
    lines = doc.lines.map((l) => ({ ...l }));
  }

  // ---------------------------------------------------------- sarlavha maydonlari

  const fDate = h('input', { type: 'date', value: doc?.date || today(), disabled: !editable || doc?.status === 'POSTED' });
  const fType = h('select', { disabled: !editable || !!id, onchange: (e) => { if (!id) { curType = e.target.value; isInv = curType === 'INVENTORY'; render(); } } },
    ...Object.entries(DOC_LABEL).map(([v, l]) => h('option', { value: v, selected: v === curType, text: t(l) })));
  const fWh = h('select', { disabled: !editable || doc?.status === 'POSTED' },
    ...whList.map((w) => h('option', { value: w.id, selected: String(doc?.warehouse_id || whFilter || w.id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const fWh2 = h('select', { disabled: !editable || doc?.status === 'POSTED' },
    h('option', { value: '', text: '—' }),
    ...whList.map((w) => h('option', { value: w.id, selected: String(doc?.dest_warehouse_id) === String(w.id), text: fn(w, 'name_uz', 'name_ru') })));
  const fCp = h('select', { disabled: !editable || doc?.status === 'POSTED' },
    h('option', { value: '', text: '—' }),
    ...cpList.map((c) => h('option', { value: c.id, selected: String(doc?.counterparty_id) === String(c.id), text: fn(c, 'name_uz', 'name_ru') })));
  const fEmp = h('select', { disabled: !editable || doc?.status === 'POSTED' },
    h('option', { value: '', text: '—' }),
    ...empList.map((e) => h('option', { value: e.id, selected: String(doc?.employee_id) === String(e.id), text: fn(e, 'name_uz', 'name_ru') })));
  const fCur = h('select', { disabled: !editable || doc?.status === 'POSTED' },
    ...curList.map((c) => h('option', { value: c.id, selected: String(doc?.currency_id) === String(c.id), text: c.code })));
  const fReason = h('select', { disabled: !editable || doc?.status === 'POSTED' },
    ...Object.entries(ISSUE_REASONS).map(([v, l]) => h('option', { value: v, selected: v === (doc?.base_type || 'SALE'), text: getLang() === 'uz' ? l.uz : l.ru })));
  const fPayDir = h('select', { disabled: !editable || doc?.status === 'POSTED' },
    ...Object.entries(PAY_DIR).map(([v, l]) => h('option', { value: v, selected: v === (doc?.base_type || 'IN'), text: getLang() === 'uz' ? l.uz : l.ru })));
  const fNote = h('input', { type: 'text', value: doc?.note || '', disabled: !editable || doc?.status === 'POSTED', placeholder: t('note') });
  const fPaymentSum = h('input', { type: 'number', step: '0.01', value: doc?.total_amount || 0, disabled: !editable || doc?.status === 'POSTED' });

  // ---------------------------------------------------------- qatorlar jadvali

  const linesBox = h('div', {});
  const totalBox = h('div', {});
  let cellsCache = null;

  // skaner
  const scanInput = h('input', {
    placeholder: t('scan_hint'),
    disabled: !editable || doc?.status === 'POSTED',
    onkeydown: async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const code = e.target.value.trim();
      if (!code) return;
      e.target.value = '';
      await addByCode(code);
    },
  });
  const scanBar = h('div', { class: 'scan-bar' },
    h('span', { text: '🔍' }),
    scanInput,
    h('span', { class: 'scan-hint', text: 'Barcode / SKU / Artikul' })
  );

  const m2 = m;

  // ---------------------------------------------------------- render

  function render() {
    isInv = curType === 'INVENTORY';
    const posted = doc?.status === 'POSTED';

    const header = h('div', { class: 'form-grid', style: { marginBottom: '14px' } },
      fld(t('doc_type'), fType),
      fld(t('date'), fDate),
      curType === 'TRANSFER'
        ? fld(t('warehouse'), fWh) : fld(t('warehouse'), fWh),
      curType === 'TRANSFER' ? fld(t('dest_warehouse'), fWh2) : null,
      ['RECEIPT', 'OPENING', 'ISSUE', 'PAYMENT'].includes(curType) ? fld(t('counterparty'), fCp) : null,
      curType === 'ISSUE' ? fld(t('reason'), fReason) : null,
      curType === 'PAYMENT' ? fld(t('pay_direction'), fPayDir) : null,
      curType === 'PAYMENT' ? fld(t('amount'), fPaymentSum) : null,
      fld('Xodim', fEmp),
      fld(t('currency'), fCur),
      fld(t('note'), fNote)
    );

    // skaner — tovarlar qatorlari bo‘lgan hujjatlar uchun
    const showScan = !posted && editable && !['PAYMENT', 'TRANSFER'].includes(curType);

    // ustunlar
    const isPrice = ['RECEIPT', 'ISSUE', 'OPENING', 'INVENTORY', 'PAYMENT'].includes(curType);
    const isQtyOnly = curType === 'TRANSFER';
    // joy (katak) tanlash: 2D xaritadan foydalanadigan hujjatlar
    const showCell = ['RECEIPT', 'OPENING', 'PLACEMENT', 'PICK', 'INVENTORY'].includes(curType);

    const table = h('table', { class: 'doc-lines' },
      h('thead', {}, h('tr', {},
        h('th', { style: { width: '32px' }, text: t('line_no') }),
        h('th', { text: t('product') }),
        showCell ? h('th', { style: { width: '150px' }, text: getLang() === 'uz' ? 'Joy (xona/qator)' : 'Место (зона/ряд)' }) : null,
        isInv ? h('th', { style: { width: '110px' }, text: getLang() === 'uz' ? 'Tizimda' : 'В системе' }) : null,
        h('th', { style: { width: '105px' }, text: t('qty') }),
        isPrice ? h('th', { style: { width: '120px' }, text: t('price') }) : null,
        isPrice ? h('th', { style: { width: '80px' }, text: getLang() === 'uz' ? 'Skidka %' : 'Скидка %' }) : null,
        isPrice ? h('th', { style: { width: '130px' }, text: t('amount') }) : null,
        curType === 'TRANSFER' ? h('th', { style: { width: '140px' }, text: getLang() === 'uz' ? 'Qayerga' : 'Куда' }) : null,
        !isQtyOnly ? h('th', { style: { width: '95px' }, text: t('available') }) : null,
        h('th', { style: { width: '36px' }, text: '' })
      )),
      h('tbody', {}, ...lines.map((l, i) => lineRow(l, i, isPrice, isQtyOnly, posted, showCell)))
    );

    linesBox.replaceChildren(
      showScan ? scanBar : null,
      h('div', { class: 'table-wrap', style: { maxHeight: '340px' } }, table),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' } },
        !posted && editable ? btn(t('add_line'), { icon: '＋', cls: 'btn-sm', onClick: () => { lines.push(bl()); render(); } }) : h('span'),
        h('span', { class: 'dim', style: { fontSize: '12px' }, text: lines.length + ' / ' + t('total').toLowerCase() })
      ),
      totalBox
    );
    renderTotals(curType);

    body.replaceChildren(
      doc?.status ? statusLine(doc) : null,
      header,
      linesBox
    );
  }

  function statusLine(d) {
    const posted = d.status === 'POSTED';
    return h('div', { class: 'alert ' + (posted ? 'alert-ok' : 'alert-warn') },
      h('b', { text: posted ? t('st_posted') : t('st_draft') }),
      posted ? h('span', {}, '  ·  ' + t('posted_at') + ': ' + fmtDate(d.posted_at) + (d.posted_by_name ? ' (' + d.posted_by_name + ')' : '')) : null,
      posted ? h('span', {}, '  ·  ' + t('note') + ': ' + (readOnly ? '' : 'tahrirlash uchun ' + t('unpost').toLowerCase())) : null
    );
  }

  function bl() {
    return { product_id: null, sku: '', name: '', qty: 1, price: 0, amount: 0, discount: 0, dest_location_id: null, dest_location_code: '', qty_system: isInv ? 0 : null, unit_code: '', qty_on_hand: 0, location_id: null, location_code: '', _new: true };
  }

  /** forma maydoni (label + input) */
  function fld(label, input) {
    return h('div', { class: 'form-field' }, h('label', { text: label }), input);
  }

  function lineRow(l, i, isPrice, isQtyOnly, posted, showCell) {
    const dis = posted || !editable;
    const prodCell = h('td', {},
      h('input', {
        value: l.sku || '', disabled: dis, placeholder: 'SKU / nomi',
        onchange: async (e) => {
          const code = e.target.value.trim();
          if (!code) { l.product_id = null; l.name = ''; render(); return; }
          const p = await findProduct(code);
          if (!p) { toast('Topilmadi: ' + code, 'err'); return; }
          applyProduct(l, p);
          render();
        },
      }),
      h('div', { class: 'dim', style: { fontSize: '11px', padding: '1px 5px 3px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
        l.name || '')
    );

    // joy (katak) tanlash
    const cellCell = h('td', {},
      h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
        h('input', {
          value: l.location_code || '', disabled: dis, placeholder: getLang() === 'uz' ? 'joy…' : 'место…',
          readonly: true,
          style: { cursor: dis ? 'default' : 'pointer', fontFamily: 'Consolas, monospace', fontSize: '11.5px' },
          onclick: () => { if (!dis) pickCell(l); },
        }),
        dis ? null : iconBtn('▩', getLang() === 'uz' ? '2D xaritada tanlash' : 'Выбрать на карте',
          () => pickCell(l)))
    );

    const qtyCell = h('td', {},
      h('input', {
        type: 'number', step: '0.001', value: l.qty ?? 0, disabled: dis,
        oninput: (e) => { l.qty = Number(e.target.value) || 0; recalcLine(l); amtCell.textContent = money(l.amount); renderTotals(curType); },
      })
    );

    const sysCell = h('td', {},
      h('input', {
        type: 'number', step: '0.001', value: l.qty_system ?? 0, disabled: dis,
        oninput: (e) => { l.qty_system = Number(e.target.value) || 0; render(); },
      })
    );

    const priceCell = h('td', {},
      h('input', {
        type: 'number', step: '0.01', value: l.price ?? 0, disabled: dis,
        oninput: (e) => { l.price = Number(e.target.value) || 0; recalcLine(l); amtCell.textContent = money(l.amount); renderTotals(curType); },
      })
    );

    const discountCell = h('td', {},
      h('input', {
        type: 'number', step: '0.1', min: '0', max: '100', value: l.discount ?? 0, disabled: dis,
        oninput: (e) => { l.discount = Math.min(100, Math.max(0, Number(e.target.value) || 0)); recalcLine(l); amtCell.textContent = money(l.amount); renderTotals(curType); },
      })
    );

    const amtCell = h('td', { class: 'n' }, money(l.amount ?? ((l.qty || 0) * (l.price || 0))));

    // TRANSFER: qabul qiluvchi joy (xona/stellaj/qator/yacheyka)
    const destCell = curType === 'TRANSFER' ? h('td', {},
      h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
        h('input', {
          value: l.dest_location_code || '', disabled: dis, placeholder: getLang() === 'uz' ? 'qayerga…' : 'куда…',
          readonly: true,
          style: { cursor: dis ? 'default' : 'pointer', fontFamily: 'Consolas, monospace', fontSize: '11.5px' },
          onclick: () => { if (!dis) pickDestCell(l); },
        }),
        dis ? null : iconBtn('▩', getLang() === 'uz' ? 'Qayerga tanlash' : 'Выбрать место', () => pickDestCell(l)))
    ) : null;

    const availCell = h('td', { class: 'n' },
      h('span', { class: (l.qty ?? 0) > (l.qty_on_hand ?? 0) ? 'neg' : '', text: qtyFmt(l.qty_on_hand ?? 0) })
    );

    return h('tr', { class: l.product_id ? '' : 'invalid-row' },
      h('td', { class: 'dim', style: { textAlign: 'center' }, text: i + 1 }),
      prodCell,
      showCell ? cellCell : null,
      isInv ? sysCell : null,
      qtyCell,
      isPrice ? priceCell : null,
      isPrice ? discountCell : null,
      isPrice ? amtCell : null,
      destCell,
      !isQtyOnly ? availCell : null,
      h('td', { style: { textAlign: 'center' } },
        dis ? null : iconBtn('✕', t('delete'), () => { lines.splice(i, 1); render(); }))
    );
  }

  // ---------------- 2D xaritada joy tanlash
  async function pickCell(line) {
    const whId = Number(fWh.value) || 0;
    if (!whId) { toast(getLang() === 'uz' ? 'Avval omborni tanlang' : 'Сначала выберите склад', 'err'); return; }

    if (!cellsCache) {
      try { cellsCache = await api.get('/api/warehouse/cells?warehouse_id=' + whId); }
      catch (e) { toast(e.message, 'err'); return; }
    }
    if (!cellsCache.length) {
      toast(getLang() === 'uz' ? 'Bu ombor uchun 2D skelet yo‘q' : 'Нет каркаса для этого склада', 'err');
      return;
    }

    // zona -> qator -> qavat -> joy
    const byZone = new Map();
    for (const c of cellsCache) {
      if (!byZone.has(c.zone)) byZone.set(c.zone, new Map());
      const rows = byZone.get(c.zone);
      const rk = c.row_no * 10 + c.level_no;
      if (!rows.has(rk)) rows.set(rk, []);
      rows.get(rk).push(c);
    }

    const box = h('div', {});
    const m = modal({
      title: (getLang() === 'uz' ? 'Joy tanlash · ' : 'Выбор места · ') + (line.sku || ''),
      width: 1120,
      body: box,
      actions: (close) => [
        btn(getLang() === 'uz' ? 'Joyni tozalash' : 'Очистить место', {
          onClick: () => { line.location_id = null; line.location_code = ''; m.close(); render(); },
        }),
        btn(t('cancel'), { onClick: close }),
      ],
    });

    box.append(h('div', { class: 'alert alert-info' },
      getLang() === 'uz'
        ? 'Kinozaldagi joy kabi tanlang — bo‘sh joylar oq, band joylar rangli.'
        : 'Выберите место как в кинотеатре — свободные светлые, занятые цветные.'));

    for (const [zone, rows] of byZone) {
      const zoneEl = h('div', { class: 'wh-zone' },
        h('div', { class: 'wh-zone-head' },
          h('span', {}, h('span', { class: 'z-letter', text: zone }),
            (getLang() === 'uz' ? 'Zona ' : 'Зона ') + zone)),
        h('div', { class: 'wh-zone-body' }));
      const body = zoneEl.querySelector('.wh-zone-body');
      for (const [rk, cells] of rows) {
        const row = Math.floor(rk / 10), level = rk % 10;
        body.append(h('div', { class: 'wh-row' },
          h('div', { class: 'wh-row-lbl' },
            h('b', { text: (getLang() === 'uz' ? 'Qator ' : 'Ряд ') + row }),
            (getLang() === 'uz' ? level + '-qavat' : 'ярус ' + level)),
          h('div', { class: 'wh-slots' }, ...cells.map((c) => {
            const isPicked = line.location_id === c.id;
            const isFree = !c.qty;
            let cls = 'seat ' + (isFree ? 'empty' : 'multi');
            if (isPicked) cls += ' picked';
            if (c.sku && c.sku === line.sku && c.qty > 0) cls = 'seat ok' + (isPicked ? ' picked' : '');
            return h('div', {
              class: cls,
              title: c.sku ? `${c.code} — ${c.sku} (${qtyFmt(c.qty)})` : c.code,
              onclick: () => {
                line.location_id = c.id;
                line.location_code = c.code;
                m.close();
                render();
                toast(`${line.sku} → ${c.code}`, 'ok');
              },
            },
              h('div', { class: 's-code', text: c.code }),
              h('div', { class: 's-sku', text: c.sku || '—' }),
              h('div', { class: 's-qty', text: c.qty ? qtyFmt(c.qty) : '' })
            );
          }))
        ));
        body.append(h('div', { class: 'wh-aisle' }));
      }
      box.append(zoneEl);
    }
  }

  function recalcLine(l) {
    const d = Math.min(100, Math.max(0, Number(l.discount) || 0));
    l.discount = d;
    l.amount = Math.round((l.qty || 0) * (l.price || 0) * (1 - d / 100) * 100) / 100;
  }

  function renderTotals(ty) {
    const sumQty = lines.reduce((s, l) => s + Math.abs(ty === 'INVENTORY' ? (l.qty - (l.qty_system ?? 0)) : (l.qty || 0)), 0);
    const sumGross = lines.reduce((s, l) => s + (l.qty || 0) * (l.price || 0), 0);
    const sumAmt = lines.reduce((s, l) => s + ((l.qty || 0) * (l.price || 0) * (1 - (Math.min(100, Math.max(0, Number(l.discount) || 0)) / 100))), 0);
    const sumDisc = sumGross - sumAmt;
    const sumCost = lines.reduce((s, l) => s + (l.qty || 0) * (l._cost || 0), 0);
    totalBox.replaceChildren(h('div', { class: 'doc-total' },
      h('div', {}, h('div', { class: 'k', text: t('qty') }), h('div', { text: qtyFmt(sumQty) })),
      ty !== 'TRANSFER' && sumDisc > 0 ? h('div', {}, h('div', { class: 'k', text: getLang() === 'uz' ? 'Skidka' : 'Скидка' }), h('div', { text: money(sumDisc) })) : null,
      ty !== 'TRANSFER' ? h('div', {}, h('div', { class: 'k', text: t('amount') }), h('div', { text: money(sumAmt) })) : null,
      ['RECEIPT', 'ISSUE', 'OPENING'].includes(ty)
        ? h('div', {}, h('div', { class: 'k', text: t('cost') }), h('div', { text: money(sumCost) })) : null,
      ['RECEIPT', 'ISSUE', 'OPENING'].includes(ty)
        ? h('div', {}, h('div', { class: 'k', text: 'Foyda / Zarar' }),
            h('div', { class: ty === 'ISSUE' ? 'pos' : '', text: ty === 'ISSUE' ? money(sumAmt - sumCost) : '—' })) : null
    ));
  }

  // ---------------------------------------------------------- mahsulot qidirish

  const prodCache = new Map();
  async function findProduct(code) {
    if (prodCache.has(code)) return prodCache.get(code);
    try {
      const res = await api.get('/api/products-lookup/stock', { code, warehouse_id: fWh.value });
      prodCache.set(code, res.product);
      return res.product;
    } catch { return null; }
  }

  function applyProduct(l, p) {
    l.product_id = p.id;
    l.sku = p.sku;
    l.name = getLang() === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
    l.unit_code = p.unit_id ? '' : '';
    if (curType === 'RECEIPT' || curType === 'OPENING' || curType === 'INVENTORY') l.price = p.cost_price || 0;
    else if (curType === 'ISSUE') l.price = p.sale_price || p.cost_price || 0;
    else if (curType === 'PLACEMENT' || curType === 'PICK') l.price = 0;   // qiymat serverda hisoblanadi
    l._cost = p.cost_price || 0;
    recalcLine(l);
  }

  // ---------------- TRANSFER: qabul qiluvchi joyni tanlash (xona -> stellaj -> qator -> yacheyka)
  async function pickDestCell(line) {
    const whId = Number(fWh2.value) || 0;
    if (!whId) { toast(getLang() === 'uz' ? 'Avval qabul qiluvchi omborni tanlang' : 'Сначала выберите склад-получатель', 'err'); return; }

    const box = h('div', {});
    const m = modal({
      title: (getLang() === 'uz' ? 'Qayerga tanlash · ' : 'Выбор места · ') + (line.sku || ''),
      width: 1120,
      body: box,
      actions: (close) => [btn(t('cancel'), { onClick: close })],
    });

    async function renderRooms() {
      box.replaceChildren(spinner());
      let d;
      try { d = await api.get('/api/plan/rooms', { warehouse_id: whId }); }
      catch (e) { toast(e.message, 'err'); return; }
      if (!d.rooms.length) {
        box.replaceChildren(h('div', { class: 'alert alert-info', text: getLang() === 'uz'
          ? 'Bu omborda xonalar yo‘q' : 'В этом складе нет комнат' }));
        return;
      }
      const grid = h('div', { style: { display: 'grid', gap: '8px' } });
      for (const r of d.rooms) {
        const rk = 'r' + r.id;
        const rOpen = expanded.has(rk);
        grid.append(h('div', {},
          h('button', { class: 'btn btn-sm', onclick: async () => { rOpen ? expanded.delete(rk) : expanded.add(rk); renderRooms(); } },
            (rOpen ? '▾ ' : '▸ ')),
          h('button', { class: 'btn btn-sm', style: { marginLeft: '2px' },
            onclick: async () => { rOpen ? expanded.delete(rk) : expanded.add(rk); renderRooms(); } },
            r.code + ' · ' + fn(r, 'name_uz', 'name_ru')),
          rOpen ? await roomBlock(r) : null));
      }
      box.replaceChildren(grid);
    }

    async function roomBlock(r) {
      const d = await api.get('/api/plan/room', { room_id: r.id });
      const wrap = h('div', { style: { margin: '6px 0 6px 18px', display: 'grid', gap: '6px' } });
      for (const k of d.racks) {
        const kk = 'k' + k.id;
        const kOpen = expanded.has(kk);
        wrap.append(h('div', {},
          h('button', { class: 'btn btn-sm', onclick: async () => { kOpen ? expanded.delete(kk) : expanded.add(kk); renderRooms(); } },
            (kOpen ? '▾ ' : '▸ ')),
          h('button', { class: 'btn btn-sm', style: { marginLeft: '2px' },
            onclick: async () => { kOpen ? expanded.delete(kk) : expanded.add(kk); renderRooms(); } },
            k.code),
          kOpen ? h('div', { style: { margin: '6px 0 6px 18px', display: 'grid', gap: '4px' } },
            ...k.levels.map((lv) => h('div', {},
              h('button', { class: 'btn btn-sm', style: { marginRight: '4px' },
                onclick: async () => {
                  const lk = 'l' + k.id + '-' + lv.level;
                  expanded.has(lk) ? expanded.delete(lk) : expanded.add(lk);
                  renderRooms();
                } }, (getLang() === 'uz' ? 'Qator ' : 'Ряд ') + lv.level),
              expanded.has('l' + k.id + '-' + lv.level) ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
                ...lv.cells.map((c) => h('button', {
                  class: 'btn btn-sm' + (c.items?.length ? ' btn-primary' : ''),
                  onclick: () => {
                    line.dest_location_id = c.id || c.location_id;
                    line.dest_location_code = c.code;
                    m.close();
                    render();
                  },
                }, c.code))) : null))
          ) : null));
      }
      if (!d.racks.length) wrap.append(h('div', { class: 'dim', text: getLang() === 'uz' ? 'Stellajlar yo‘q' : 'Нет стеллажей' }));
      return wrap;
    }

    const expanded = new Set();
    await renderRooms();
  }

  async function addByCode(code) {
    const r = await api.get('/api/products-lookup/stock', { code, warehouse_id: fWh.value });
    const l = bl();
    applyProduct(l, r.product);
    if (isInv) l.qty_system = r.total_qty;
    lines.push(l);
    if (curType === 'PAYMENT') { /* to'lov qatorlarsiz */ }
    render();
    toast('+ ' + l.sku + ' · ' + t('available') + ': ' + qtyFmt(r.total_qty), 'ok');
  }

  // ---------------------------------------------------------- saqlash / проведение

  function collect() {
    return {
      type: curType,
      date: fDate.value,
      warehouse_id: fWh.value ? Number(fWh.value) : null,
      dest_warehouse_id: curType === 'TRANSFER' ? (fWh2.value ? Number(fWh2.value) : null) : null,
      counterparty_id: fCp.value ? Number(fCp.value) : null,
      employee_id: fEmp.value ? Number(fEmp.value) : null,
      currency_id: fCur.value ? Number(fCur.value) : null,
      reason: curType === 'ISSUE' ? fReason.value : null,
      base_type: curType === 'ISSUE' ? fReason.value : curType === 'PAYMENT' ? fPayDir.value : null,
      note: fNote.value,
      lines: curType === 'PAYMENT' ? [] : lines.filter((l) => l.product_id).map((l) => ({
        product_id: l.product_id,
        location_id: l.location_id || null,
        qty: Number(l.qty) || 0,
        price: Number(l.price) || 0,
        discount: Math.min(100, Math.max(0, Number(l.discount) || 0)),
        dest_location_id: l.dest_location_id || null,
        qty_system: isInv ? Number(l.qty_system) || 0 : null,
      })),
      // PLACEMENT / PICK uchun joy majburiy
    };
  }

  async function save(thenPost) {
    const payload = collect();
    if (payload.type !== 'PAYMENT' && !payload.lines.length) {
      toast(t('no_lines'), 'err'); return;
    }
    // PLACEMENT / PICK uchun joy (katak) tanlanishi shart
    if (['PLACEMENT', 'PICK'].includes(payload.type)) {
      const noCell = payload.lines.filter((l) => !l.location_id);
      if (noCell.length) {
        toast(getLang() === 'uz'
          ? `${noCell.length} qator uchun joy (katak) tanlanmagan — ▩ tugmasini bosing`
          : `Для ${noCell.length} строк не выбрано место — нажмите кнопку ▩`, 'err');
        return;
      }
    }
    if (payload.type === 'PAYMENT') payload.total_amount = Number(fPaymentSum.value) || 0;
    try {
      let res;
      if (id) res = await api.put('/api/documents/' + id, payload);
      else res = await api.post('/api/documents', payload);
      const newId = res.document.id;
      if (thenPost) {
        await api.post(`/api/documents/${newId}/post`);
        toast(t('posted_at'));
      } else {
        toast(t('saved'));
      }
      m2.close();
      await onSaved?.();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  // ---------------------------------------------------------- amallar

  const posted = doc?.status === 'POSTED';
  const canWrite = auth.can('documents.write') && (!posted || readOnly);
  const canPost = auth.can('documents.post');

  m2.box.querySelector('.modal-foot')?.remove();
  const foot = h('div', { class: 'modal-foot' });
  m2.box.append(foot);

  function renderActions() {
    foot.replaceChildren();
    if (id && posted) {
      if (canPost && !readOnly) {
        foot.append(
          btn(t('unpost'), { cls: '', onClick: () => confirmDialog(`${t('confirm')} ${t('unpost')}?`, async () => {
            try { await api.post(`/api/documents/${id}/unpost`); toast(t('unpost')); m2.close(); await onSaved?.(); }
            catch (e) { toast(e.message, 'err'); }
          }, t('unpost')) })
        );
      }
      foot.append(btn(t('print'), { icon: '🖨', onClick: () => window.print() }));
      return;
    }
    if (readOnly) { foot.append(btn(t('close'), { onClick: () => m2.close() })); return; }
    if (!canWrite) { foot.append(btn(t('close'), { onClick: () => m2.close() })); return; }
    if (id) {
      foot.append(btn(t('save'), { onClick: () => save(false) }));
      if (canPost) foot.append(btn(t('post') + ' + ' + t('save'), { cls: 'btn-ok', icon: '✓', onClick: () => save(true) }));
      foot.append(h('span', { style: { marginRight: 'auto' } }),
        btn(t('delete'), { cls: 'btn-danger', onClick: () => confirmDialog(`${t('confirm')} ${t('delete')}?`, async () => {
          try { await api.del('/api/documents/' + id); toast(t('deleted')); m2.close(); await onSaved?.(); }
          catch (e) { toast(e.message, 'err'); }
        }) }));
    } else {
      foot.append(btn(t('cancel'), { onClick: () => m2.close() }));
      foot.append(btn(t('save'), { onClick: () => save(false) }));
      if (canPost) foot.append(btn(t('post') + ' + ' + t('save'), { cls: 'btn-ok', icon: '✓', onClick: () => save(true) }));
    }
  }

  render();
  renderActions();
}
