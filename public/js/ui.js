/**
 * UI komponentlari: elementlar, jadval, forma, modal, xabar.
 * 1C uslubidagi kattalar ( Размерные шрифты, таблицы с рамками )
 */
import { t, tl, getLang, fn } from './i18n.js';

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(9)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
};
export const $ = h;

// ------------------------------------------------------------------ format

const nf = (min, max) => new Intl.NumberFormat(getLang() === 'uz' ? 'ru-UZ' : 'ru-RU', {
  minimumFractionDigits: min, maximumFractionDigits: max,
});

export function num(v, dec = 2) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '';
  return nf(0, dec).format(Number(v));
}
export function money(v, dec = 0) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '';
  return nf(dec, dec).format(Number(v));
}
export function qtyFmt(v) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '';
  const n = Number(v);
  return Number.isInteger(n) ? nf(0, 0).format(n) : nf(0, 3).format(n);
}
export function fmtDate(s) {
  if (!s) return '';
  const d = String(s).slice(0, 10);
  const [y, m, day] = d.split('-');
  return getLang() === 'uz' ? `${day}.${m}.${y}` : `${day}.${m}.${y}`;
}
export function today() { return new Date().toISOString().slice(0, 10); }
export function monthStart() { return today().slice(0, 8) + '01'; }
export const tr = (row, ...keys) => {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
};

// ------------------------------------------------------------------ xabarlar

let toastBox;
export function toast(msg, type = 'ok') {
  if (!toastBox) {
    toastBox = h('div', { class: 'toast-box' });
    document.body.append(toastBox);
  }
  const icons = { ok: '✓', err: '✕', warn: '!', info: 'i' };
  const el = h('div', { class: `toast toast-${type}` },
    h('span', { class: 'toast-ico', text: icons[type] || 'i' }),
    h('span', { text: msg })
  );
  toastBox.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 5200 : 2800);
}

export function errorBox(err) {
  return h('div', { class: 'alert alert-err' },
    h('b', { text: t('error') + ': ' }), String(err?.message || err)
  );
}

// ------------------------------------------------------------------ modal

export function modal({ title, body, actions, width = 720, onClose }) {
  const overlay = h('div', { class: 'modal-overlay' });
  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 150); onClose?.(); };
  const box = h('div', { class: 'modal', style: { maxWidth: width + 'px' } },
    h('div', { class: 'modal-head' },
      h('div', { class: 'modal-title', text: title || '' }),
      h('button', { class: 'icon-btn', title: t('close'), onclick: close, text: '✕' })
    ),
    h('div', { class: 'modal-body' }, body),
    actions ? h('div', { class: 'modal-foot' }, actions(close)) : null
  );
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const first = box.querySelector('input,select,textarea');
  first?.focus();
  return { close, box };
}

export function confirmDialog(message, onYes, yesLabel) {
  modal({
    title: t('confirm'),
    width: 440,
    body: h('div', { class: 'confirm-text', text: message }),
    actions: (close) => [
      h('button', { class: 'btn', onclick: close, text: t('cancel') }),
      h('button', {
        class: 'btn btn-danger', text: yesLabel || t('delete'),
        onclick: async () => { close(); await onYes(); },
      }),
    ],
  });
}

// ------------------------------------------------------------------ forma

/** Katalog elementini "<kod> · <nomi>" ko'rinishida matn qiladi */
export function refLabel(o) {
  return (o.code ? o.code + ' · ' : '') + fn(o, 'name_uz', 'name_ru');
}

/**
 * <select> ni to'ldiradi.
 * filterBy berilsa — ro'yxat faqat `o[filterBy] === value` bo'lgan elementlardan tuziladi.
 */
export function fillRef(sel, opts, { filterBy = null, value = '', keep = false, empty = '—' } = {}) {
  const prev = keep ? sel.value : '';
  sel.replaceChildren();
  if (empty !== null) sel.append(h('option', { value: '', text: empty }));
  for (const o of opts || []) {
    if (filterBy && String(o[filterBy] ?? '') !== String(value)) continue;
    sel.append(h('option', { value: o.id, text: refLabel(o) }));
  }
  if (prev && [...sel.options].some((op) => op.value === prev)) sel.value = prev;
  return sel;
}

/**
 * Deskriptor asosida forma yaratadi (server katalog spec'dan)
 * fields: [{name, type, label:{uz,ru}, required, options, ref, dependsOn, step, hint}]
 */
