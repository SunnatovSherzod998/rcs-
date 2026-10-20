/**
 * СПРАВОЧНИКИ / KATALOGLAR — umumiy sahifa
 * Server deskriptorlari asosida jadval + forma avtomatik quriladi.
 */
import { api, auth } from '../api.js';
import { t, tl, getLang, fn } from '../i18n.js';
import {
  h, card, dataTable, pageHead, btn, iconBtn, modal, buildForm, confirmDialog,
  toast, spinner, num, fmtDate, qtyFmt, today, money,
} from '../ui.js';
import { openEditModal, openHistoryModal } from './salary.js';
import { attachPasswordMeter } from '../password-ui.js';
import { analyzePassword, passwordMessage } from '../password.mjs';


let metaCache = null;
export async function loadMeta(force) {
  if (!metaCache || force) metaCache = await api.get('/api/catalogs');
  return metaCache;
}

let refsCache = {};
export async function loadRefs() {
  const meta = await loadMeta();
  const refs = {};
  await Promise.all(Object.keys(meta).map(async (key) => {
    refs[key] = await api.get(`/api/catalogs/${key}/options`, { limit: 2000 });
  }));
  // obyektni almashtirmaydi — shunda ochilgan shakllar yangi ma'lumotni ko‘radi
  Object.assign(refsCache, refs);
  return refsCache;
}
export function getRefs() { return refsCache; }

const TITLE_MAP = {
  products: 'm_products', warehouses: 'm_warehouses', locations: 'm_locations',
  counterparties: 'm_counterparties', categories: 'm_categories', brands: 'm_brands',
  units: 'm_units', currencies: 'm_currencies', employees: 'm_employees',
};

