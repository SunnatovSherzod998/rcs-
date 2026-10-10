/**
 * 2D ОМБОР ХАРИТАСИ / 2D СКАРТА СКЛАДА
 * Kinozaldagi "joy tanlash" (seat map) uslubida.
 */
import { api, auth, getWarehouseFilter, setWarehouseFilter } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import {
  h, card, kpi, pageHead, btn, iconBtn, modal, dataTable, toast, spinner,
  money, num, qtyFmt, fmtDate, confirmDialog,
} from '../ui.js';
import { optsWarehouses } from './journal.js';
import { go } from '../app.js';

// yon panel uchun tanlangan joy
let selectedCell = null;
let pickMode = false;
let onPick = null;

export async function mapPage(root) {
  const whs = await optsWarehouses();
  const state = {
    warehouse_id: Number(getWarehouseFilter()) || whs[0].id,
    zone: '', brand_id: '', category_id: '',
    only_occupied: false, q: '',
  };
  selectedCell = null;

  root.replaceChildren();
  root.append(pageHead(
    getLang() === 'uz' ? '2D ombor xaritasi' : '2D карта склада',
    getLang() === 'uz' ? 'Zona → qator → qavat → joy. Joyni bosing.' : 'Зона → ряд → ярус → место. Нажмите на место.',
    btn(t('refresh'), { icon: '↻', onClick: () => load() }),
    auth.can('documents.write') ? btn(t('m_issue') + ' + joy', {
      icon: '▣', cls: 'btn-primary',
      onClick: () => startPick(),
    }) : null,
    auth.can('catalogs.write') ? btn(getLang() === 'uz' ? 'Skelet qurish' : 'Построить каркас', {
      icon: '▦', onClick: () => buildDialog(),
    }) : null
  ));

  // ---------------- filtr paneli
  const fWh = h('select', { onchange: (e) => { state.warehouse_id = Number(e.target.value); setWarehouseFilter(e.target.value); state.zone = ''; load(); } },
    ...whs.map((w) => h('option', { value: w.id, selected: Number(w.id) === state.warehouse_id, text: fn(w, 'name_uz', 'name_ru') })));
  const fZone = h('select', { onchange: (e) => { state.zone = e.target.value; load(); } });
  const fBrand = h('select', { onchange: (e) => { state.brand_id = e.target.value; load(); } },
    h('option', { value: '', text: t('m_brands') + ': ' + t('all') }),
    ...(await api.get('/api/catalogs/brands/options', { limit: 500 })).map((b) =>
      h('option', { value: b.id, text: fn(b, 'name_uz', 'name_ru') })));
  const fCat = h('select', { onchange: (e) => { state.category_id = e.target.value; load(); } },
    h('option', { value: '', text: t('m_categories') + ': ' + t('all') }),
    ...(await api.get('/api/catalogs/categories/options', { limit: 500 })).map((c) =>
      h('option', { value: c.id, text: fn(c, 'name_uz', 'name_ru') })));
  const fOcc = h('input', { type: 'checkbox', onchange: (e) => { state.only_occupied = e.target.checked; load(); } });
  const fQ = h('input', { type: 'search', placeholder: 'SKU / nomi / barcode', oninput: deb((e) => { state.q = e.target.value; load(); }, 300) });

  const kpiBox = h('div', { class: 'kpi-row' });
  const mapBox = h('div', { class: 'wh-layout' });
  const sideBox = h('div', { class: 'wh-side' });

  root.append(
    card(null, h('div', { class: 'wh-toolbar' },
      fld(getLang() === 'uz' ? 'Ombor' : 'Склад', fWh),
      fld(getLang() === 'uz' ? 'Zona' : 'Зона', fZone),
      fld(getLang() === 'uz' ? 'Brend' : 'Бренд', fBrand),
      fld(getLang() === 'uz' ? 'Tur' : 'Категория', fCat),
      fld(getLang() === 'uz' ? 'Qidirish' : 'Поиск', fQ),
      h('label', { class: 'fb-field', style: { flexDirection: 'row', alignItems: 'center', gap: '5px' } },
        fOcc, h('span', { style: { fontSize: '12px' }, text: getLang() === 'uz' ? 'Faqat to‘langan' : 'Только занятые' })),
      h('button', { class: 'btn', text: t('reset'), onClick: () => {
        state.zone = ''; state.brand_id = ''; state.category_id = ''; state.only_occupied = false; state.q = '';
        fBrand.value = ''; fCat.value = ''; fQ.value = ''; fOcc.checked = false; load();
      } })
    ))
  );
  root.append(kpiBox);
  root.append(mapBox);
  mapBox.append(h('div', { id: 'whMap' }), sideBox);

  // ---------------- yuklash
  async function load() {
    mapBox.querySelector('#whMap').replaceChildren(spinner());
    const d = await api.get('/api/warehouse/map', {
      warehouse_id: state.warehouse_id,
      zone: state.zone, brand_id: state.brand_id, category_id: state.category_id,
      only_occupied: state.only_occupied ? 1 : 0, q: state.q,
    });

    // zona filtrini to'ldirish
    const zSel = fZone;
    const zones = d.zones.map((z) => z.zone);
    zSel.replaceChildren(h('option', { value: '', text: t('all') }),
      ...zones.map((z) => h('option', { value: z, selected: state.zone === z, text: getLang() === 'uz' ? 'Zona ' + z : 'Зона ' + z })));
    if (state.zone && !zones.includes(state.zone)) { state.zone = ''; zSel.value = ''; }

    // KPI
    const s = d.summary;
    const fillKpi = kpi(getLang() === 'uz' ? 'Bandlik' : 'Заполненность', s.fill_rate + '%', null,
      s.fill_rate > 85 ? 'err' : s.fill_rate > 60 ? 'warn' : 'ok');
    const sub = fillKpi.querySelector('.kpi-sub');
    if (sub) sub.append(h('div', { class: 'fill-bar' },
      h('i', { style: { width: Math.max(2, s.fill_rate) + '%' } })));

    kpiBox.replaceChildren(
      kpi(getLang() === 'uz' ? 'Joylar' : 'Мест', num(s.cells),
        `${s.occupied} ${getLang() === 'uz' ? 'band' : 'занято'} · ${s.empty} ${getLang() === 'uz' ? 'bo‘sh' : 'свободно'}`),
      fillKpi,
      kpi('SKU', num(s.products), getLang() === 'uz' ? 'turli xil tovar' : 'позиций'),
      kpi(getLang() === 'uz' ? 'Umumiy miqdor' : 'Всего', qtyFmt(s.qty), '', 'ok'),
      kpi(t('amount'), money(s.amount) + ' UZS', '', 'ok'),
      s.without_location
        ? kpi(getLang() === 'uz' ? 'Joylashmagan' : 'Без места', num(s.without_location),
            getLang() === 'uz' ? 'katakka o‘tkazing' : 'разместите', 'err')
        : kpi(getLang() === 'uz' ? 'Joylashmagan' : 'Без места', '0', getLang() === 'uz' ? ' hammasi joyida' : 'всё размещено', 'ok')
    );

    // xarita
    const host = mapBox.querySelector('#whMap');
    host.replaceChildren();

    if (!d.zones.length) {
      host.append(card(null, h('div', { class: 'alert alert-warn' },
        getLang() === 'uz'
          ? 'Bu ombor uchun 2D skelet yaratilmagan. «Skelet qurish» tugmasini bosing.'
          : 'Для этого склада каркас не построен. Нажмите «Построить каркас».')));
    } else {
      for (const Z of d.zones) host.append(zoneCard(Z));
      host.append(legend());
    }
    renderSide();
    await fillTiles().catch(() => {});
  }

  // ---------------- zona karti
  function zoneCard(Z) {
    return h('div', { class: 'wh-zone' },
      h('div', { class: 'wh-zone-head' },
        h('span', {},
          h('span', { class: 'z-letter', text: Z.zone }),
          (getLang() === 'uz' ? 'Zona ' : 'Зона ') + Z.zone),
        h('span', { class: 'z-meta' },
          `${Z.cells} ${getLang() === 'uz' ? 'joy' : 'мест'} · ` +
          `${Z.occupied} ${getLang() === 'uz' ? 'band' : 'занято'} · ` +
          `${qtyFmt(Z.qty)} ${getLang() === 'uz' ? 'dona' : 'шт'} · ` +
          money(Z.amount) + ' UZS')
      ),
      h('div', { class: 'wh-zone-body' },
        h('div', { class: 'wh-stage', text: getLang() === 'uz' ? '◄ kirish / вход' : '' }),
        ...Z.rows.flatMap((R) => [
          rowStrip(R),
          aisle(),
        ])
      )
    );
  }

  function rowStrip(R) {
    return h('div', { class: 'wh-row' },
      h('div', { class: 'wh-row-lbl' },
        h('b', { text: (getLang() === 'uz' ? 'Qator ' : 'Ряд ') + R.row }),
        (getLang() === 'uz' ? R.level + '-qavat' : 'ярус ' + R.level)
      ),
      h('div', { class: 'wh-slots' }, ...R.slots.map(seat))
    );
  }

  function aisle() {
    return h('div', { class: 'wh-aisle' }, h('span', { text: getLang() === 'uz' ? 'yo‘l / проход' : '' }));
  }

  // ---------------- bitta "joy" (seat)
  function seat(cell) {
    const items = cell.items;
    const first = items[0];
    const isSel = selectedCell && selectedCell.id === cell.id;
    const isPicked = pickMode && onPick && onPick.selected && onPick.selected.has(cell.id);

    let cls = 'seat';
    if (!items.length) cls += ' empty';
    else if (items.length > 1) cls += ' multi';
    else if (cell.capacity > 0 && cell.qty >= cell.capacity) cls += ' full';
    else if (cell.qty <= (first.min_stock || 0)) cls += ' low';
    if (cell.qty < 0) cls += ' over';
    if (isSel) cls += ' sel';
    if (isPicked) cls += ' picked';

    const title = items.length
      ? items.map((i) => `${i.sku} — ${i.name_ru} (${qtyFmt(i.qty)} ${i.unit_code || ''})`).join('\n')
      : (getLang() === 'uz' ? 'Bo‘sh joy' : 'Свободное место');

    return h('div', {
      class: cls,
      title,
      onclick: () => cellClick(cell),
    },
      h('div', { class: 's-code', text: cell.code }),
      h('div', { class: 's-sku', text: first ? first.sku : '—' }),
      h('div', { class: 's-name', text: first ? (first.name_ru || '').slice(0, 14) : '' }),
      h('div', { class: 's-qty', text: items.length ? qtyFmt(cell.qty) : '' })
    );
  }

  async function cellClick(cell) {
    if (pickMode && onPick) { onPick.toggle(cell); return; }
    selectedCell = cell;
    renderSide();
    document.querySelectorAll('.seat').forEach((el) => el.classList.remove('sel'));
    load();
  }

  // ---------------- yon panel
  function renderSide() {
    sideBox.replaceChildren();
    if (!selectedCell) {
      sideBox.append(card(getLang() === 'uz' ? 'Joy haqida' : 'О месте',
        h('div', { class: 'alert alert-info', text: getLang() === 'uz'
          ? 'Xaritadagi istalgan joyni bosing — tushunarli ma’lumot chiqadi.'
          : 'Нажмите на любое место на карте — здесь появится информация.' }),
        legend(), brandTiles(), categoryTiles()));
      return;
    }
    const c = selectedCell;
    const rows = h('div', { class: 'wh-cell-detail' },
      kv(getLang() === 'uz' ? 'Kod' : 'Код', c.code),
      kv(getLang() === 'uz' ? 'Zona' : 'Зона', c.zone),
      kv(getLang() === 'uz' ? 'Qator' : 'Ряд', c.row),
      kv(getLang() === 'uz' ? 'Qavat' : 'Ярус', c.level),
      kv(getLang() === 'uz' ? 'O‘rin' : 'Позиция', c.pos),
      kv(getLang() === 'uz' ? 'Sig‘im' : 'Ёмкость', c.capacity > 0 ? qtyFmt(c.capacity) : '—'),
      kv(t('qty'), qtyFmt(c.qty)),
      kv(t('amount'), money(c.amount) + ' UZS'),
    );

    const itemsTable = c.items.length
      ? dataTable({
          columns: [
            { key: 'sku', title: 'SKU', width: '85px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
            { key: 'name', title: t('product'), render: (r) => h('span', {},
                h('span', { text: (getLang() === 'uz' ? (r.name_uz || r.name_ru) : r.name_ru) }),
                r.brand ? h('div', { class: 'dim', style: { fontSize: '11px' }, text: r.brand + ' · ' + (r.category || '') }) : null) },
            { key: 'qty', title: t('qty'), align: 'right', width: '80px',
              render: (r) => h('b', { class: r.qty <= (r.min_stock || 0) ? 'neg' : '', text: qtyFmt(r.qty) }) },
          ],
          rows: c.items,
          onRowClick: (r) => go('card/' + r.product_id),
        })
      : h('div', { class: 'alert alert-info', text: getLang() === 'uz' ? 'Bu joy bo‘sh' : 'Место свободно' });

    sideBox.append(
      card((getLang() === 'uz' ? 'Joy ' : 'Место ') + c.code, rows),
      card(getLang() === 'uz' ? 'Mazmuni' : 'Содержимое', itemsTable,
        h('div', { style: { marginTop: '10px' } },
          btn(getLang() === 'uz' ? 'Bu joyga kirim qilish' : 'Приход в это место', {
            cls: 'btn-sm btn-primary', icon: '＋',
            onClick: () => { location.hash = 'doc/new/RECEIPT'; toast(t('m_receipt') + ': joyni tanlang'); },
          }))),
      brandTiles(), categoryTiles()
    );
  }

  // ---------------- brend / tur plitalari
  function brandTiles() {
    return h('div', { id: 'whBrands' }, card(getLang() === 'uz' ? 'Brendlar kesimida' : 'По брендам',
      spinner(), legend()));
  }
  function categoryTiles() {
    return h('div', { id: 'whCats' }, card(getLang() === 'uz' ? 'Turlar kesimida' : 'По категориям', spinner()));
  }

  async function fillTiles() {
    const bEl = sideBox.querySelector('#whBrands .card-body');
    const cEl = sideBox.querySelector('#whCats .card-body');
    if (bEl) {
      const brands = await api.get('/api/warehouse/by-brand', { warehouse_id: state.warehouse_id, category_id: state.category_id });
      bEl.replaceChildren(
        h('div', { class: 'tiles' }, ...brands.map((b) => h('div', {
          class: 'tile brand' + (String(state.brand_id) === String(b.id) ? ' sel' : ''),
          onclick: () => { state.brand_id = String(state.brand_id) === String(b.id) ? '' : String(b.id); fBrand.value = state.brand_id; load(); },
        },
          h('div', { class: 't-name', text: fn(b, 'name_uz', 'name_ru') }),
          h('div', { class: 't-meta', text: `${b.products} SKU · ${qtyFmt(b.qty)} ${getLang() === 'uz' ? 'dona' : 'шт'}` }),
          h('div', { class: 't-qty', text: money(b.amount) + ' UZS' }),
          h('div', { class: 't-amt', text: (b.in_stock || 0) + ' ' + (getLang() === 'uz' ? 'tur bandda' : 'позиций в наличии') })
        ))),
        brands.length ? null : h('div', { class: 'alert alert-info', text: t('no_data') }),
        legend()
      );
    }
    if (cEl) {
      const cats = await api.get('/api/warehouse/by-category', { warehouse_id: state.warehouse_id, brand_id: state.brand_id });
      cEl.replaceChildren(
        h('div', { class: 'tiles' }, ...cats.map((c) => h('div', {
          class: 'tile' + (String(state.category_id) === String(c.id) ? ' sel' : ''),
          onclick: () => { state.category_id = String(state.category_id) === String(c.id) ? '' : String(c.id); fCat.value = state.category_id; load(); },
        },
          h('div', { class: 't-name', text: fn(c, 'name_uz', 'name_ru') }),
          h('div', { class: 't-meta', text: `${c.products} SKU · ${qtyFmt(c.qty)} ${getLang() === 'uz' ? 'dona' : 'шт'}` }),
          h('div', { class: 't-qty', text: qtyFmt(c.qty) }),
          h('div', { class: 't-amt', text: money(c.amount) + ' UZS' })
        ))),
        cats.length ? null : h('div', { class: 'alert alert-info', text: t('no_data') })
      );
    }
  }

  function legend() {
    return h('div', { class: 'wh-legend' },
      h('span', {}, h('i', { class: 'l-empty' }), getLang() === 'uz' ? 'Bo‘sh' : 'Свободно'),
      h('span', {}, h('i', { class: 'l-ok' }), getLang() === 'uz' ? 'Yetarli' : 'Достаточно'),
      h('span', {}, h('i', { class: 'l-low' }), getLang() === 'uz' ? 'Kam qoldi' : 'Мало'),
      h('span', {}, h('i', { class: 'l-over' }), getLang() === 'uz' ? 'Manfiy' : 'Отрицательный'),
      h('span', {}, h('i', { class: 'l-multi' }), getLang() === 'uz' ? 'Bir nechta SKU' : 'Несколько SKU')
    );
  }

  // ---------------- "joy tanlash" rejimi (billet uslubi)
  function startPick() {
    pickMode = true;
    onPick = {
      selected: new Set(),
      toggle(cell) {
        if (onPick.selected.has(cell.id)) onPick.selected.delete(cell.id);
        else onPick.selected.add(cell.id);
        load();
      },
    };
    document.body.classList.add('pick-mode');
    toast(getLang() === 'uz' ? 'Joylarni bosing, keyin «Tayyor»' : 'Нажмите места, затем «Готово»', 'info');
    const bar = h('div', { class: 'alert alert-info', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
      h('span', { id: 'pickCount', text: getLang() === 'uz' ? 'Tanlangan joylar: 0' : 'Выбрано мест: 0' }),
      h('div', { class: 'btn-row' },
        btn(getLang() === 'uz' ? 'Bo‘shlarni tanlash' : 'Выбрать свободные', { cls: 'btn-sm',
          onClick: () => {
            document.querySelectorAll('.seat.empty').forEach((el) => el.click());
          } }),
        btn(getLang() === 'uz' ? 'Bekor qilish' : 'Отмена', { cls: 'btn-sm', onClick: stopPick }),
        btn(getLang() === 'uz' ? 'Tayyor' : 'Готово', { cls: 'btn-sm btn-primary', onClick: stopPick })));
    root.insertBefore(bar, root.children[1]);
    // hisobni yangilash
    const upd = () => {
      const c = bar.querySelector('#pickCount');
      if (c) c.textContent = (getLang() === 'uz' ? 'Tanlangan joylar: ' : 'Выбрано мест: ') + onPick.selected.size;
    };
    bar.addEventListener('click', () => setTimeout(upd, 0));
  }
  function stopPick() {
    pickMode = false;
    onPick = null;
    document.body.classList.remove('pick-mode');
    const bar = root.querySelector('.alert-info');
    if (bar && bar.parentElement === root) bar.remove();
    load();
  }

  // ---------------- skelet qurish
  function buildDialog() {
    const zones = h('input', { type: 'text', value: 'A,B,C' });
    const rows = h('input', { type: 'number', value: 4, min: 1, max: 20 });
    const levels = h('input', { type: 'number', value: 2, min: 1, max: 6 });
    const slots = h('input', { type: 'number', value: 10, min: 1, max: 40 });
    const m = modal({
      title: getLang() === 'uz' ? '2D skelet qurish' : 'Построить каркас 2D',
      width: 520,
      body: h('div', {},
        h('div', { class: 'alert alert-info', text: getLang() === 'uz'
          ? 'Zona → qator → qavat → joy. Masalan A,B,C / 4 qator / 2 qavat / 10 joy = 240 katak.'
          : 'Зона → ряд → ярус → место. Например A,B,C / 4 ряда / 2 яруса / 10 мест = 240 ячеек.' }),
        h('div', { class: 'form-grid' },
          f2(getLang() === 'uz' ? 'Zonalar' : 'Зоны', zones),
          f2(getLang() === 'uz' ? 'Qatorlar' : 'Ряды', rows),
          f2(getLang() === 'uz' ? 'Qavatlar' : 'Ярусы', levels),
          f2(getLang() === 'uz' ? 'Qator uzunligi' : 'Длина ряда', slots))),
      actions: (close) => [
        btn(t('cancel'), { onClick: close }),
        btn(getLang() === 'uz' ? 'Qurish' : 'Построить', { cls: 'btn-primary', onClick: async () => {
          try {
            const r = await api.post('/api/warehouse/map/build', {
              warehouse_id: state.warehouse_id,
              zones: zones.value, rows: rows.value, levels: levels.value, slots: slots.value,
            });
            toast(`${r.total} ${getLang() === 'uz' ? 'joy yaratildi' : 'мест создано'} (${r.created} yangi)`);
            m.close(); load();
          } catch (e) { toast(e.message, 'err'); }
        } }),
      ],
    });
  }

  function fld(label, input) {
    return h('div', { class: 'fb-field' }, h('label', { text: label }), input);
  }
  function f2(label, input) {
    return h('div', { class: 'form-field' }, h('label', { text: label }), input);
  }
  function kv(k, v) {
    return h('div', { class: 'd-row' }, h('span', { text: k }), h('span', { text: String(v) }));
  }

  // boshlang'ich
  await load();
  await fillTiles().catch(() => {});
}

function deb(fn, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }
