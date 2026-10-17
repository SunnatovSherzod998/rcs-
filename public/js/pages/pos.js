/**
 * POS / СОТУВ (Продажа) — kassa uchun tezkor sotuv oynasi.
 *
 * Skaner yoki SKU bo‘yicha tovar qidiriladi → savatga qo‘shiladi →
 * to‘lov turi (naqd / karta / naxa) tanlanadi → «Sotish» bosilganda
 * ISSUE/SALE hujjati yaratilib avtomatik проведение qilinadi.
 */
import { api, getWarehouseFilter } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import {
  h, card, pageHead, btn, dataTable, modal, toast, spinner,
  money, qtyFmt, today,
} from '../ui.js';
import { productThumb } from './pcard.js';

const PAYMENTS = {
  CASH:   { uz: 'Naqd',       ru: 'Наличные' },
  CARD:   { uz: 'Karta',      ru: 'Карта' },
  CREDIT: { uz: 'Naxa (qarz)', ru: 'В долг (заём)' },
};

export async function posPage(root) {
  const uz = () => getLang() === 'uz';
  const whs = (await api.get('/api/catalogs/warehouses/options', { limit: 500 })) || [];
  const state = {
    warehouse_id: Number(getWarehouseFilter()) || (whs[0] && whs[0].id) || 0,
    payment: 'CASH',
    counterparty_id: null,
    q: '',
    cart: [],          // [{ product, qty, price }]
    result: null,      // oxirgi chek
  };

  const cps = (await api.get('/api/catalogs/counterparties/options', { limit: 1000 })) || [];
  const customers = cps.filter((c) => String(c.code).startsWith('CUS'));

  root.replaceChildren();
  root.append(pageHead(
    uz() ? 'Tovarlarni sotish' : 'Продажа товаров',
    uz() ? 'Skaner / SKU bo‘yicha qidiring · Enter — savatga qo‘shish'
         : 'Поиск по сканеру / артикулу · Enter — в корзину',
    btn(t('refresh'), { icon: '↻', onClick: () => load() }),
  ));

  // -------------------------------------------------------------- layout
  const leftBox = h('div', {});
  const rightBox = h('div', {});
  const grid = h('div', { class: 'pos-grid' },
    h('div', {}, leftBox),
    h('div', {}, rightBox));
  root.append(grid);

  // ---- qidiruv + podskazka
  const fSearch = h('input', { class: 'pos-scan', type: 'search', autocomplete: 'off',
    placeholder: uz() ? 'Skaner / SKU / nomi…' : 'Сканер / артикул / название…' });
  const selWh = h('select', { class: 'pos-sel' },
    ...whs.map((w) => h('option', { value: w.id, text: fn(w, 'name_uz', 'name_ru') })));
  selWh.value = String(state.warehouse_id);
  selWh.addEventListener('change', () => { state.warehouse_id = Number(selWh.value); load(); });

  // podskazka ro'yxati (bosh xarflariga mos kelsa)
  const suggestBox = h('div', { class: 'pos-suggest', hidden: true });
  let sugItems = [];
  let sugIdx = -1;

  const searchWrap = h('div', { class: 'pos-search-main' }, fSearch, suggestBox);

  // .card overflow:hidden — podskazka karta chegarasidan chiqib turishi uchun
  const searchCard = card(null, h('div', { class: 'pos-search' },
    searchWrap,
    h('div', { class: 'pos-search-side' }, selWh)));
  searchCard.style.overflow = 'visible';
  leftBox.append(searchCard);

  const foundBox = h('div', { style: { marginTop: '10px' } });
  leftBox.append(foundBox);

  // ---- savat
  const cartBox = h('div', { class: 'pos-cart' });
  rightBox.append(card(null, h('div', {},
    h('div', { class: 'card-head', style: { cursor: 'default' } },
      h('b', { text: uz() ? 'Savat' : 'Корзина' }),
      h('span', { id: 'posCount', class: 'dim', style: { marginLeft: '10px' } })),
    cartBox)));

  // ---- to'lov + sotish
  const payBox = h('div', { class: 'pos-pay' });
  rightBox.append(card(null, payBox));

  // ---- bugungi sotuvlar
  const recentBox = h('div', {});
  leftBox.append(recentBox);

  // -------------------------------------------------------------- data
  let stock = new Map();   // product_id -> { qty, sale_price, ... }
  let catalog = [];        // butun nomenklatura (podskazka uchun)

  /**
   * Bosh xarflariga moslik reytingi:
   *   0 — SKU boshlanadi,  1 — barcode boshlanadi,  2 — nom boshlanadi,
   *   3/4/5 — ichida uchramoq
   */
  function scoreProduct(p, q) {
    const sku = String(p.sku || '').toLowerCase();
    const bc = String(p.barcode || '').toLowerCase();
    const nm = String(p.name_uz || '') .toLowerCase() + ' ' + String(p.name_ru || '').toLowerCase();
    if (sku.startsWith(q)) return 0;
    if (bc && bc.startsWith(q)) return 1;
    if (nm.trim().startsWith(q) || (' ' + nm).includes(' ' + q)) return 2;
    if (sku.includes(q)) return 3;
    if (bc && bc.includes(q)) return 4;
    if (nm.includes(q)) return 5;
    return -1;
  }

  /** Katalogdagi tovarlarni matn bo'yicha qayta tartibda beradi */
  function suggest(q, limit = 10) {
    const query = String(q || '').trim().toLowerCase();
    if (!query) return [];
    const scored = [];
    for (const p of catalog) {
      const sc = scoreProduct(p, query);
      if (sc >= 0) scored.push({ p, sc });
    }
    scored.sort((a, b) => a.sc - b.sc || String(a.p.sku).localeCompare(String(b.p.sku)));
    return scored.slice(0, limit).map((x) => x.p);
  }

  async function load() {
    foundBox.replaceChildren(spinner());
    const res = await api.get('/api/register/stock/balances/grouped', {
      warehouse_id: state.warehouse_id, only_positive: '1', limit: 2000,
    }).catch(() => []);
    stock = new Map((res || []).map((r) => [r.product_id, r]));
    renderFound();
    renderCart();
    await loadRecent();
  }

  // butun nomenklatura — podskazka uchun (qoldig'i 0 bo'lganlar ham)
  async function loadCatalog() {
    const res = await api.get('/api/catalogs/products', { limit: 5000, offset: 0 }).catch(() => null);
    catalog = (res?.rows || []).filter((p) => p.is_active !== 0 && !p.is_service);
  }

  async function search(q) {
    const query = String(q || '').trim();
    if (!query) return [];
    const res = await api.get('/api/register/stock/balances/grouped', {
      warehouse_id: state.warehouse_id, q: query, only_positive: '1', limit: 40,
    }).catch(() => []);
    return Array.isArray(res) ? res : [];
  }

  // -------------------------------------------------------------- topilganlar
  function renderFound(rows) {
    foundBox.replaceChildren();
    const list = rows || [...stock.values()]
      .filter((r) => !state.q || (r.sku + ' ' + (r.barcode || '') + ' ' + r.name_uz + ' ' + r.name_ru)
        .toLowerCase().includes(state.q.toLowerCase()))
      .slice(0, 60);
    if (!list.length) {
      foundBox.append(h('div', { class: 'alert alert-info',
        text: uz() ? 'Tovar topilmadi' : 'Товар не найден' }));
      return;
    }
    const box = h('div', { class: 'pos-results' });
    for (const r of list) {
      box.append(h('button', { class: 'pos-item', type: 'button', onclick: () => addToCart(r) },
        productThumb(r, { size: 40, cls: 'p-img' }),
        h('div', { class: 'pos-item-txt' },
          h('b', { class: 'mono', text: r.sku }),
          h('div', { class: 'pos-item-name', text: fn(r, 'name_uz', 'name_ru') }),
          h('div', { class: 'dim', style: { fontSize: '11.5px' },
            text: [r.brand, r.category].filter(Boolean).join(' · ') })),
        h('div', { class: 'pos-item-right' },
          h('div', { class: 'pos-price', text: money(r.sale_price) }),
          h('div', { class: 'dim', style: { fontSize: '11.5px' },
            text: uz() ? 'qoldiq: ' + qtyFmt(r.qty) : 'ост: ' + qtyFmt(r.qty) }))));
    }
    foundBox.append(box);
  }

  // -------------------------------------------------------------- podskazka
  function hideSuggest() {
    suggestBox.hidden = true;
    suggestBox.replaceChildren();
    sugItems = [];
    sugIdx = -1;
  }

  function renderSuggest(q) {
    const query = String(q || '').trim();
    sugItems = suggest(query);
    if (!sugItems.length) { hideSuggest(); return; }
    sugIdx = sugItems.length === 1 ? 0 : -1;

    suggestBox.replaceChildren();
    sugItems.forEach((p, i) => {
      const st = stock.get(p.id);
      const qty = st ? Number(st.qty) : 0;
      const price = st?.sale_price ?? p.sale_price ?? 0;
      const row = h('button', {
        class: 'pos-sug-row' + (i === sugIdx ? ' active' : ''), type: 'button',
        onclick: () => pickSuggest(p),
      },
        productThumb(p, { size: 26, cls: 'p-img' }),
        h('div', { class: 'pos-sug-txt' },
          h('b', { class: 'mono', text: p.sku }),
          h('span', { class: 'pos-sug-name', text: fn(p, 'name_uz', 'name_ru') })),
        h('div', { class: 'pos-sug-right' },
          h('span', { class: 'pos-price', text: money(price) }),
          h('span', {
            class: 'pos-sug-qty' + (qty > 0 ? '' : ' none'),
            text: qty > 0 ? qtyFmt(qty) : (uz() ? 'yo‘q' : 'нет'),
          })));
      suggestBox.append(row);
    });
    suggestBox.hidden = false;
  }

  function moveSuggest(delta) {
    if (!sugItems.length) return;
    sugIdx = (sugIdx + delta + sugItems.length) % sugItems.length;
    [...suggestBox.children].forEach((el, i) => el.classList.toggle('active', i === sugIdx));
    const cur = suggestBox.children[sugIdx];
    cur?.scrollIntoView({ block: 'nearest' });
  }

  function pickSuggest(p) {
    const st = stock.get(p.id);
    addToCart({
      product_id: p.id,
      sku: p.sku,
      name: fn(p, 'name_uz', 'name_ru'),
      image_url: p.image_url,
      unit_code: st?.unit_code || '',
      sale_price: st?.sale_price ?? p.sale_price ?? 0,
      qty: st ? Number(st.qty) : 0,
    });
    fSearch.value = '';
    state.q = '';
    hideSuggest();
    renderFound();
    fSearch.focus();
  }

  // -------------------------------------------------------------- savat
  function addToCart(r) {
    if (!r || !r.product_id) return;
    const found = state.cart.find((l) => l.product_id === r.product_id);
    if (found) { found.qty += 1; }
    else {
      state.cart.push({
        product_id: r.product_id, sku: r.sku,
        name: r.name || fn(r, 'name_uz', 'name_ru'),
        image_url: r.image_url, qty: 1, price: Number(r.sale_price) || 0, unit_code: r.unit_code,
      });
    }
    renderCart();
  }

  function lineTotal(l) { return l.qty * l.price; }
  function cartTotal() { return state.cart.reduce((s, l) => s + lineTotal(l), 0); }
  function cartQty() { return state.cart.reduce((s, l) => s + l.qty, 0); }

  function renderCart() {
    cartBox.replaceChildren();
    if (!state.cart.length) {
      cartBox.append(h('div', { class: 'alert alert-info',
        text: uz() ? 'Savat bo‘sh — tovar qidiring' : 'Корзина пуста — найдите товар' }));
    } else {
      const tb = h('table', { class: 'grid' },
        h('thead', {}, h('tr', {},
          h('th', { text: 'SKU' }), h('th', { text: uz() ? 'Nomi' : 'Название' }),
          h('th', { class: 'num', text: uz() ? 'Miqdor' : 'Кол-во' }),
          h('th', { class: 'num', text: uz() ? 'Narx' : 'Цена' }),
          h('th', { class: 'num', text: uz() ? 'Summa' : 'Сумма' }),
          h('th', {}))),
        h('tbody', {}, ...state.cart.map((l) => {
          const iQty = h('input', { type: 'number', min: 1, step: '1', value: l.qty,
            class: 'pos-qty' });
          iQty.addEventListener('change', () => {
            const v = Number(iQty.value);
            l.qty = Number.isFinite(v) && v > 0 ? v : 1;
            renderCart();
          });
          const iPrice = h('input', { type: 'number', min: 0, step: '0.01', value: l.price,
            class: 'pos-price-in' });
          iPrice.addEventListener('change', () => {
            const v = Number(iPrice.value);
            l.price = Number.isFinite(v) && v >= 0 ? v : 0;
            renderCart();
          });
          return h('tr', {},
            h('td', {}, h('span', { class: 'mono', text: l.sku })),
            h('td', { class: 'pos-name-cell', text: l.name }),
            h('td', { class: 'num' }, iQty),
            h('td', { class: 'num' }, iPrice),
            h('td', { class: 'num mono', text: money(lineTotal(l)) }),
            h('td', {}, h('button', { class: 'btn btn-sm btn-danger', type: 'button',
              onclick: () => { state.cart = state.cart.filter((x) => x !== l); renderCart(); },
              text: '✕' })));
        })));
      cartBox.append(tb);
    }

    const cnt = document.getElementById('posCount');
    if (cnt) cnt.textContent = state.cart.length + ' ' + (uz() ? 'pozitsiya' : 'позиций')
      + ' · ' + qtyFmt(cartQty()) + ' ' + (uz() ? 'dona' : 'шт');

    // to'lov bloki
    payBox.replaceChildren(
      h('div', { class: 'pos-total' },
        h('span', { text: uz() ? 'JAMI:' : 'ИТОГО:' }),
        h('b', { id: 'posSum', text: money(cartTotal()) })),
      h('div', { class: 'pos-pay-row' },
        h('div', { class: 'fb-field' },
          h('label', { text: uz() ? 'To‘lov turi' : 'Тип оплаты' }),
          h('select', { class: 'pos-sel', id: 'posPay' },
            ...Object.entries(PAYMENTS).map(([k, v]) =>
              h('option', { value: k, text: uz() ? v.uz : v.ru })))),
        h('div', { class: 'fb-field', id: 'posCpWrap', style: { display: 'none' } },
          h('label', { text: uz() ? 'Mijoz (qarz uchun)' : 'Клиент (для долга)' }),
          h('select', { class: 'pos-sel', id: 'posCp' },
            h('option', { value: '', text: '—' }),
            ...customers.map((c) => h('option', { value: c.id, text: fn(c, 'name_uz', 'name_ru') }))))),
      h('div', { class: 'btn-row', style: { marginTop: '10px' } },
        btn(uz() ? 'Savatni tozalash' : 'Очистить корзину', { cls: 'btn-sm', onClick: () => {
          state.cart = []; renderCart();
        } }),
        btn(uz() ? '🖨 Chek' : '🖨 Чек', { cls: 'btn-sm', onClick: printReceipt }),
        btn(uz() ? 'SOTISH' : 'ПРОДАТЬ', { cls: 'btn-primary', id: 'posSell',
          onClick: () => sell() })));

    const pay = document.getElementById('posPay');
    pay.value = state.payment;
    pay.addEventListener('change', () => {
      state.payment = pay.value;
      syncCustomerField();
    });
    syncCustomerField();
  }

  function syncCustomerField() {
    const wrap = document.getElementById('posCpWrap');
    if (wrap) wrap.style.display = state.payment === 'CREDIT' ? '' : 'none';
  }

  // -------------------------------------------------------------- sotish
  async function sell() {
    if (!state.cart.length) { toast(uz() ? 'Savat bo‘sh' : 'Корзина пуста', 'err'); return; }

    // qoldiq tekshiruvi
    for (const l of state.cart) {
      const st = stock.get(l.product_id);
      const avail = st ? Number(st.qty) : 0;
      if (l.qty > avail) {
        toast((uz() ? 'Qoldiq yetarli emas: ' : 'Недостаточно остатка: ') + l.sku
          + ' (' + qtyFmt(avail) + ')', 'err');
        return;
      }
    }

    const cpSel = document.getElementById('posCp');
    const counterparty_id = state.payment === 'CREDIT' ? Number(cpSel?.value) || null : null;
    if (state.payment === 'CREDIT' && !counterparty_id) {
      toast(uz() ? 'Naxa uchun mijozni tanlang' : 'Выберите клиента для долга', 'err');
      return;
    }

    const btn = document.getElementById('posSell');
    if (btn) btn.disabled = true;
    try {
      const doc = await api.post('/api/documents', {
        type: 'ISSUE', base_type: 'SALE', reason: 'SALE',
        date: today(), warehouse_id: state.warehouse_id,
        counterparty_id,
        note: POS_NOTE[state.payment] + (uz() ? ' (POS)' : ' (POS)'),
        lines: state.cart.map((l) => ({
          product_id: l.product_id, qty: l.qty, price: l.price,
        })),
      });
      await api.post(`/api/documents/${doc.document.id}/post`);
      state.result = {
        number: doc.document.number,
        total: cartTotal(),
        payment: state.payment,
        counterparty_id,
        lines: state.cart.map((l) => ({ ...l })),
      };
      toast((uz() ? 'Sotildi: chek №' : 'Продано: чек №') + doc.document.number);
      state.cart = [];
      await load();
      showReceipt();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      const b = document.getElementById('posSell');
      if (b) b.disabled = false;
    }
  }

  const POS_NOTE = { CASH: 'Naqd to‘lov', CARD: 'Karta orqali', CREDIT: 'Naxa / qarzga sotuv' };

  // -------------------------------------------------------------- chek
  function receiptHtml() {
    const r = state.result;
    if (!r) return '';
    const rows = r.lines.map((l) =>
      `<tr><td>${l.sku}</td><td class="r">${qtyFmt(l.qty)}</td><td class="r">${money(l.price)}</td><td class="r">${money(l.qty * l.price)}</td></tr>`
    ).join('');
    return `<h2>${uz() ? 'CHEK' : 'ЧЕК'} №${r.number}</h2>
      <p>${today()} · ${uz() ? PAYMENTS[r.payment].uz : PAYMENTS[r.payment].ru}</p>
      <table><thead><tr><th>SKU</th><th class="r">${uz() ? 'Soni' : 'Кол-во'}</th><th class="r">${uz() ? 'Narx' : 'Цена'}</th><th class="r">${uz() ? 'Summa' : 'Сумма'}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="total">${uz() ? 'JAMI' : 'ИТОГО'}: <b>${money(r.total)}</b></p>`;
  }

  function showReceipt() {
    const html = receiptHtml();
    modal({
      title: uz() ? 'Chek' : 'Чек',
      width: 520,
      body: h('div', { class: 'pos-receipt', html }),
      actions: (close) => [
        btn(uz() ? 'Yopish' : 'Закрыть', { onClick: close }),
        btn(uz() ? 'Chop etish' : 'Печать', { cls: 'btn-primary', onClick: printReceipt }),
      ],
    });
  }

  function printReceipt() {
    const w = window.open('', '_blank', 'width=380,height=560');
    if (!w) { toast(uz() ? 'Oyna ochilmadi' : 'Не удалось открыть окно', 'err'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>chek</title>
      <style>body{font:13px/1.5 system-ui,sans-serif;padding:14px;color:#000}
      h2{font-size:16px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{border-bottom:1px solid #ddd;padding:4px 2px}th{text-align:left}
      .r{text-align:right}.total{text-align:right;font-size:15px}p{margin:2px 0}</style>
      </head><body>${receiptHtml()}</body></html>`);
    w.document.close();
    w.print();
  }

  // -------------------------------------------------------------- bugungi sotuvlar
  async function loadRecent() {
    recentBox.replaceChildren();
    const res = await api.get('/api/documents', {
      type: 'ISSUE', limit: 12, offset: 0,
    }).catch(() => ({ rows: [], total: 0 }));
    const rows = (res.rows || []).filter((d) => (d.base_type || 'SALE') === 'SALE');
    const box = h('div', {});
    box.append(h('div', { class: 'dim', style: { margin: '2px 0 6px' },
      text: uz() ? 'Oxirgi sotuvlar (Расход/SALE)' : 'Последние продажи (Расход/SALE)' }));
    if (!rows.length) {
      box.append(h('div', { class: 'alert alert-info', text: uz() ? 'Hozircha sotuv yo‘q' : 'Продаж пока нет' }));
    } else {
      box.append(dataTable({
        columns: [
          { key: 'number', title: uz() ? 'Raqam' : 'Номер', render: (r) => h('span', { class: 'mono', text: r.number }) },
          { key: 'date', title: uz() ? 'Sana' : 'Дата', render: (r) => String(r.date || '') },
          { key: 'wh', title: uz() ? 'Ombor' : 'Склад', render: (r) => r.warehouse_name_ru || '—' },
          { key: 'qty', title: uz() ? 'Miqdor' : 'Кол-во', align: 'right', render: (r) => qtyFmt(r.total_qty) },
          { key: 'sum', title: uz() ? 'Summa' : 'Сумма', align: 'right', render: (r) => money(r.total_amount) },
          { key: 'status', title: '', width: '90px', render: (r) => h('span', {
            class: 'badge ' + (r.status === 'POSTED' ? 'b-green' : 'b-gray'),
            text: r.status === 'POSTED' ? (uz() ? 'o‘tkazilgan' : 'проведён') : (uz() ? 'qoralamа' : 'черновик') }) },
        ],
        rows,
      }));
    }
    recentBox.append(card(null, box));
  }

  // -------------------------------------------------------------- skaner
  let scanTimer = null;
  fSearch.addEventListener('input', () => {
    state.q = fSearch.value;
    renderSuggest(fSearch.value);            // podskazka darhol
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => renderFound(), 220);
  });
  fSearch.addEventListener('blur', () => {
    // sichqoncha bilan ro'yxatni bosish imkoniyati qolishi uchun kechiktiriladi
    setTimeout(() => { if (!suggestBox.contains(document.activeElement)) hideSuggest(); }, 180);
  });
  fSearch.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggest(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggest(-1); return; }
    if (e.key === 'Escape') { e.preventDefault(); hideSuggest(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();

    // 1) podskazkadagi tanlangan qator
    if (sugItems.length) {
      const p = sugIdx >= 0 ? sugItems[sugIdx] : sugItems[0];
      pickSuggest(p);
      return;
    }
    // 2) server qidiruvi (to'liq moslik / boshqa ombor)
    if (!fSearch.value.trim()) return;          // bo'sh maydon — hech narsa qilmaymiz
    const found = await search(fSearch.value);
    if (!found.length) { toast(uz() ? 'Topilmadi' : 'Не найдено', 'err'); return; }
    if (found.length === 1) {
      addToCart(found[0]);
      fSearch.value = ''; state.q = ''; renderFound();
      fSearch.focus();
    } else {
      renderFound(found);
    }
  });

  await loadCatalog();
  await load();
  fSearch.focus();
}