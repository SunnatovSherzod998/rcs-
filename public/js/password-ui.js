/**
 * Parol maydoni uchun "jonli tekshiruv" (живая проверка).
 * Kiritilayotgan parol siyosatga mosligini darhol ko'rsatadi.
 */
import { h } from './ui.js';
import { getLang } from './i18n.js';
import { analyzePassword, passwordMessage, MIN_LENGTH, DIGIT_TARGET, OTHER_TARGET } from './password.mjs';

/**
 * input maydoniga ro'yxat (checklist) va holat qatori qo'shadi.
 * @returns {{ el: HTMLElement, update: () => void, result: () => object }}
 */
export function attachPasswordMeter(input, opts = {}) {
  const lang = () => (opts.lang || getLang());
  const list = h('div', { class: 'pw-list' });
  const status = h('div', { class: 'pw-status' });
  const el = h('div', { class: 'pw-meter' }, list, status);

  const field = input.closest('.form-field') || input.parentElement;
  (field || input).append(el);

  const items = new Map();

  function update() {
    const r = analyzePassword(input.value);
    const L = lang();

    // ro'yxatni yangila
    const wanted = r.checks.map((c) => c.code);
    for (const code of wanted) {
      if (!items.has(code)) {
        const ico = h('span', { class: 'pw-ico', text: '•' });
        const txt = h('span', { class: 'pw-txt' });
        const row = h('div', { class: 'pw-item' }, ico, txt);
        items.set(code, { row, ico, txt });
        list.append(row);
      }
    }
    for (const c of r.checks) {
      const it = items.get(c.code);
      it.txt.textContent = L === 'ru' ? c.ru : c.uz;
      it.row.classList.toggle('ok', c.ok === true);
      it.row.classList.toggle('bad', c.ok === false);
      it.ico.textContent = c.ok === true ? '✓' : c.ok === false ? '✕' : '•';
    }

    // holat qatori
    if (r.empty) {
      status.textContent = L === 'ru'
        ? `Минимум ${MIN_LENGTH} символов, хотя бы одна заглавная буква, ${Math.round(DIGIT_TARGET * 100)}% цифр и ${Math.round(OTHER_TARGET * 100)}% букв/символов`
        : `Kamida ${MIN_LENGTH} ta belgi, kamida bitta katta harf, ${Math.round(DIGIT_TARGET * 100)}% son va ${Math.round(OTHER_TARGET * 100)}% harf/belgi`;
      status.className = 'pw-status';
    } else if (r.ok) {
      status.textContent = passwordMessage(r, L);
      status.className = 'pw-status ok';
    } else {
      status.textContent = passwordMessage(r, L);
      status.className = 'pw-status bad';
    }

    input.classList.toggle('invalid', !r.ok && !r.empty);
    return r;
  }

  input.addEventListener('input', update);
  input.addEventListener('blur', update);
  update();

  return { el, update, result: () => analyzePassword(input.value) };
}

/**
 * Maydon qiymatini siyosat bo'yicha tekshiradi.
 * Xato bo'lsa { ok:false, message } qaytaradi.
 */
export function checkPasswordField(input) {
  const r = analyzePassword(input.value);
  if (r.ok) return { ok: true, result: r };
  return { ok: false, result: r, message: passwordMessage(r, getLang()) };
}
