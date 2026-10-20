'use strict';
/**
 * Parol siyosatini serverda qo'llash.
 *
 * Manba bitta: public/js/password.mjs (brauzer bilan bir xil qoidalar).
 * Node CommonJS muhitida ESM faylni `import()` orqali yuklaymiz
 * (sinxron `require` ESM'ni qo'llamaydi).
 */
const { bad } = require('./http');

let mod = null;

/** Siyosat moduli (bitta marta yuklanadi) */
async function policy() {
  if (!mod) mod = await import('../../public/js/password.mjs');
  return mod;
}

/**
 * Parolni siyosat bo'yicha tekshiradi.
 * Xato bo'lsa 400 (bad request) xatosi bilan to'xtatadi.
 * @returns {Promise<object>} tahlil natijasi
 */
async function assertPassword(password) {
  const { analyzePassword } = await policy();
  const r = analyzePassword(password);
  if (!r.ok) throw bad(`${r.uz} / ${r.ru}`, r.code);
  return r;
}

module.exports = { assertPassword, policy };