export function buildForm(fields, values = {}, refs = {}) {
  const form = h('div', { class: 'form-grid' });
  const inputs = {};

  for (const f of fields) {
    const id = 'f_' + f.name;
    let input;

    if (f.type === 'bool') {
      input = h('input', { type: 'checkbox', id, checked: !!values[f.name] });
      form.append(h('div', { class: 'form-check' }, input, h('label', { for: id, text: tl(f.label) })));
    } else if (f.type === 'select') {
      input = h('select', { id },
        ...(f.options || []).map((o) => h('option', {
          value: o.value, selected: String(values[f.name] ?? '') === String(o.value),
          text: tl(o.label),
        })));
      form.append(fieldWrap(f, input));
    } else if (f.type === 'image') {
      // Rasm: fayl yuklash + URL + ko'rinish
      const prev = h('div', { class: 'prev' });
      const url = h('input', { type: 'text', placeholder: '/uploads/... yoki https://...' });
      const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });

      const setPrev = (src) => {
        prev.replaceChildren();
        if (src) prev.style.backgroundImage = `url(${src})`;
        else prev.style.backgroundImage = '';
        prev.append(h('span', { text: '🖼' }));
      };
      setPrev(values[f.name] || '');

      url.value = values[f.name] || '';
      url.addEventListener('input', () => setPrev(url.value.trim()));
      file.addEventListener('change', () => {
        const f2 = file.files[0];
        if (!f2) return;
        if (f2.size > 4 * 1024 * 1024) { toast('Rasm 4 MB dan katta', 'err'); return; }
        const reader = new FileReader();
        reader.onload = () => { setPrev(reader.result); };
        reader.readAsDataURL(f2);
      });

      const box = h('div', { class: 'img-upload' },
        prev,
        h('div', { class: 'col' },
          url,
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-sm', onclick: () => file.click(),
              text: '📤 ' + (getLang() === 'uz' ? 'Fayl tanlash' : 'Выбрать файл') }),
            h('button', { type: 'button', class: 'btn btn-sm',
              onclick: () => { url.value = ''; setPrev(''); }, text: '✕' })),
          file));

      // data URL -> serverga saqlanadi
      box._pendingImage = () => {
        const bg = prev.style.backgroundImage;
        if (bg && bg.startsWith('url("data:')) return bg.slice(5, -2);
        return null;
      };
      form.append(fieldWrap(f, box));
      inputs[f.name] = { _imgBox: box, _imgUrl: url };
      continue;
    } else if (f.type === 'ref') {
      input = h('select', { id });
      fillRef(input, refs[f.ref] || [], {
        filterBy: f.dependsOn || null,
        value: f.dependsOn ? (values[f.dependsOn] ?? '') : '',
        empty: f.required ? null : '—',
      });
      input.value = String(values[f.name] ?? '');
      form.append(fieldWrap(f, input));
      if (f.hint) input.parentElement.append(h('div', { class: 'hint', text: tl(f.hint) }));
    } else {
      // text, number, money, int, date, textarea, password va h.k.
      const inputType = f.type === 'money' ? 'number' : f.type === 'int' ? 'number' : f.type === 'number' ? 'number'
        : f.type === 'date' ? 'date' : f.type === 'textarea' ? 'textarea'
        : f.type === 'password' ? 'password' : 'text';
      input = h(inputType === 'textarea' ? 'textarea' : 'input', {
        id, type: inputType === 'textarea' ? null : inputType,
        step: f.step || (f.type === 'int' ? '1' : f.type === 'money' ? '0.01' : 'any'),
        rows: f.type === 'textarea' ? 3 : null,
        value: values[f.name] ?? '',
        placeholder: f.hint ? tl(f.hint) : '',
      });
      form.append(fieldWrap(f, input));
      // Parol maydoniga ko'rsatish/yashirish tugmasi
      if (f.type === 'password') attachPasswordToggle(input);
    }
    inputs[f.name] = input;
  }

  function collect() {
    const out = {};
    for (const f of fields) {
      const el = inputs[f.name];
      if (f.type === 'image') out[f.name] = el._imgUrl.value.trim();
      else if (f.type === 'bool') out[f.name] = el.checked;
      else if (f.type === 'number' || f.type === 'money' || f.type === 'int') {
        out[f.name] = el.value === '' ? 0 : Number(el.value);
      } else if (f.type === 'ref') {
        out[f.name] = el.value === '' ? null : Number(el.value);
      } else if (f.type === 'select') {
        out[f.name] = el.value === '' ? null : el.value;
      } else out[f.name] = el.value;
    }
    return out;
  }

  /** Rasm tanlangan (data URL) bo'lsa — serverga saqlanadi */
  function pendingImage() {
    for (const f of fields) {
      if (f.type !== 'image') continue;
      const data = inputs[f.name]._imgBox._pendingImage();
      if (data) return data;
    }
    return null;
  }

  // Kaskadli ro'yxatlar: ombor o'zgarganda xona (va h.k.) tozalanadi
  for (const f of fields) {
    if (f.type !== 'ref' || !f.dependsOn) continue;
    const parent = inputs[f.dependsOn];
    const sel = inputs[f.name];
    if (!parent || !sel) continue;
    sel._refSpec = { ref: f.ref, filterBy: f.dependsOn, required: !!f.required };
    parent.addEventListener('change', () => {
      fillRef(sel, refs[f.ref] || [], {
        filterBy: f.dependsOn, value: parent.value, keep: true, empty: f.required ? null : '—',
      });
    });
  }

  // Nomi yozilganda Kod avtomatik to'ldiriladi (qo'lda o'zgartirilmagan bo'lsa)
  if (inputs.code && inputs.name_uz) {
    let codeTouched = false;
    inputs.code.addEventListener('input', () => { codeTouched = true; });
    inputs.name_uz.addEventListener('input', () => {
      if (codeTouched) return;
      inputs.code.value = slugCode(inputs.name_uz.value);
    });
  }

  /** Ismdan kod yasash: "Asosiy xona" -> "ASOSIY-XONA" */
  function slugCode(s) {
    const map = {
      'а':'A','б':'B','в':'V','г':'G','д':'D','е':'E','ё':'YO','ж':'J','з':'Z','и':'I','й':'Y',
      'к':'K','л':'L','м':'M','н':'N','о':'O','п':'P','р':'R','с':'S','т':'T','у':'U','ф':'F',
      'х':'X','ц':'TS','ч':'CH','ш':'SH','щ':'SH','ъ':'','ы':'I','ь':'','э':'E','ю':'YU','я':'YA',
      'қ':'Q','ғ':'G','ҳ':'H','ў':'O','ң':'N',
    };
    return s
      .toLowerCase()
      .split('').map((ch) => map[ch] !== undefined ? map[ch] : ch).join('')
      .replace(/[’‘`']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toUpperCase();
  }

  function validate() {
    for (const f of fields) {
      if (f.type === 'image') continue;
      if (f.required && !inputs[f.name].value) {
        inputs[f.name].classList.add('invalid');
        inputs[f.name].focus();
        toast('«' + tl(f.label) + '» — ' + t('required_field'), 'err');
        return false;
      }
    }
    return true;
  }
  function setValues(v) {
    for (const f of fields) {
      const el = inputs[f.name];
      if (!el) continue;
      if (f.type === 'image') {
        el._imgUrl.value = v[f.name] ?? '';
        el._imgBox.querySelector('.prev').style.backgroundImage = v[f.name] ? `url(${v[f.name]})` : '';
      } else if (f.type === 'bool') el.checked = !!v[f.name];
      else el.value = v[f.name] ?? '';
    }
  }

  return { form, inputs, collect, validate, setValues, pendingImage };
}

function fieldWrap(f, input) {
  const wide = f.type === 'textarea' || f.type === 'password';
  return h('div', { class: 'form-field' + (wide ? ' span2' : '') },
    h('label', { for: input.id },
      tl(f.label), f.required ? h('span', { class: 'req', text: '*' }) : null),
    input
  );
}

// ------------------------------------------------------------------ PAROL KO'RSATISH

const EYE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

/**
 * Parol maydoniga "ko'rsatish / yashirish" tugmasi (👁) qo'shadi.
 * Input avval DOM'ga qo'yilgan bo'lishi kerak (aks holda o'rov buziladi).
 * @param {HTMLInputElement} input
 * @returns {{ setVisible: (v: boolean) => void, update: () => void } | null}
 */
export function attachPasswordToggle(input) {
  if (!input) return null;
  const prev = input._pwToggle;
  if (prev && prev.wrap.contains(input)) return prev;   // allaqachon o'ralgan
  if (prev) prev.wrap.remove();                          // eski o'rovni tozalash

  const origType = input.type || 'password';
  const wrap = h('div', { class: 'pw-wrap' });
  const parent = input.parentElement;
  if (parent) parent.insertBefore(wrap, input);
  else console.warn('[pw] parol maydoni DOM ga qo‘shilmasdan toggle qo‘shildi');
  wrap.append(input);

  const btn = h('button', { type: 'button', class: 'pw-eye', 'aria-pressed': 'false' });
  wrap.append(btn);

  function setVisible(v) {
    input.type = v ? 'text' : origType;
    btn.innerHTML = v ? EYE_OFF_ICON : EYE_ICON;
    btn.setAttribute('aria-pressed', v ? 'true' : 'false');
    update();
  }

  /** Til almashganda sarlavhani yangilash */
  function update() {
    const label = input.type === 'password' ? t('show_password') : t('hide_password');
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  btn.addEventListener('click', () => setVisible(input.type === origType));
  setVisible(false);

  input._pwToggle = { setVisible, update, btn, wrap };
  return input._pwToggle;
}

// ------------------------------------------------------------------ jadval

/**
 * DataTable: serverdan kelgan qatorlar + ustunlar
 * columns: [{key, title, align, width, render(row), cls(row)}]
 */
export function dataTable({ columns, rows, empty, onRowClick, rowCls, maxHeight }) {
  const thead = h('thead', {},
    h('tr', {}, ...columns.map((c) =>
      h('th', { style: { textAlign: c.align || 'left', width: c.width || null } },
        c.title + (c.sortable ? ' ⇅' : '')))));
  const tbody = h('tbody');
  const list = rows || [];

  if (!list.length) {
    tbody.append(h('tr', {}, h('td', { colspan: columns.length, class: 'empty', text: empty || t('no_data') })));
  } else {
    list.forEach((row, i) => {
      const tr = h('tr', {
        class: (onRowClick ? 'clickable ' : '') + (rowCls ? rowCls(row) : ''),
        onclick: onRowClick ? () => onRowClick(row, i) : null,
      }, ...columns.map((c) => {
        const val = c.render ? c.render(row, i) : row[c.key];
        const td = h('td', { style: { textAlign: c.align || 'left' } });
        if (val === null || val === undefined) td.textContent = '';
        else if (val.nodeType) td.append(val);
        else td.textContent = String(val);
        if (c.cls) { const cc = c.cls(row); if (cc) td.className = cc; }
        return td;
      }));
      tbody.append(tr);
    });
  }
  return h('div', { class: 'table-wrap', style: maxHeight ? { maxHeight: maxHeight + 'px' } : null },
    h('table', { class: 'grid' }, thead, tbody));
}

// ------------------------------------------------------------------ sahifa

export function pageHead(title, subtitle, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', {},
      h('h1', { text: title }),
      subtitle ? h('div', { class: 'page-sub', text: subtitle }) : null
    ),
    h('div', { class: 'page-actions' }, ...actions.filter(Boolean))
  );
}

export function btn(label, opts = {}) {
  return h('button', {
    class: 'btn ' + (opts.cls || ''), onclick: opts.onClick, title: opts.title, type: 'button',
  }, opts.icon ? h('span', { class: 'ico', text: opts.icon }) : null, label);
}

export function iconBtn(icon, title, onClick) {
  return h('button', { class: 'icon-btn', title, onclick: onClick, type: 'button', text: icon });
}

export function spinner() {
  return h('div', { class: 'spinner-wrap' }, h('div', { class: 'spinner' }), h('span', { text: t('loading') }));
}

export function statusBadge(status) {
  const map = { DRAFT: 'st-draft', POSTED: 'st-posted', CANCELLED: 'st-cancel' };
  const key = status === 'DRAFT' ? 'st_draft' : status === 'POSTED' ? 'st_posted' : 'st_cancelled';
  return h('span', { class: 'badge ' + (map[status] || ''), text: t(key) });
}

export function card(title, ...content) {
  return h('div', { class: 'card' },
    title ? h('div', { class: 'card-head' }, h('span', { text: title })) : null,
    h('div', { class: 'card-body' }, ...content.filter(Boolean)));
}

export function kpi(label, value, sub, cls) {
  return h('div', { class: 'kpi ' + (cls || '') },
    h('div', { class: 'kpi-label', text: label }),
    h('div', { class: 'kpi-value', text: value }),
    sub ? h('div', { class: 'kpi-sub', text: sub }) : null
  );
}

export { h };