export async function catalogPage(catKey, root) {
  const meta = await loadMeta();
  const spec = meta[catKey];
  if (!spec) { root.append(h('div', { class: 'alert alert-err', text: 'Katalog topilmadi: ' + catKey })); return; }
  if (!refsCache[catKey]) await loadRefs();
  let refreshTree = null;
  // joylashuv shakliga ombor yaratish tugmasi (faqat locations sahifasi to'ldiradi)
  if (catKey === 'locations') {
    root.replaceChildren();
    root.append(pageHead(tl(spec.label),
      (getLang() === 'uz' ? 'Ombor yaratish → xona → stellaj → qator → yacheyka'
        : 'Создание склада → комната → стеллаж → ряд → ячейка'),
      auth.can('catalogs.write') ? btn(getLang() === 'uz' ? 'Ombor yaratish' : 'Создать склад',
        { icon: '＋', cls: 'btn-primary', onClick: () => createWarehouseModal() }) : null,
      btn(t('export'), { icon: '⭳', onClick: () => api.download(catKey) })
    ));
    const box = h('div', {});
    root.append(card(null, box));
    const expanded = new Set();
    const rowByCode = new Map();
    let allLocations = [];
    async function refreshLocations() {
      const all = await api.get('/api/catalogs/locations', { limit: 5000 });
      allLocations = all.rows;
      rowByCode.clear();
      for (const r of all.rows) rowByCode.set(r.code, r);
    }
    await refreshLocations();
    async function renderTree() {
      refreshTree = renderTree;
      box.replaceChildren(spinner());
      await refreshLocations();
      const whs = await api.get('/api/catalogs/warehouses/options', { limit: 500 });
      const out = h('div', {});
      for (const w of whs) {
        const d = await api.get('/api/plan/rooms', { warehouse_id: w.id });
        const wCard = h('div', { class: 'card', style: { marginBottom: '12px' } });
        wCard.append(h('div', { class: 'card-head', style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
          onclick: async () => {
            const k = 'w' + w.id;
            expanded.has(k) ? expanded.delete(k) : expanded.add(k);
            renderTree();
          } },
          h('b', { text: (expanded.has('w' + w.id) ? '▾ ' : '▸ ') + fn(w, 'name_uz', 'name_ru') }),
          h('span', { class: 'dim', style: { marginLeft: '10px' }, text: `${d.summary.rooms} xona · ${d.summary.cells} yacheyka` }),
          auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' },
            onclick: (e) => { e.stopPropagation(); createRoomModal(w, true); } }, '＋ Xona') : null));
        if (expanded.has('w' + w.id)) {
          const rGrid = h('div', { class: 'rooms-tree', style: { display: 'grid', gap: '8px', marginTop: '10px' } });
          for (const r of d.rooms) {
            const rk = 'r' + r.id;
            const rOpen = expanded.has(rk);
            rGrid.append(h('div', { class: 'tree-room' },
              h('button', { class: 'btn btn-sm', onclick: async () => { rOpen ? expanded.delete(rk) : expanded.add(rk); renderTree(); } },
                (rOpen ? '▾ ' : '▸ ') + r.code + ' · ' + fn(r, 'name_uz', 'name_ru')),
              auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm', style: { marginLeft: '6px' },
                onclick: async (e) => { e.stopPropagation();
                  try { await api.post('/api/plan/room/rack', { room_id: r.id }); toast('Stellaj qo‘shildi'); renderTree(); }
                  catch (err) { toast(err.message, 'err'); } } }, '＋ Stellaj') : null,
              auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm btn-danger', style: { marginLeft: '6px' },
                onclick: async (e) => { e.stopPropagation();
                  confirmDialog(`Xona "${r.code}" va uning stellaj/yacheykalari o‘chirilsinmi?`, async () => {
                    try { await api.post('/api/plan/delete', { type: 'room', id: r.id }); toast('O‘chirildi'); renderTree(); }
                    catch (err) { toast(err.message, 'err'); }
                  }); } }, '✕ Xona') : null,
              rOpen ? await roomBlock(r) : null));
          }
          if (!d.rooms.length) rGrid.append(h('div', { class: 'dim', text: getLang() === 'uz' ? 'Xonalar yo‘q' : 'Нет комнат' }));
          // xonasiz (erkin) joylashuvlar — to'g'ridan-to'g'ri omborga bog'langan
          const orphans = allLocations.filter((l) => String(l.warehouse_id) === String(w.id) && !l.room_id && l.is_active !== 0);
          if (orphans.length) {
            rGrid.append(h('div', { style: { marginTop: '6px' } },
              h('div', { class: 'dim', style: { fontSize: '12px', marginBottom: '4px' },
                text: getLang() === 'uz' ? 'Xonasiz joylar:' : 'Места без комнаты:' }),
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
                ...orphans.map((l) => h('button', { class: 'btn btn-sm',
                  onclick: () => formEditor('locations', spec, l),
                  title: fn(l, 'name_uz', 'name_ru') || l.code,
                }, l.code)))));
          }
          wCard.append(rGrid);
        }
        out.append(wCard);
      }
      box.replaceChildren(out);
    }
    async function roomBlock(r) {
      const d = await api.get('/api/plan/room', { room_id: r.id });
      const wrap = h('div', { style: { margin: '6px 0 6px 18px', display: 'grid', gap: '6px' } });
      for (const k of d.racks) {
        const kk = 'k' + k.id;
        const kOpen = expanded.has(kk);
        wrap.append(h('div', {},
          h('button', { class: 'btn btn-sm', onclick: async () => { kOpen ? expanded.delete(kk) : expanded.add(kk); renderTree(); } },
            (kOpen ? '▾ ' : '▸ ') + k.code),
          auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm', style: { marginLeft: '6px' },
            onclick: async (e) => { e.stopPropagation();
              try { await api.post('/api/plan/rack/row', { rack_id: k.id }); toast('Qator qo‘shildi'); renderTree(); }
              catch (err) { toast(err.message, 'err'); } } }, '＋ Qator') : null,
          auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm btn-danger', style: { marginLeft: '6px' },
            onclick: async (e) => { e.stopPropagation();
              confirmDialog(`Stellaj "${k.code}" o‘chirilsinmi?`, async () => {
                try { await api.post('/api/plan/delete', { type: 'rack', id: k.id }); toast('O‘chirildi'); renderTree(); }
                catch (err) { toast(err.message, 'err'); }
              }); } }, '✕ Stellaj') : null,
          kOpen ? h('div', { style: { margin: '6px 0 6px 18px', display: 'grid', gap: '4px' } },
            ...k.levels.map((lv) => h('div', {},
              h('div', { class: 'dim', style: { fontSize: '12px', marginBottom: '3px' }, text: (getLang() === 'uz' ? 'Qator ' : 'Ряд ') + lv.level }),
              auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm', style: { margin: '0 0 4px 0' },
                onclick: async () => {
                  try { await api.post('/api/plan/row/cell', { rack_id: k.id, level: lv.level }); toast('Yacheyka qo‘shildi'); renderTree(); }
                  catch (err) { toast(err.message, 'err'); }
                } }, '＋ Yacheyka') : null,
              auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm btn-danger', style: { marginLeft: '6px' },
                onclick: async () => {
                  confirmDialog(`Qator "${lv.level}" o‘chirilsinmi?`, async () => {
                    try { await api.post('/api/plan/delete', { type: 'row', rack_id: k.id, level: lv.level }); toast('O‘chirildi'); renderTree(); }
                    catch (err) { toast(err.message, 'err'); }
                  });
                } }, '✕ Qator') : null,
              h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
                ...lv.cells.map((c) => h('div', { style: { display: 'inline-flex', gap: '2px', alignItems: 'center' } },
                  h('button', {
                    class: 'btn btn-sm' + (c.items?.length ? ' btn-primary' : ''),
                    onclick: () => cellProductsModal(c, r.warehouse_id),
                  }, c.code),
                  auth.can('catalogs.write') ? h('button', { class: 'btn btn-sm btn-danger', style: { padding: '0 6px' },
                    title: 'O‘chirish / Удалить',
                    onclick: (e) => { e.stopPropagation();
                      confirmDialog(`Yacheyka "${c.code}" o‘chirilsinmi?`, async () => {
                        try { await api.post('/api/plan/delete', { type: 'cell', id: c.id || c.location_id }); toast('O‘chirildi'); renderTree(); }
                        catch (err) { toast(err.message, 'err'); }
                      }); } }, '✕') : null)))))
          ) : null));
      }
      if (!d.racks.length) wrap.append(h('div', { class: 'dim', text: getLang() === 'uz' ? 'Stellajlar yo‘q' : 'Нет стеллажей' }));
      return wrap;
    }
    // ---- yangi ombor (sklad) qo'shish — ichida bino rejasi avtomatik quriladi
    function createWarehouseModal(onDone) {
      const fCode = h('input', { placeholder: 'FIL3' });
      const fName = h('input', { placeholder: 'Yangi ombor' });
      const fNameRu = h('input', { placeholder: 'Новый склад' });
      const fKind = h('select', {}, ...[
        ['STORE', 'Ombor / Склад'], ['BRANCH', 'Filial / Филиал'],
        ['TRANSIT', 'Tranzit / Транзит'], ['VIRTUAL', 'Virtual / Виртуальный'],
      ].map(([v, l]) => h('option', { value: v, text: l })));
      const fAddr = h('input', { placeholder: 'Toshkent' });
      const fPhone = h('input', { placeholder: '+998 __ ___ __ __' });
      const fRooms = h('input', { type: 'number', min: 1, max: 40, value: 6 });
      const fRacks = h('input', { type: 'number', min: 1, max: 20, value: 3 });
      const fLevels = h('input', { type: 'number', min: 1, max: 10, value: 2 });
      const fSlots = h('input', { type: 'number', min: 1, max: 40, value: 4 });
      const fld = (label, el) => h('div', { class: 'form-field' }, h('label', { text: label }), el);
      let codeTouched = false;
      fCode.addEventListener('input', () => { codeTouched = true; });
      fName.addEventListener('input', () => {
        if (codeTouched) return;
        fCode.value = fName.value
          .toLowerCase()
          .replace(/[’‘`']/g, '')
          .replace(/[^a-z0-9a-zA-Z]+/g, '')
          .slice(0, 8)
          .toUpperCase();
        if (!fNameRu.value) fNameRu.value = fName.value;
      });
      const L = getLang() === 'uz';
      modal({
        title: L ? 'Yangi ombor (sklad) qo‘shish' : 'Новый склад',
        width: 560,
        body: h('div', {},
          h('div', { class: 'form-grid' },
            fld(L ? 'Kod *' : 'Код *', fCode),
            fld(L ? 'Nomi (UZ)' : 'Название (УЗ)', fName),
            fld(L ? 'Nomi (RU)' : 'Название (РУ)', fNameRu),
            fld(L ? 'Turi' : 'Тип', fKind),
            fld(L ? 'Manzil' : 'Адрес', fAddr),
            fld(L ? 'Telefon' : 'Телефон', fPhone),
            fld(L ? 'Xona soni' : 'Кол-во комнат', fRooms),
            fld(L ? 'Stellaj / xona' : 'Стеллажей в комнате', fRacks),
            fld(L ? 'Qator / stellaj' : 'Рядов в стеллаже', fLevels),
            fld(L ? 'Joy / qator' : 'Мест в ряду', fSlots)),
          h('div', { class: 'alert alert-info', style: { marginTop: '10px' },
            text: L
              ? 'Ombor yaratilgach uning bino rejasi (xona → stellaj → qator → yacheyka) avtomatik quriladi.'
              : 'После создания склада его план (комната → стеллаж → ряд → ячейка) строится автоматически.' })),
        actions: (close) => [
          btn(t('cancel'), { onClick: close }),
          btn(t('save'), { cls: 'btn-primary', onClick: async () => {
            if (!fCode.value.trim()) { toast(L ? 'Kod kiriting' : 'Введите код', 'err'); return; }
            try {
              const wh = await api.post('/api/catalogs/warehouses', {
                code: fCode.value.trim().toUpperCase(),
                name_uz: fName.value.trim() || fCode.value.trim().toUpperCase(),
                name_ru: fNameRu.value.trim() || fName.value.trim() || fCode.value.trim().toUpperCase(),
                kind: fKind.value, address: fAddr.value.trim(), phone: fPhone.value.trim(),
                is_active: 1,
              });
              const plan = await api.post('/api/plan/build', {
                warehouse_id: wh.id,
                cols: 3, rooms: Number(fRooms.value) || 6,
                racks_per_room: Number(fRacks.value) || 3,
                levels: Number(fLevels.value) || 2,
                slots: Number(fSlots.value) || 4,
              });
              toast(L
                ? `Ombor yaratildi: ${plan.rooms} xona · ${plan.racks} stellaj · ${plan.cells} yacheyka`
                : `Склад создан: ${plan.rooms} комнат · ${plan.racks} стеллажей · ${plan.cells} ячеек`);
              close();
              if (onDone) onDone(wh);
              renderTree();
            } catch (e) { toast(e.message, 'err'); }
          } }),
        ],
      });
    }

    // ---- yangi xona qo'shish (stellaj/kataklar bilan)
    // withRacks=false → faqat xona; true → xona + stellaj + qator + yacheykalar
    function createRoomModal(w, withRacks, onDone) {
      const fCode = h('input', { placeholder: w.code + '-101' });
      const fName = h('input', { placeholder: 'Xona nomi' });
      const fKind = h('select', {}, ...[
        ['STORAGE', 'Saqlash / Хранение'], ['RECEIVING', 'Qabul / Приёмка'],
        ['SHIPPING', 'Yuborish / Отгрузка'], ['COOLING', 'Sovuq / Холодная'],
        ['QUARANTINE', 'Karantin / Карантин'],
      ].map(([v, l]) => h('option', { value: v, text: l })));
      const fRacks = h('input', { type: 'number', min: 0, max: 20, value: withRacks ? 1 : 0 });
      const fLevels = h('input', { type: 'number', min: 1, max: 10, value: 1 });
      const fSlots = h('input', { type: 'number', min: 1, max: 40, value: 4 });
      const fld = (label, el) => h('div', { class: 'form-field' }, h('label', { text: label }), el);
      const L = getLang() === 'uz';
      // nomi yozilganda kod avtomatik mos qilinadi (kod qo'lda o'zgartirilmagan bo'lsa)
      let codeTouched = false;
      fCode.addEventListener('input', () => { codeTouched = true; });
      fName.addEventListener('input', () => {
        if (codeTouched) return;
        fCode.value = fName.value
          .toLowerCase()
          .replace(/[’‘`']/g, '')
          .replace(/[^a-z0-9a-zA-Z]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .toUpperCase();
      });
      modal({
        title: (L ? 'Xona qo‘shish' : 'Добавить комнату') + ' · ' + fn(w, 'name_uz', 'name_ru'),
        width: 480,
        body: h('div', {},
          h('div', { class: 'form-grid' },
            fld(L ? 'Kod (ixtiyoriy)' : 'Код (необязательно)', fCode),
            fld(L ? 'Nomi' : 'Название', fName),
            fld(L ? 'Turi' : 'Тип', fKind),
            withRacks ? fld(L ? 'Stellaj soni' : 'Кол-во стеллажей', fRacks) : null,
            withRacks ? fld(L ? 'Qator (qavat) soni' : 'Рядов (ярусов)', fLevels) : null,
            withRacks ? fld(L ? 'Qatorda joy soni' : 'Мест в ряду', fSlots) : null)),
        actions: (close) => [
          btn(t('cancel'), { onClick: close }),
          btn(t('save'), { cls: 'btn-primary', onClick: async () => {
            try {
              const res = await api.post('/api/plan/room', {
                warehouse_id: w.id, code: fCode.value, name: fName.value, kind: fKind.value,
                racks: Number(fRacks.value) || 0, levels: Number(fLevels.value) || 1, slots: Number(fSlots.value) || 4,
              });
              toast(L
                ? `Xona qo‘shildi: ${res.racks} stellaj · ${res.cells} yacheyka`
                : `Комната добавлена: ${res.racks} стеллажей · ${res.cells} ячеек`);
              close();
              if (onDone) onDone(res);
              renderTree();
            } catch (e) { toast(e.message, 'err'); }
          } }),
        ],
      });
    }

    function cellProductsModal(c, warehouseId) {
      const items = c.items || [];
      const body = h('div', {});
      if (!items.length) {
        body.append(h('div', { class: 'alert alert-info', text: getLang() === 'uz'
          ? 'Bu joy bo‘sh / это место пусто' : 'Это место пусто' }));
      }
      for (const it of items) {
        body.append(h('div', { class: 'place-item' },
          h('div', { class: 'p-img' },
            it.image_url ? h('img', { src: it.image_url, alt: '' }) : h('span', { text: '📦' })),
          h('div', { class: 'p-txt' },
            h('b', { class: 'mono', text: it.sku }), ' ',
            h('span', { text: getLang() === 'uz' ? (it.name_uz || it.name_ru) : (it.name_ru || it.name_uz) }),
            h('div', { class: 'dim', style: { fontSize: '11.5px' },
              text: [it.brand, it.category, it.unit_code].filter(Boolean).join(' · ') })),
          h('div', { class: 'p-qty', text: qtyFmt(it.qty) + ' ' + (it.unit_code || '') })));
      }
      modal({
        title: c.code + ' · ' + (getLang() === 'uz' ? 'tovarlar' : 'товары'),
        width: 640, body,
        actions: (close) => [
          btn(getLang() === 'uz' ? '＋ Tovar qo‘shish' : '＋ Добавить товар', { cls: 'btn-primary', onClick: () => { close(); addProductToCell(c, warehouseId); } }),
          items.length ? btn(getLang() === 'uz' ? '➜ Ko‘chirish' : '➜ Переместить', { onClick: () => { close(); transferCellModal(c, items, warehouseId); } }) : null,
          btn(t('close'), { onClick: close }),
        ],
      });
    }

    async function addProductToCell(c, warehouseId) {
      const prods = await api.get('/api/catalogs/products/options', { limit: 2000 });
      const fProd = h('select', {}, ...prods.map((p) => h('option', { value: p.id, text: `${p.code} · ${fn(p, 'name_uz', 'name_ru')}` })));
      const fQty = h('input', { type: 'number', step: '1', min: '1', value: 1 });
      const fPrice = h('input', { type: 'number', step: '0.01', value: 0 });
      modal({
        title: (getLang() === 'uz' ? 'Yacheykaga tovar' : 'Товар в ячейку') + ' · ' + c.code,
        width: 480,
        body: h('div', {},
          h('div', { class: 'form-grid' },
            h('div', { class: 'form-field' }, h('label', { text: 'SKU / ' + t('product') }), fProd),
            h('div', { class: 'form-field' }, h('label', { text: t('qty') }), fQty),
            h('div', { class: 'form-field' }, h('label', { text: t('price') }), fPrice))),
        actions: (close) => [
          btn(t('cancel'), { onClick: close }),
          btn(t('save'), { cls: 'btn-primary', onClick: async () => {
            try {
              const doc = await api.post('/api/documents', {
                type: 'RECEIPT', date: today(), warehouse_id: warehouseId,
                note: 'Yacheykaga kirim / Приход в ячейку',
                lines: [{ product_id: Number(fProd.value), location_id: c.id || c.location_id, qty: Number(fQty.value) || 0, price: Number(fPrice.value) || 0 }],
              });
              await api.post(`/api/documents/${doc.document.id}/post`);
              toast((getLang() === 'uz' ? 'Qo‘shildi: hujjat №' : 'Добавлено: документ №') + doc.document.number);
              close(); renderTree();
            } catch (e) { toast(e.message, 'err'); }
          } }),
        ],
      });
    }

    async function transferCellModal(c, items, warehouseId) {
      const whs = await api.get('/api/catalogs/warehouses/options', { limit: 500 });
      const others = whs.filter((w) => String(w.id) !== String(warehouseId));
      if (!others.length) { toast(getLang() === 'uz' ? 'Boshqa ombor yo‘q' : 'Нет другого склада', 'err'); return; }
      const L = getLang() === 'uz'
        ? { wh: 'Ombor', room: 'Xona', rack: 'Stellaj', row: 'Qator', cell: 'Yacheyka' }
        : { wh: 'Склад', room: 'Комната', rack: 'Стеллаж', row: 'Ряд', cell: 'Ячейка' };
      const ph = (s) => '— ' + s.toLowerCase() + ' —';
      const fDest = h('select', {}, ...others.map((w) => h('option', { value: w.id, text: fn(w, 'name_uz', 'name_ru') })));
      const fRoom = h('select', {}, h('option', { value: '', text: ph(L.room) }));
      const fRack = h('select', {}, h('option', { value: '', text: ph(L.rack) }));
      const fRow = h('select', {}, h('option', { value: '', text: ph(L.row) }));
      const fCell = h('select', {}, h('option', { value: '', text: ph(L.cell) }));
      const fld = (label, el) => h('div', { class: 'form-field' }, h('label', { text: label }), el);
      const reset = (sel, ph) => { sel.innerHTML = ''; sel.append(h('option', { value: '', text: ph })); };
      // 1) ombor o'zgarganda xonalar
      async function loadRooms() {
        reset(fRoom, ph(L.room)); reset(fRack, ph(L.rack)); reset(fRow, ph(L.row)); reset(fCell, ph(L.cell));
        if (!fDest.value) return;
        try {
          const d = await api.get('/api/plan/rooms', { warehouse_id: fDest.value });
          for (const r of d.rooms) fRoom.append(h('option', { value: r.id, text: r.code + ' · ' + fn(r, 'name_uz', 'name_ru') }));
        } catch { /* ignore */ }
      }
      // 2) xona o'zgarganda stellajlar
      async function loadRacks() {
        reset(fRack, ph(L.rack)); reset(fRow, ph(L.row)); reset(fCell, ph(L.cell));
        if (!fRoom.value) return;
        try {
          const d = await api.get('/api/plan/room', { room_id: fRoom.value });
          for (const k of d.racks) fRack.append(h('option', { value: k.id, text: k.code }));
        } catch { /* ignore */ }
      }
      // 3) stellaj o'zgarganda qatorlar
      async function loadRows() {
        reset(fRow, ph(L.row)); reset(fCell, ph(L.cell));
        if (!fRack.value) return;
        try {
          const d = await api.get('/api/plan/room', { room_id: fRoom.value });
          const k = d.racks.find((x) => String(x.id) === String(fRack.value));
          if (k) for (const lv of k.levels) fRow.append(h('option', { value: lv.level, text: (getLang() === 'uz' ? 'Qator ' : 'Ряд ') + lv.level }));
        } catch { /* ignore */ }
      }
      // 4) qator o'zgarganda yacheykalar
      async function loadCells() {
        reset(fCell, ph(L.cell));
        if (!fRack.value || !fRow.value) return;
        try {
          const d = await api.get('/api/plan/room', { room_id: fRoom.value });
          const k = d.racks.find((x) => String(x.id) === String(fRack.value));
          const lv = k && k.levels.find((x) => String(x.level) === String(fRow.value));
          if (lv) for (const c of lv.cells) fCell.append(h('option', { value: c.id || c.location_id, text: c.code }));
        } catch { /* ignore */ }
      }
      fDest.addEventListener('change', loadRooms);
      fRoom.addEventListener('change', loadRacks);
      fRack.addEventListener('change', loadRows);
      fRow.addEventListener('change', loadCells);
      loadRooms();
      const qtyInputs = new Map();
      const body = h('div', {},
        h('div', { class: 'alert alert-info', text: (getLang() === 'uz' ? 'Qayerga ko‘chirilsin:' : 'Куда переместить:') }),
        h('div', { class: 'form-grid', style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } },
          fld(L.wh, fDest), fld(L.room, fRoom), fld(L.rack, fRack),
          fld(L.row, fRow), fld(L.cell, fCell)),
        ...items.map((it) => {
          const inp = h('input', { type: 'number', step: '1', min: '0', value: it.qty, style: { width: '90px' } });
          qtyInputs.set(it, inp);
          return h('div', { class: 'place-item', style: { marginTop: '6px' } },
            h('div', { class: 'p-img' }, it.image_url ? h('img', { src: it.image_url, alt: '' }) : h('span', { text: '📦' })),
            h('div', { class: 'p-txt' }, h('b', { class: 'mono', text: it.sku }), ' ', h('span', { text: getLang() === 'uz' ? (it.name_uz || it.name_ru) : (it.name_ru || it.name_uz) })),
            inp);
        }));
      modal({
        title: (getLang() === 'uz' ? 'Ko‘chirish' : 'Перемещение') + ' · ' + c.code,
        width: 640, body,
        actions: (close) => [
          btn(t('cancel'), { onClick: close }),
          btn(getLang() === 'uz' ? 'O‘tkazish' : 'Переместить', { cls: 'btn-primary', onClick: async () => {
            try {
              if (!fCell.value && !confirm(getLang() === 'uz'
                ? 'Yacheyka tanlanmadi. Tovar ombor umumiy qoldig‘iga tushadi va 2D xaritada ko‘rinmaydi. Davom etilsinmi?'
                : 'Ячейка не выбрана. Товар попадёт в общий остаток склада и не будет виден на 2D-схеме. Продолжить?')) return;
              const lines = items.map((it) => ({ product_id: it.product_id, location_id: c.id || c.location_id, dest_location_id: fCell.value ? Number(fCell.value) : null, qty: Number(qtyInputs.get(it).value) || 0, price: 0 }))
                .filter((l) => l.qty > 0);
              if (!lines.length) { toast('Miqdor 0', 'err'); return; }
              const doc = await api.post('/api/documents', {
                type: 'TRANSFER', date: today(), warehouse_id: warehouseId, dest_warehouse_id: Number(fDest.value),
                note: 'Yacheykadan ko‘chirish / Перемещение из ячейки', lines,
              });
              await api.post(`/api/documents/${doc.document.id}/post`);
              toast((getLang() === 'uz' ? 'Ko‘chirildi: hujjat №' : 'Перемещено: документ №') + doc.document.number);
              close(); renderTree();
            } catch (e) { toast(e.message, 'err'); }
          } }),
        ],
      });
    }

    renderTree();
    return;
  }

  const state = { q: '', offset: 0, limit: 200, rows: [], total: 0 };

  root.replaceChildren();
  root.append(pageHead(tl(spec.label),
    `${num(state.total)} ${t('total').toLowerCase()}`,
    auth.can('catalogs.write') ? btn(t('add'), { icon: '＋', cls: 'btn-primary', onClick: () => formEditor(catKey, spec, null) }) : null,
    catKey === 'employees' && !auth.isAdmin
      ? h('span', { class: 'dim', style: { fontSize: '12px' },
          text: getLang() === 'uz' ? '🔒 Xodim qo‘shish faqat admin uchun' : '🔒 Добавление сотрудников только для администратора' })
      : null,
    btn(t('export'), { icon: '⭳', onClick: () => api.download(catKey) })
  ));

  // ustunlar
  const cols = buildColumns(catKey, spec);

  const search = h('input', {
    type: 'search', placeholder: t('search_ph'),
    oninput: debounce((e) => { state.q = e.target.value; state.offset = 0; load(); }, 260),
  });

  const tableBox = h('div', {});
  const foot = h('div', { class: 'table-foot' });

  root.append(card(null,
    h('div', { class: 'filter-bar' },
      h('div', { class: 'search-input' }, search),
      h('div', { class: 'fb-field' },
        h('button', { class: 'btn', text: t('reset'), onClick: () => { search.value = ''; state.q = ''; state.offset = 0; load(); } }))
    ),
    tableBox, foot
  ));

  async function load() {
    tableBox.replaceChildren(spinner());
    const res = await api.get(`/api/catalogs/${catKey}`, { q: state.q, limit: state.limit, offset: state.offset });
    state.rows = res.rows; state.total = res.total;
    tableBox.replaceChildren(dataTable({
      columns: cols,
      rows: res.rows,
      rowCls: (r) => (r.is_active === 0 ? 'dim' : ''),
      onRowClick: catKey === 'employees' ? (r) => openEmployeeSalary(r.id) : (r) => formEditor(catKey, spec, r),
    }));
    foot.replaceChildren(
      h('span', { text: `${num(state.total)} ${t('total').toLowerCase()} · ${state.offset + 1}–${Math.min(state.offset + state.limit, state.total)}` }),
      pager()
    );
  }

  function pager() {
    const p = h('div', { class: 'pager' });
    p.append(h('button', { text: '‹', disabled: state.offset === 0, onClick: () => { state.offset = Math.max(0, state.offset - state.limit); load(); } }));
    p.append(h('span', { class: 'dim', text: `${Math.floor(state.offset / state.limit) + 1} / ${Math.max(1, Math.ceil(state.total / state.limit))}` }));
    p.append(h('button', { text: '›', disabled: state.offset + state.limit >= state.total, onClick: () => { state.offset += state.limit; load(); } }));
    return p;
  }

  // ------------------------------------------------ forma
  /** Xodimlar katalogi — faqat admin yozishi mumkin */
  function canWrite() {
    return catKey === 'employees' ? auth.isAdmin : auth.can('catalogs.write');
  }

  async function formEditor(key, spec2, row) {
    const refs = refsCache;   // jonli obyekt — kaskadli ro'yxatlar yangilanishni ko'radi
    const form = buildForm(spec2.fields, row || {}, refs);
    const isNewEmployee = key === 'employees' && !row;

    // --- Xodim uchun: bir vaqtda foydalanuvchi akkaunti yaratish
    const acc = isNewEmployee ? buildForm([
      { name: 'login', type: 'text', label: { uz: 'Login', ru: 'Логин' } },
      { name: 'password', type: 'password', label: { uz: 'Parol', ru: 'Пароль' } },
      { name: 'role', type: 'select', label: { uz: 'Rol', ru: 'Роль' }, options: [
        { value: 'CASHIER', label: { uz: 'Kassir', ru: 'Кассир' } },
        { value: 'WAREHOUSE_MANAGER', label: { uz: 'Ombor mudiri', ru: 'Управляющий складом' } },
        { value: 'OBSERVER', label: { uz: 'Kuzatuvchi', ru: 'Наблюдатель' } },
      ] },
    ], { role: 'CASHIER' }, refs) : null;

    // Parol siyosati — jonli tekshiruv ro'yxati
    const accMeter = acc ? attachPasswordMeter(acc.inputs.password) : null;

    const m = modal({
      title: (row ? t('edit') : t('add')) + ' · ' + tl(spec2.label),
      width: 860,
      body: h('div', {},
        row && row.id ? infoHint(row) : null,
        form.form,
        acc ? h('div', {},
          h('div', { class: 'form-section-title', style: { marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--line)' },
            text: (getLang() === 'uz' ? '🔑 Foydalanuvchi akkaunti (ixtiyoriy)' : '🔑 Учётная запись (необязательно)') }),
          h('div', { class: 'hint', style: { marginBottom: '8px' },
            text: getLang() === 'uz'
              ? 'Login va parol to‘ldirilsa, xodim uchun avtomatik akkaunt yaratiladi va kirish huquqi beriladi.'
              : 'Если заполнить логин и пароль, для сотрудника будет создана учётная запись с правом входа.' }),
          acc.form) : null
      ),
      actions: (close) => [
        row && canWrite()
          ? btn(t('delete'), { cls: 'btn-danger', onClick: () => { close(); del(key, row); } })
          : h('span', { style: { marginRight: 'auto' } }),
        btn(t('cancel'), { onClick: close }),
        canWrite()
          ? btn(t('save'), {
              cls: 'btn-primary', onClick: async () => {
                if (!form.validate()) return;
                // yangi joy xonasiz bo'lmaydi
                if (key === 'locations' && !row && !form.inputs.room_id.value) {
                  form.inputs.room_id.classList.add('invalid');
                  toast(getLang() === 'uz' ? 'Xona tanlang (omborni tanlang yoki «＋ Ombor yaratish»)'
                    : 'Выберите комнату (выберите склад или «＋ Создать склад»)', 'err');
                  return;
                }
                try {
                  const payload = form.collect();
                  // rasmni avval serverga yuklash
                  const dataUrl = form.pendingImage();
                  if (dataUrl) {
                    const up = await api.post('/api/plan/upload', { image: dataUrl });
                    payload.image_url = up.url;
                  }
                  // Xodim + akkaunt (bir shaklda)
                  if (acc) {
                    const a = acc.collect();
                    if (a.login || a.password) {
                      if (!a.login || !a.password) {
                        toast(getLang() === 'uz'
                          ? 'Login va parolni ikkalasini to‘ldiring'
                          : 'Заполните и логин, и пароль', 'err');
                        acc.inputs[a.login ? 'password' : 'login'].focus();
                        return;
                      }
                      // Parol siyosati — xato bo'lsa akkaunt yaratilmaydi
                      const r = analyzePassword(a.password);
                      if (!r.ok) {
                        toast(passwordMessage(r), 'err');
                        acc.inputs.password.focus();
                        accMeter.update();
                        return;
                      }
                      payload.user = { login: a.login, password: a.password, role: a.role };
                    }
                  }
                  let saved = null;
                  if (row) await api.put(`/api/catalogs/${key}/${row.id}`, payload);
                  else saved = await api.post(`/api/catalogs/${key}`, payload);
                  toast(saved?.created_user
                    ? t('saved') + ' · ' + (getLang() === 'uz'
                      ? `Login: ${saved.created_user.login}`
                      : `Логин: ${saved.created_user.login}`)
                    : t('saved'));
                  m.close();
                  await loadRefs();
                  if (refreshTree) refreshTree(); else load();
                } catch (e) { toast(e.message, 'err'); }
              },
            })
          : null,
      ],
    });
  }

  async function del(key, row) {
    confirmDialog(`${t('confirm')} «${row.code || row.sku || fn(row, 'name_uz', 'name_ru')}»`, async () => {
      try {
        await api.del(`/api/catalogs/${key}/${row.id}`);
        toast(t('deleted'));
        await loadRefs();
        if (refreshTree) refreshTree(); else load();
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  await load();
}

function infoHint(row) {
  const bits = [];
  if (row.created_at) bits.push(`${t('created')}: ${fmtDate(row.created_at)}`);
  if (row.last_login_at) bits.push(`${t('opened')}: ${fmtDate(row.last_login_at)}`);
  if (!bits.length) return null;
  return h('div', { class: 'alert alert-info', text: bits.join('  ·  ') });
}

// ------------------------------------------------ ustunlar

function buildColumns(key, spec) {
  const L = (f) => tl(f.label);
  const R = (r, ...n) => fn(r, ...n);
  const common = [
    {
      key: 'actions', title: t('actions'), align: 'right', width: '86px',
      render: (r) => h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } },
        auth.can('catalogs.write') ? iconBtn('✎', t('edit'), () => openRow(r)) : null,
        auth.can('catalogs.write') ? iconBtn('⧉', t('copy'), () => copyRow(r)) : null
      ),
    },
  ];

  switch (key) {
    case 'products':
      return [
        { key: 'img', title: '', width: '44px', render: (r) => productThumb(r, { size: 34, cls: 'p-img' }) },
        { key: 'sku', title: 'SKU', width: '110px', render: (r) => h('span', { class: 'mono', text: r.sku }) },
        { key: 'name', title: t('name'), render: (r) => h('span', {}, R(r, 'name_uz', 'name_ru'),
          r.barcode ? h('span', { class: 'dim mono', text: '  ' + r.barcode }) : null) },
        { key: 'cat', title: 'Toifa', render: (r) => catName(r) },
        { key: 'brand', title: 'Brend', render: (r) => r.brand_name_ru || '—' },
        { key: 'unit', title: 'Birlik', width: '70px', render: (r) => r.unit_code || '—' },
        { key: 'cost_price', title: t('cost'), align: 'right', render: (r) => money(r.cost_price) },
        { key: 'sale_price', title: 'Sotish', align: 'right', render: (r) => money(r.sale_price) },
        { key: 'min_stock', title: 'Min', align: 'right', render: (r) => (r.min_stock ? qtyFmt(r.min_stock) : '—') },
        { key: 'is_active', title: '', align: 'center', width: '60px',
          render: (r) => h('span', { class: 'badge ' + (r.is_active ? 'b-green' : 'b-gray'), text: r.is_active ? t('yes') : t('no') }) },
        ...common,
      ];
    case 'warehouses':
      return [
        { key: 'code', title: t('code'), width: '110px', render: (r) => h('span', { class: 'mono', text: r.code }) },
        { key: 'name', title: t('name'), render: (r) => R(r, 'name_uz', 'name_ru') },
        { key: 'kind', title: t('doc_type'), width: '110px' },
        { key: 'address', title: 'Manzil', render: (r) => r.address || '—' },
        { key: 'phone', title: 'Telefon', width: '150px' },
        { key: 'is_negative_allowed', title: 'Manfiy qoldiq', align: 'center', width: '120px',
          render: (r) => h('span', { class: 'badge ' + (r.is_negative_allowed ? 'b-orange' : 'b-gray'), text: r.is_negative_allowed ? t('yes') : t('no') }) },
        ...common,
      ];
    case 'counterparties':
      return [
        { key: 'code', title: t('code'), width: '100px', render: (r) => h('span', { class: 'mono', text: r.code || '—' }) },
        { key: 'name', title: t('name'), render: (r) => R(r, 'name_uz', 'name_ru') },
        { key: 'kind', title: t('doc_type'), width: '120px' },
        { key: 'tax_id', title: 'STIR', width: '130px', render: (r) => h('span', { class: 'mono', text: r.tax_id || '—' }) },
        { key: 'phone', title: 'Telefon', width: '150px' },
        { key: 'address', title: 'Manzil', render: (r) => r.address || '—' },
        ...common,
      ];
    case 'locations':
      return [
        { key: 'code', title: t('code'), width: '110px', render: (r) => h('span', { class: 'mono', text: r.code }) },
        { key: 'wh', title: t('warehouse'), render: (r) => whName(r.warehouse_id) },
        { key: 'name', title: t('name'), render: (r) => R(r, 'name_uz', 'name_ru') || '—' },
        { key: 'kind', title: t('doc_type'), width: '110px' },
        ...common,
      ];
    case 'currencies':
      return [
        { key: 'code', title: t('code'), width: '90px', render: (r) => h('b', { text: r.code }) },
        { key: 'name', title: t('name'), render: (r) => R(r, 'name_uz', 'name_ru') },
        { key: 'rate', title: t('rate'), align: 'right', render: (r) => num(r.rate, 4) },
        { key: 'is_base', title: 'Asosiy', align: 'center', width: '80px',
          render: (r) => (r.is_base ? h('span', { class: 'badge b-blue', text: t('yes') }) : '') },
        ...common,
      ];
    default:
      return [
        { key: 'code', title: t('code'), width: '110px', render: (r) => h('span', { class: 'mono', text: r.code || '—' }) },
        { key: 'name', title: t('name'), render: (r) => R(r, 'name_uz', 'name_ru') },
        ...(spec.fields.some((f) => f.name === 'country')
          ? [{ key: 'country', title: 'Davlat', width: '130px', render: (r) => r.country || '—' }] : []),
        ...(spec.fields.some((f) => f.name === 'position')
          ? [{ key: 'position', title: 'Lavozim', width: '150px', render: (r) => r.position || '—' }] : []),
        ...(spec.fields.some((f) => f.name === 'ratio')
          ? [{ key: 'ratio', title: 'Koeff.', align: 'right', width: '90px', render: (r) => num(r.ratio, 4) }] : []),
        ...common,
      ];
  }

  function catName(r) {
    const c = (refsCache.categories || []).find((x) => x.id === r.category_id);
    return c ? fn(c, 'name_uz', 'name_ru') : '—';
  }
  function whName(id) {
    const w = (refsCache.warehouses || []).find((x) => x.id === id);
    return w ? fn(w, 'name_uz', 'name_ru') : '—';
  }
  function openRow(r) { formEditor(key, spec, r); }
  async function copyRow(r) {
    try {
      const copy = { ...r, id: undefined, code: r.code ? r.code + '-COPY' : '', sku: r.sku ? r.sku + '-COPY' : '', barcode: '' };
      for (const f of spec.fields) if (!(f.name in copy)) delete copy[f.name];
      delete copy.id; delete copy.created_at; delete copy.last_login_at;
      await api.post(`/api/catalogs/${key}`, copy);
      toast(t('saved'));
      await loadRefs();
      if (refreshTree) refreshTree(); else load();
    } catch (e) { toast(e.message, 'err'); }
  }
}

function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}
