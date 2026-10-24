/**
 * PAROL SIYOSATI / ПОЛИТИКА ПАРОЛЯ — yagona manba.
 *
 * Bu fayl ikkala tomon uchun ishlatiladi:
 *   • brauzer:  import { analyzePassword } from './password.mjs'
 *   • server:   await import('../../public/js/password.mjs')  (src/lib/password.js)
 *
 * Qoidalar:
 *   1) kamida 12 ta belgi                    (минимум 12 символов)
 *   2) faqat sonlardan iborat bo'lmasligi    (не только цифры)
 *   3) kamida bitta KATTA harf bo'lishi      (минимум одна заглавная буква)
 *   4) tarkib: ~70% sonlar, ~30% harf va belgilar (±1 belgi)
 *      (состав: ~70% цифр, ~30% букв и символов, допуск ±1 символ)
 */

export const MIN_LENGTH = 12;
export const DIGIT_TARGET = 0.70;   // 70% sonlar / 70% цифр
export const OTHER_TARGET = 0.30;   // 30% harf va belgilar / 30% букв и символов
export const TOLERANCE = 1;         // ±1 belgi / ±1 символ

const RE_DIGIT = /\p{Nd}/u;
const RE_UPPER = /\p{Lu}/u;
const RE_LOWER = /\p{Ll}/u;
const RE_LETTER = /\p{L}/u;

/** Berilgan uzunlik uchun ruxsat etilgan sonlar soni (min, max). */
export function digitBounds(length) {
  const target = length * DIGIT_TARGET;
  return {
    minDigits: Math.max(0, Math.ceil(target) - TOLERANCE),
    maxDigits: Math.min(length, Math.floor(target) + TOLERANCE),
  };
}

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

/**
 * Parolni tahlil qiladi: barcha qoidalar bo'yicha natija.
 * Natija: { ok, code, uz, ru, checks, ... }
 */
export function analyzePassword(password) {
  const value = String(password ?? '');
  const length = value.length;

  let digits = 0, upper = 0, lower = 0, letters = 0;
  for (const ch of value) {
    if (RE_DIGIT.test(ch)) { digits++; continue; }
    if (RE_LETTER.test(ch)) {
      letters++;
      if (RE_UPPER.test(ch)) upper++;
      else if (RE_LOWER.test(ch)) lower++;
    }
  }
  const others = length - digits;               // harf + belgilar
  const symbols = others - letters;             // faqat belgilar
  const { minDigits, maxDigits } = digitBounds(length);
  const minOthers = length - maxDigits;
  const maxOthers = length - minDigits;
  const digitPct = pct(digits, length);
  const otherPct = pct(others, length);

  const empty = length === 0;
  const onlyDigits = !empty && digits === length;
  const hasUpper = upper > 0;                   // kamida bitta katta harf shart
  const hasLower = lower > 0;                   // kichik harflar mumkin
  const compositionOk = empty
    || (digits >= minDigits && digits <= maxDigits);

  const checks = [
    {
      code: 'length',
      ok: empty ? null : length >= MIN_LENGTH,
      uz: `Kamida ${MIN_LENGTH} ta belgi (hozir ${length})`,
      ru: `Минимум ${MIN_LENGTH} символов (сейчас ${length})`,
    },
    {
      code: 'mixed',
      ok: empty ? null : !onlyDigits,
      uz: 'Faqat sonlardan iborat emas',
      ru: 'Не только цифры',
    },
    {
      code: 'upper',
      ok: empty ? null : hasUpper,
      uz: 'Kamida bitta katta harf (A-Z)',
      ru: 'Минимум одна заглавная буква (A-Z)',
    },
    {
      code: 'composition',
      ok: empty ? null : compositionOk,
      uz: `${Math.round(DIGIT_TARGET * 100)}% son / ${Math.round(OTHER_TARGET * 100)}% harf va belgi `
        + `(hozir ${digitPct}% / ${otherPct}%)`,
      ru: `${Math.round(DIGIT_TARGET * 100)}% цифр / ${Math.round(OTHER_TARGET * 100)}% букв и символов `
        + `(сейчас ${digitPct}% / ${otherPct}%)`,
    },
  ];

  const res = {
    password: value, length, digits, letters, upper, lower, symbols, others,
    digitPct, otherPct, minDigits, maxDigits, minOthers, maxOthers,
    empty, onlyDigits, hasUpper, hasLower, compositionOk, checks,
    ok: false, code: 'PW_EMPTY', uz: '', ru: '',
  };

  if (empty) {
    res.uz = 'Parol kiritish shart';
    res.ru = 'Введите пароль';
    return res;
  }
  if (length < MIN_LENGTH) {
    res.code = 'PW_SHORT';
    res.uz = `Parol juda qisqa — kamida ${MIN_LENGTH} ta belgi kerak. Parolni uzunlashtiring.`;
    res.ru = `Пароль слишком короткий — минимум ${MIN_LENGTH} символов. Удлините пароль.`;
    return res;
  }
  if (onlyDigits) {
    res.code = 'PW_ONLY_DIGITS';
    res.uz = 'Parol juda oson — faqat sonlardan iborat. Kamida bitta katta harf va biror belgi qo‘shing.';
    res.ru = 'Пароль слишком простой — только цифры. Добавьте заглавную букву и символ.';
    return res;
  }
  if (!hasUpper) {
    res.code = 'PW_UPPERCASE';
    res.uz = 'Parolda kamida bitta katta harf (A-Z) bo‘lishi kerak.';
    res.ru = 'В пароле должна быть хотя бы одна заглавная буква (A-Z).';
    return res;
  }
  if (!compositionOk) {
    res.code = 'PW_COMPOSITION';
    res.uz = `Parol tarkibi noto‘g‘ri: ${Math.round(DIGIT_TARGET * 100)}% sonlar va `
      + `${Math.round(OTHER_TARGET * 100)}% harf va belgilar kerak (hozir ${digitPct}% / ${otherPct}%). `
      + `${length} belgi uchun ${minDigits}–${maxDigits} son va ${minOthers}–${maxOthers} harf/belgi kerak.`;
    res.ru = `Неверный состав пароля: нужно ${Math.round(DIGIT_TARGET * 100)}% цифр и `
      + `${Math.round(OTHER_TARGET * 100)}% букв и символов (сейчас ${digitPct}% / ${otherPct}%). `
      + `Для ${length} символов нужно ${minDigits}–${maxDigits} цифр и ${minOthers}–${maxOthers} букв/символов.`;
    return res;
  }

  res.ok = true;
  res.code = 'PW_OK';
  res.uz = 'Parol qo‘yilishi mumkin';
  res.ru = 'Пароль можно установить';
  return res;
}

/** Qisqacha alias — server va brauzer bir xarakterda ishlatadi. */
export const validatePassword = analyzePassword;

/** Xabar matni (til bo'yicha). */
export function passwordMessage(result, lang = 'uz') {
  if (!result) return '';
  return lang === 'ru' ? result.ru : result.uz;
}
