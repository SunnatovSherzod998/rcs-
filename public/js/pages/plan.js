/**
 * 2D БИНО РЕЖАСИ / 2D ПЛАН ЗДАНИЯ
 *
 * 1-qavat: xonalar (реальный план)
 * 2-qavat: xona ichidagi stellajlar -> kataklar
 * 3-qavat: tovar kartasi (rasm bilan)
 */
import { api, auth, getWarehouseFilter, setWarehouseFilter } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import {
  h, card, kpi, pageHead, btn, iconBtn, modal, dataTable, toast, spinner,
  money, num, qtyFmt, fmtDate, confirmDialog,
} from '../ui.js';
import { optsWarehouses } from './journal.js';
import { go } from '../app.js';
import { productThumb, productIcon, KIND_LABELS } from './pcard.js';

export async function planPage(root, roomId) {
  const whs = await optsWarehouses();
  const state = {
    warehouse_id: Number(getWarehouseFilter()) || whs[0].id,
    room_id: roomId ? Number(roomId) : null,
    rack_id: null,
    kind: '', q: '', only_occupied: false,
    brand_id: '', category_id: '',
  };
  const kinds = (await api.get('/api/plan/kinds')).kinds;

  root.replaceChildren();
  root.append(pageHead(
    getLang() === 'uz' ? '2D bino rejasi' : '2D план здания',
    getLang() === 'uz' ? 'Xona → stellaj → joy → tovar' : 'Комната → стеллаж → место → товар',
    btn(t('refresh'), { icon: '↻', onClick: () => load() }),
    auth.can('documents.write') ? btn(getLang() === 'uz' ? 'Avtomatik joylash' : 'Разместить', {
      icon: '⚡', onClick: () => autoPlace(),
    }) : null,
    auth.can('catalogs.write') ? btn(getLang() === 'uz' ? 'Reja qurish' : 'Построить план', {
      icon: '▦', onClick: () => buildDialog(),
    }) : null
  ));

  // ---------------- filtr
  const fWh = h('select', { onchange: (e) => { state.warehouse_id = Number(e.target.value); setWarehouseFilter(e.target.value); state.room_id = null; state.rack_id = null; load(); } },
    ...whs.map((w) => h('option', { value: w.id, selected: Number(w.id) === state.warehouse_id, text: fn(w, 'name_uz', 'name_ru') })));
  const fKind = h('select', { onchange: (e) => { state.kind = e.target.value; load(); } },
    h('option', { value: '', text: getLang() === 'uz' ? 'Xona turi: hammasi' : 'Тип комнаты: все' }),
    ...kinds.map((k) => h('option', { value: k.value, text: getLang() === 'uz' ? k.label.uz : k.label.ru })));
  const fQ = h('input', { type: 'search', placeholder: 'Xona / SKU / nomi',
    oninput: deb((e) => { state.q = e.target.value; load(); }, 300) });
  const fBrand = h('select', { onchange: (e) => { state.brand_id = e.target.value; load(); } },
    h('option', { value: '', text: t('m_brands') + ': ' + t('all') }),
    ...(await api.get('/api/catalogs/brands/options', { limit: 500 })).map((b) =>
      h('option', { value: b.id, text: fn(b, 'name_uz', 'name_ru') })));
  const fCat = h('select', { onchange: (e) => { state.category_id = e.target.value; load(); } },
    h('option', { value: '', text: t('m_categories') + ': ' + t('all') }),
    ...(await api.get('/api/catalogs/categories/options', { limit: 500 })).map((c) =>
      h('option', { value: c.id, text: fn(c, 'name_uz', 'name_ru') })));
  const fOcc = h('input', { type: 'checkbox', onchange: (e) => { state.only_occupied = e.target.checked; load(); } });

  const kpiBox = h('div', { class: 'kpi-row' });
  const main = h('div', {});
  root.append(card(null, h('div', { class: 'wh-toolbar' },
    fld(getLang() === 'uz' ? 'Ombor' : 'Склад', fWh),
    fld(getLang() === 'uz' ? 'Xona turi' : 'Тип комнаты', fKind),
    fld(getLang() === 'uz' ? 'Brend' : 'Бренд', fBrand),
    fld(getLang() === 'uz' ? 'Tur' : 'Категория', fCat),
    fld(getLang() === 'uz' ? 'Qidirish' : 'Поиск', fQ),
    h('label', { class: 'fb-field', style: { flexDirection: 'row', alignItems: 'center', gap: '5px' } },
      fOcc, h('span', { style: { fontSize: '12px' }, text: getLang() === 'uz' ? 'Faqat to‘langan' : 'Только занятые' })),
    h('button', { class: 'btn', text: t('reset'), onClick: () => {
      Object.assign(state, { kind: '', q: '', brand_id: '', category_id: '', only_occupied: false, room_id: null });
      fKind.value = ''; fBrand.value = ''; fCat.value = ''; fQ.value = ''; fOcc.checked = false;
      load();
    } })
  )));
  root.append(kpiBox);
  root.append(main);

  // ==================================================== 1-QAVAT: XONALAR
  async function load() {
    main.replaceChildren(spinner());

    const d = await api.get('/api/plan/rooms', {
      warehouse_id: state.warehouse_id, kind: state.kind, q: state.q,
    });

    kpiBox.replaceChildren(
      kpi(getLang() === 'uz' ? 'Xonalar' : 'Комнат', num(d.summary.rooms),
        `${d.summary.racks} ${getLang() === 'uz' ? 'stellaj' : 'стеллаж'}`, 'ok'),
      kpi(getLang() === 'uz' ? 'Kataklar' : 'Ячеек', num(d.summary.cells),
        `${d.summary.used_cells} ${getLang() === 'uz' ? 'band' : 'занято'}`),
      kpi(getLang() === 'uz' ? 'Bandlik' : 'Заполненность', d.summary.fill_rate + '%',
        null, d.summary.fill_rate > 85 ? 'err' : d.summary.fill_rate > 60 ? 'warn' : 'ok'),
      kpi(getLang() === 'uz' ? 'Tovarlar' : 'Товаров', qtyFmt(d.summary.qty),
        d.summary.qty ? '' : getLang() === 'uz' ? 'xona ichida yo‘q' : 'в комнатах нет'),
      kpi(t('amount'), money(d.summary.amount) + ' UZS', '', 'ok')
    );

    if (!d.rooms.length) {
      main.append(card(null, h('div', { class: 'alert alert-warn' },
        getLang() === 'uz'
          ? 'Bu ombor uchun bino rejasi qurilmagan. «Reja qurish» tugmasini bosing.'
          : 'Для этого склада план здания не построен. Нажмите «Построить план».')));
      return;
    }

    // reja to'ri: har bir qator oxirida koridor
    const grid = h('div', { class: 'building-grid' });
    grid.style.gridTemplateColumns = `repeat(${d.grid.cols}, minmax(120px, 1fr))`;

    let lastY = null;
    for (const r of d.rooms) {
      if (lastY !== null && r.pos_y !== lastY) {
        grid.append(h('div', { class: 'corridor', style: { gridColumn: '1 / -1' },
          text: getLang() === 'uz' ? 'ko‘cha / проход' : '' }));
      }
      lastY = r.pos_y;
      grid.append(roomTile(r));
    }

    main.append(card(
      getLang() === 'uz' ? 'Ombor rejasi (1-qavat)' : 'План склада (1 этаж)',
      h('div', { class: 'building' }, grid),
      legend()
    ));

    // Tanlangan xona -> pastga stellajlar, tanlangan stellaj -> pastga qatorlar/yacheykalar
    if (state.room_id) await expandRoom();
  }

  async function expandRoom() {
    const d = await api.get('/api/plan/room', {
      room_id: state.room_id,
      only_occupied: state.only_occupied ? 1 : 0,
      brand_id: state.brand_id, category_id: state.category_id, q: state.q,
    });

    const grid = h('div', { class: 'racks' });
    for (const k of d.racks) {
      const used = k.levels.reduce((s, l) => s + l.cells.filter((c) => c.items?.length).length, 0);
      const total = k.levels.reduce((s, l) => s + l.cells.length, 0);
      grid.append(h('div', {
        class: 'rack', style: { cursor: 'pointer', outline: state.rack_id === k.id ? '2px solid var(--accent)' : '' },
        onclick: () => { state.rack_id = state.rack_id === k.id ? null : k.id; load(); },
      },
        h('div', { class: 'rack-head' },
          h('span', { class: 'code', text: k.code }),
          h('span', { text: `${used} / ${total} · ${qtyFmt(k.qty)} ${t('qty').toLowerCase()}` })),
        h('div', { class: 'dim', style: { padding: '6px 10px', fontSize: '12px' },
          text: `${k.levels.length} ${getLang() === 'uz' ? 'qator' : 'рядов'} · ${total} ${getLang() === 'uz' ? 'yacheyka' : 'ячеек'}` })));
    }
    if (!d.racks.length) {
      grid.append(h('div', { class: 'alert alert-info', text: getLang() === 'uz'
        ? 'Bu xonada stellajlar yo‘q' : 'В этой комнате нет стеллажей' }));
    }

    main.append(card(
      `${getLang() === 'uz' ? 'Xona' : 'Комната'} ${d.room.code} · ${getLang() === 'uz' ? 'Stellajlar' : 'Стеллажи'}`,
      grid));

    const selRack = state.rack_id ? d.racks.find((k) => k.id === state.rack_id) : null;
    if (selRack) {
      const racks = h('div', { class: 'racks' });
      for (const lv of selRack.levels) {
        racks.append(h('div', { class: 'shelf' },
          h('div', { class: 'shelf-lbl' },
            h('b', { text: (getLang() === 'uz' ? 'Qator ' : 'Ряд ') + lv.level })),
          h('div', { class: 'shelf-cells' }, ...lv.cells.map((c) => cellBox(c)))));
      }
      main.append(card(
        `${getLang() === 'uz' ? 'Stellaj' : 'Стеллаж'} ${selRack.code} · ${getLang() === 'uz' ? 'Qatorlar → Yacheykalar' : 'Ряды → Ячейки'}`,
        racks));
    }
  }

  function roomTile(r) {
    const fill = r.cells ? Math.round((r.used_cells || 0) / r.cells * 100) : 0;
    const kindLabel = KIND_LABELS[r.kind] || { uz: r.kind, ru: r.kind };
    // mini ko'rinish: kataklar (band = yashil)
    const dots = [];
    const total = Math.min(r.cells || 0, 40);
    for (let i = 0; i < total; i++) {
      dots.push(h('i', { class: i < Math.round((r.used_cells || 0) / (r.cells || 1) * total) ? 'on' : '' }));
    }
    return h('div', {
      class: 'room room-' + r.kind + (state.room_id === r.id ? ' sel' : ''),
      style: { gridColumn: 'span ' + (r.width || 2) },
      title: getLang() === 'uz' ? r.name_uz : r.name_ru,
      onclick: () => {
        if (state.room_id === r.id) { state.room_id = null; state.rack_id = null; location.hash = 'plan'; }
        else { state.room_id = r.id; state.rack_id = null; location.hash = 'plan/room/' + r.id; }
        load();
      },
    },
      h('div', { class: 'room-head' },
        h('span', { class: 'rn', text: r.code.split('-').pop() }),
        h('span', { text: getLang() === 'uz' ? kindLabel.uz : kindLabel.ru })),
      h('div', { class: 'room-body' },
        h('div', { class: 'rd' }, h('span', { text: 'SKU' }), h('span', { text: num(r.products) })),
        h('div', { class: 'rd' }, h('span', { text: t('qty') }), h('span', { text: qtyFmt(r.qty) })),
        h('div', { class: 'room-fill' }, h('i', {
          style: { width: fill + '%', background: fill > 85 ? 'var(--err)' : fill > 60 ? 'var(--warn)' : 'var(--ok)' },
        })),
        h('div', { class: 'room-mini' }, ...dots),
        r.temperature ? h('div', { class: 'rd' },
          h('span', { text: 'Temp' }), h('span', { text: r.temperature + '°C' })) : null
      ));
  }

  // ==================================================== 2-QAVAT: XONA ICHI
  async function loadRoom() {
    const d = await api.get('/api/plan/room', {
      room_id: state.room_id,
      only_occupied: state.only_occupied ? 1 : 0,
      brand_id: state.brand_id, category_id: state.category_id, q: state.q,
    });

    kpiBox.replaceChildren(
      kpi(getLang() === 'uz' ? 'Xona' : 'Комната', d.room.code,
        getLang() === 'uz' ? (d.room.name_uz) : d.room.name_ru, 'ok'),
      kpi(getLang() === 'uz' ? 'Stellajlar' : 'Стеллажей', num(d.summary.racks)),
      kpi(getLang() === 'uz' ? 'Band katak' : 'Занято ячеек', `${d.summary.used} / ${d.summary.cells}`),
      kpi('SKU', num(d.summary.products)),
      kpi(t('qty'), qtyFmt(d.summary.qty)),
      kpi(t('amount'), money(d.summary.amount) + ' UZS', '', 'ok')
    );

    // nonus
    const crumb = h('div', { class: 'crumb' },
      h('a', { onclick: () => { state.room_id = null; state.rack_id = null; location.hash = 'plan'; load(); },
               text: fn(d.warehouse, 'name_uz', 'name_ru') }),
      h('span', { class: 'sep', text: '›' }),
      state.rack_id
        ? h('a', { onclick: () => { state.rack_id = null; loadRoom(); }, text: d.room.code })
        : h('span', { class: 'cur', text: d.room.code }),
      state.rack_id ? h('span', { class: 'sep', text: '›' }) : null,
      state.rack_id ? h('span', { class: 'cur', text: d.racks.find((k) => k.id === state.rack_id)?.code || '' }) : null,
      h('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' },
        onclick: () => autoPlaceRoom(d.room.id),
        text: '⚡ ' + (getLang() === 'uz' ? 'Joylash' : 'Разместить') }));

    const selRack = state.rack_id ? d.racks.find((k) => k.id === state.rack_id) : null;

    // ---------- STELLAJ TANLANMAGAN: stellajlar ro'yxati
    if (!state.rack_id) {
      const grid = h('div', { class: 'racks' });
      for (const k of d.racks) {
        const used = k.levels.reduce((s, l) => s + l.cells.filter((c) => c.items?.length).length, 0);
        const total = k.levels.reduce((s, l) => s + l.cells.length, 0);
        grid.append(h('div', { class: 'rack', style: { cursor: 'pointer' },
          onclick: () => { state.rack_id = k.id; loadRoom(); } },
          h('div', { class: 'rack-head' },
            h('span', { class: 'code', text: k.code }),
            h('span', { text: `${used} / ${total} · ${qtyFmt(k.qty)} ${t('qty').toLowerCase()}` })),
          h('div', { class: 'dim', style: { padding: '6px 10px', fontSize: '12px' },
            text: `${k.levels.length} ${getLang() === 'uz' ? 'qator' : 'рядов'} · ${total} ${getLang() === 'uz' ? 'yacheyka' : 'ячеек'}` })));
      }
      if (!d.racks.length) {
        grid.append(h('div', { class: 'alert alert-info', text: getLang() === 'uz'
          ? 'Bu xonada stellajlar yo‘q' : 'В этой комнате нет стеллажей' }));
      }
      main.replaceChildren(
        crumb,
        h('div', { class: 'room-view' },
          card(getLang() === 'uz' ? 'Stellajlar' : 'Стеллажи', grid),
          h('div', {},
            card(getLang() === 'uz' ? 'Xona haqida' : 'О комнате', roomInfo(d)),
            legend())
        )
      );
      return;
    }

    // ---------- STELLAJ BOSILGAN: qatorlar -> yacheykalar
    const racks = h('div', { class: 'racks' });
    if (selRack) {
      for (const lv of selRack.levels) {
        racks.append(h('div', { class: 'shelf' },
          h('div', { class: 'shelf-lbl' },
            h('b', { text: (getLang() === 'uz' ? 'Qator ' : 'Ряд ') + lv.level })),
          h('div', { class: 'shelf-cells' }, ...lv.cells.map((c) => cellBox(c)))));
      }
    }
    main.replaceChildren(
      crumb,
      h('div', { class: 'room-view' },
        card((getLang() === 'uz' ? 'Stellaj ' : 'Стеллаж ') + (selRack?.code || '') +
          ' · ' + (getLang() === 'uz' ? 'qatorlar' : 'ряды'), racks),
        h('div', {},
          card(getLang() === 'uz' ? 'Xona haqida' : 'О комнате', roomInfo(d)),
          legend())
      )
    );
  }

  function roomInfo(d) {
    return h('dl', { class: 'kv' },
      h('dt', { text: getLang() === 'uz' ? 'Kod' : 'Код' }), h('dd', { class: 'mono', text: d.room.code }),
      h('dt', { text: getLang() === 'uz' ? 'Tur' : 'Тип' }), h('dd', { text: (KIND_LABELS[d.room.kind] ? (getLang() === 'uz' ? KIND_LABELS[d.room.kind].uz : KIND_LABELS[d.room.kind].ru) : d.room.kind) }),
      h('dt', { text: getLang() === 'uz' ? 'Qavat' : 'Этаж' }), h('dd', { text: d.room.floor }),
      h('dt', { text: getLang() === 'uz' ? 'Stellaj' : 'Стеллажей' }), h('dd', { text: d.summary.racks }),
      h('dt', { text: getLang() === 'uz' ? 'Katak' : 'Ячеек' }), h('dd', { text: d.summary.cells }),
      d.room.temperature ? h('dt', { text: 'Temp' }) : null,
      d.room.temperature ? h('dd', { text: d.room.temperature + ' °C' }) : null);
  }

  function cellBox(c) {
    const items = c.items || [];
    const first = items[0];
    if (!items.length) {
      return h('div', { class: 'cell empty', title: c.code + ' — ' + (getLang() === 'uz' ? 'bo‘sh' : 'свободно') },
        h('div', { class: 'c-img', text: '·' }),
        h('div', { class: 'c-sku', text: c.code.split('-').slice(-1)[0] }),
        h('div', { class: 'c-qty', text: '' }));
    }
    let cls = 'cell';
    if (items.length > 1) cls += ' multi';
    else if (c.capacity > 0 && c.qty >= c.capacity) cls += ' ok';
    else if (c.qty <= (first.min_stock || 0)) cls += ' low';
    if (c.qty < 0) cls += ' over';

    return h('div', {
      class: cls,
      title: c.code + '\n' + items.map((i) => `${i.sku} ${getLang() === 'uz' ? (i.name_uz || i.name_ru) : i.name_ru} — ${qtyFmt(i.qty)} ${i.unit_code || ''}`).join('\n'),
      onclick: () => openCell(c, items),
    },
      h('div', { class: 'c-img' },
        first.image_url
          ? h('img', { src: first.image_url, alt: first.sku, loading: 'lazy' })
          : h('span', { text: productIcon(first.category) }),
        items.length > 1 ? h('span', { class: 'c-badge', text: items.length + ' SKU' }) : null),
      h('div', { class: 'c-sku', text: first.sku }),
      h('div', { class: 'c-qty', text: qtyFmt(c.qty) })
    );
  }

  // ==================================================== 3-QAVAT: KATAK ICHI
  function openCell(cell, items) {
    const body = h('div', {});
    const m = modal({
      title: cell.code + ' · ' + (getLang() === 'uz' ? 'joy mazmuni' : 'содержимое места'),
      width: 780,
      body,
      actions: (close) => [
        btn(getLang() === 'uz' ? 'Kirim qilish' : 'Приход', { icon: '＋', onClick: () => {
          close(); location.hash = 'doc/new/RECEIPT';
        } }),
        btn(t('close'), { onClick: close }),
      ],
    });

    body.append(h('div', { class: 'alert alert-info' },
      h('b', { text: cell.code }),
      `  ·  ${cell.qty} ${getLang() === 'uz' ? 'dona' : 'шт'}  ·  ${money(cell.amount)} UZS` +
      (cell.capacity > 0 ? `  ·  ${getLang() === 'uz' ? 'sig‘im' : 'ёмкость'}: ${cell.capacity}` : '')
    ));

    const list = h('div', {});
    // tovarlar kategoriyalarga bo'linadi
    const byCat = new Map();
    for (const it of items) {
      const key = it.category || (getLang() === 'uz' ? 'Kategoriyasiz' : 'Без категории');
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(it);
    }
    for (const [cat, arr] of byCat) {
      if (byCat.size > 1) {
        list.append(h('div', { class: 'card-head', style: { position: 'sticky', top: 0, zIndex: 1 },
          text: cat + ' · ' + arr.length }));
      }
      for (const it of arr) {
        const row = h('div', { class: 'place-item', onclick: () => showProduct(it.product_id) },
          h('div', { class: 'p-img' },
            it.image_url ? h('img', { src: it.image_url, alt: '' }) : h('span', { text: productIcon(it.category) })),
          h('div', { class: 'p-txt' },
            h('b', { class: 'mono', text: it.sku }), ' ',
            h('span', { text: getLang() === 'uz' ? (it.name_uz || it.name_ru) : (it.name_ru || it.name_uz) }),
            h('div', { class: 'dim', style: { fontSize: '11.5px' },
              text: [it.brand, it.category, it.unit_code].filter(Boolean).join(' · ') })),
          h('div', { class: 'p-qty', text: qtyFmt(it.qty) + ' ' + (it.unit_code || '') }));
        list.append(row);
      }
    }
    body.append(list);
  }

  // ==================================================== TOVAR KARTASI (rasm bilan)
  async function showProduct(productId) {
    const d = await api.get('/api/plan/product', { product_id: productId });
    const p = d.product;
    const tt = d.totals;

    modal({
      title: p.sku + ' · ' + (getLang() === 'uz' ? 'tovar kartasi' : 'карточка товара'),
      width: 980,
      body: h('div', { class: 'pcard' },
        h('div', {},
          h('div', { class: 'pcard-img', style: p.image_url ? { backgroundImage: `url(${p.image_url})` } : null },
            p.image_url ? null : h('span', { class: 'noimg', text: productIcon(p.category) })),
          h('div', { style: { marginTop: '9px' } },
            p.barcode ? h('div', { class: 'pcard-sku', text: 'Barcode: ' + p.barcode }) : null,
            p.account ? h('div', { class: 'pcard-sku', text: (getLang() === 'uz' ? 'Hisob' : 'Счёт') + ': ' + p.account }) : null)),

        h('div', {},
          h('h2', { class: 'pcard-title', text: getLang() === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz) }),
          h('div', { class: 'pcard-sku', text: 'SKU: ' + p.sku }),
          h('div', { class: 'pcard-badges' },
            p.brand ? h('span', { class: 'badge b-blue', text: '★ ' + fn(p, 'brand_uz', 'brand') }) : null,
            p.category ? h('span', { class: 'badge b-gray', text: fn(p, 'category_uz', 'category') }) : null,
            p.unit_code ? h('span', { class: 'badge b-gray', text: getLang() === 'uz' ? 'O‘lchov: ' : 'Ед.: ' + p.unit_code }) : null,
            p.country ? h('span', { class: 'badge b-gray', text: p.country }) : null,
            p.is_service ? h('span', { class: 'badge b-orange', text: getLang() === 'uz' ? 'Xizmat' : 'Услуга' }) : null),

          h('div', { class: 'pcard-kpi' },
            kk(t('qty'), qtyFmt(tt.qty)),
            kk(getLang() === 'uz' ? 'Qiymati' : 'Стоимость', money(tt.amount) + ' UZS'),
            kk(getLang() === 'uz' ? 'O‘rt. tannarx' : 'Средняя себ.', money(tt.avg_cost)),
            kk(getLang() === 'uz' ? 'Sotish' : 'Цена', money(p.sale_price) + (p.currency ? ' ' + p.currency : '')),
            kk(getLang() === 'uz' ? 'Potensial foyda' : 'Потенц. прибыль', money(tt.potential_profit) + ' UZS',
              tt.potential_profit >= 0 ? 'pos' : 'neg'),
            kk(getLang() === 'uz' ? 'Joylar' : 'Мест', num(tt.locations))),

          d.by_warehouse.length > 1 ? h('div', { style: { marginTop: '10px' } },
            h('div', { class: 'card-head', style: { borderRadius: '4px 4px 0 0' },
              text: getLang() === 'uz' ? 'Omborlar kesimida' : 'По складам' }),
            dataTable({
              rows: d.by_warehouse,
              columns: [
                { key: 'code', title: getLang() === 'uz' ? 'Ombor' : 'Склад', render: (r) => fn(r, 'name_uz', 'name_ru') },
                { key: 'qty', title: t('qty'), align: 'right', render: (r) => qtyFmt(r.qty) },
                { key: 'amount', title: t('amount'), align: 'right', render: (r) => money(r.amount) },
                { key: 'share', title: '%', align: 'right', render: (r) =>
                  h('div', {}, h('div', { text: Math.round(r.qty / tt.qty * 100) + '%' }),
                    h('div', { class: 'fill-bar' }, h('i', { style: { width: (r.qty / tt.qty * 100) + '%' } }))) },
              ],
            })) : null,

          d.placement.length ? h('div', { style: { marginTop: '10px' } },
            h('div', { class: 'card-head', style: { borderRadius: '4px 4px 0 0' },
              text: getLang() === 'uz' ? 'Qayerda joylashgan' : 'Где размещён' }),
            h('div', { style: { maxHeight: '210px', overflow: 'auto', padding: '7px' } },
              ...d.placement.map((pl) => h('div', { class: 'place-item', style: { cursor: pl.room_id ? 'pointer' : 'default' },
                onclick: pl.room_id ? () => { document.querySelectorAll('.modal-overlay').forEach((o) => o.remove()); state.room_id = pl.room_id; location.hash = 'plan/room/' + pl.room_id; load(); } : null },
                h('div', { class: 'p-img', text: '📍' }),
                h('div', { class: 'p-txt' },
                  h('b', { text: pl.warehouse_code + (pl.room_code ? ' / ' + pl.room_code : '') }),
                  h('div', { class: 'dim', style: { fontSize: '11.5px' },
                    text: pl.rack_code
                      ? `${pl.rack_code} · ${getLang() === 'uz' ? 'qavat ' + pl.level_no + ' · joy ' + pl.pos : 'ярус ' + pl.level_no + ' · место ' + pl.pos}`
                      : (getLang() === 'uz' ? 'joylashmagan' : 'без места') })),
                h('div', { class: 'p-qty', text: qtyFmt(pl.qty) }))))) : null
        )
      ),
      actions: (close) => [
        btn(t('print'), { icon: '🖨', onClick: () => window.print() }),
        auth.can('catalogs.write') ? btn(t('edit'), { icon: '✎', onClick: () => { close(); go('cat/products'); } }) : null,
        btn(t('close'), { cls: 'btn-primary', onClick: close }),
      ],
    });
  }

  function kk(label, value, cls) {
    return h('div', { class: 'k' },
      h('div', { class: 'l', text: label }),
      h('div', { class: 'v ' + (cls || ''), text: value }));
  }

  // ---------------- avtomatik joylash
  async function autoPlace() {
    if (state.room_id) return autoPlaceRoom(state.room_id);
    try {
      const r = await api.post('/api/plan/warehouse/auto-place', { warehouse_id: state.warehouse_id });
      toast(r.placed
        ? `${r.placed} pozitsiya ${r.rooms_used} ${getLang() === 'uz' ? 'xonaga joylashdi' : 'комнатам'}`
        : (getLang() === 'uz' ? 'Joylash uchun tovar yoki bo‘sh joy yo‘q' : 'Нет товаров или свободных мест'),
        r.placed ? 'ok' : 'info');
      load();
    } catch (e) { toast(e.message, 'err'); }
  }
  async function autoPlaceRoom(rid) {
    try {
      const r = await api.post('/api/plan/room/auto-place', { room_id: rid });
      toast(r.to_place
        ? `${r.to_place} ${getLang() === 'uz' ? 'tovar joylashdi' : 'товаров размещено'}`
        : (getLang() === 'uz' ? 'Joylash uchun tovar yoki bo‘sh joy yo‘q' : 'Нет товаров или свободных мест'));
      load();
    } catch (e) { toast(e.message, 'err'); }
  }

  // ---------------- reja qurish
  function buildDialog() {
    const cols = h('input', { type: 'number', value: 3, min: 1, max: 8 });
    const rooms = h('input', { type: 'number', value: 6, min: 1, max: 40 });
    const racks = h('input', { type: 'number', value: 3, min: 1, max: 12 });
    const levels = h('input', { type: 'number', value: 2, min: 1, max: 6 });
    const slots = h('input', { type: 'number', value: 4, min: 1, max: 20 });
    const m = modal({
      title: getLang() === 'uz' ? 'Bino rejasi qurish' : 'Построить план здания',
      width: 540,
      body: h('div', {},
        h('div', { class: 'alert alert-info', text: getLang() === 'uz'
          ? '3 qator × 2 xona = 6 xona. Har bir xonada 3 stellaj × 2 qavat × 4 joy = 24 katak (jami 144).'
          : '3 ряда × 2 комнаты = 6 комнат. В каждой 3 стеллажа × 2 яруса × 4 места = 24 ячейки (всего 144).' }),
        h('div', { class: 'form-grid' },
          f2(getLang() === 'uz' ? 'Ustunlar' : 'Столбцов', cols),
          f2(getLang() === 'uz' ? 'Xonalar' : 'Комнат', rooms),
          f2(getLang() === 'uz' ? 'Stellaj / xona' : 'Стеллажей / комнату', racks),
          f2(getLang() === 'uz' ? 'Qavatlar' : 'Ярусов', levels),
          f2(getLang() === 'uz' ? 'Joy / qator' : 'Мест / ряд', slots))),
      actions: (close) => [
        btn(t('cancel'), { onClick: close }),
        btn(getLang() === 'uz' ? 'Qurish' : 'Построить', { cls: 'btn-primary', onClick: async () => {
          try {
            const r = await api.post('/api/plan/build', {
              warehouse_id: state.warehouse_id, cols: cols.value, rooms: rooms.value,
              racks_per_room: racks.value, levels: levels.value, slots: slots.value,
            });
            toast(`${r.rooms} xona, ${r.racks} stellaj, ${r.cells} katak`);
            m.close(); load();
          } catch (e) { toast(e.message, 'err'); }
        } }),
      ],
    });
  }

  function legend() {
    return h('div', { class: 'wh-legend' },
      h('span', {}, h('i', { class: 'l-empty' }), getLang() === 'uz' ? 'Bo‘sh joy' : 'Свободно'),
      h('span', {}, h('i', { class: 'l-ok' }), getLang() === 'uz' ? 'Yetarli' : 'Достаточно'),
      h('span', {}, h('i', { class: 'l-low' }), getLang() === 'uz' ? 'Kam qoldi' : 'Мало'),
      h('span', {}, h('i', { class: 'l-over' }), getLang() === 'uz' ? 'Manfiy' : 'Отрицательный'),
      h('span', {}, h('i', { class: 'l-multi' }), getLang() === 'uz' ? 'Bir nechta SKU' : 'Несколько SKU')
    );
  }

  function fld(label, input) {
    return h('div', { class: 'fb-field' }, h('label', { text: label }), input);
  }
  function f2(label, input) {
    return h('div', { class: 'form-field' }, h('label', { text: label }), input);
  }

  await load();
}

function deb(fn, ms) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }
