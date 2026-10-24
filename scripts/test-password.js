'use strict';
/**
 * Parol siyosati testlari / Тесты политики пароля
 *
 *   node scripts/test-password.js
 *
 * Tekshiriladi:
 *   • public/js/password.mjs  — siyosatning yagona manbai
 *   • src/lib/password.js     — serverda qo'llanilishi (400 xatosi)
 */
const path = require('node:path');

const POLICY_URL = new URL('../public/js/password.mjs', `file://${__filename}`).href;

let fail = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  OK   ' + msg); return true; }
  fail++;
  console.error('  FAIL ' + msg);
  return false;
};

(async () => {
  const { analyzePassword } = await import(POLICY_URL);
  const { assertPassword } = require(path.join(__dirname, '..', 'src', 'lib', 'password.js'));

  console.log('\n== Siyosat qoidalari ==');

  const cases = [
    ['', 'PW_EMPTY', 'bo‘sh parol'],
    ['admin', 'PW_SHORT', 'juda qisqa parol (5 belgi)'],
    ['1234567890', 'PW_SHORT', '10 belgili parol'],
    ['123456789012', 'PW_ONLY_DIGITS', 'faqat sonlardan iborat'],
    ['a1b2c3d45678', 'PW_UPPERCASE', 'katta harfsiz'],
    ['a1b2c3d4e5f6', 'PW_UPPERCASE', 'faqat kichik harflar bilan'],
    ['A1b2C3d45678', 'PW_OK', 'aralash katta/kichik harflar'],
    ['aB2c3D456789', 'PW_OK', 'aralash harflar'],
    ['A1B2C3D45678', 'PW_OK', '8 son + 4 katta harf (12 belgi)'],
    ['12345678ABCD', 'PW_OK', '8 son + 4 katta harf'],
    ['A1B2C3D456789', 'PW_OK', '9 son + 4 katta harf (13 belgi)'],
    ['1234567890AB', 'PW_COMPOSITION', '10 son + 2 harf (sonlar ko‘p)'],
    ['A1B2C3D4EFGH', 'PW_COMPOSITION', 'harflar ko‘p'],
    ['A1B2C3D4567!', 'PW_COMPOSITION', '7 son + 4 harf + 1 belgi'],
  ];

  for (const [pw, code, note] of cases) {
    const r = analyzePassword(pw);
    ok(r.code === code,
      `"${pw}" (${pw.length} belgi) → ${code} (${note})` + (r.code === code ? '' : ` / oldi: ${r.code}`));
  }

  console.log('\n== Boshqa til va matn ==');
  const r = analyzePassword('A1B2C3D45678');
  ok(r.ok === true, 'mashhur parol qabul qilinadi');
  ok(typeof r.uz === 'string' && r.uz.length > 10, 'o‘zbekcha xabar bor');
  ok(typeof r.ru === 'string' && r.ru.length > 10, 'ruscha xabar bor');
  ok(r.digits === 8 && r.others === 4, 'barcha belgilar hisoblandi');
  ok(r.minDigits === 8 && r.maxDigits === 9, '12 belgi uchun ruxsat: 8–9 son');

  console.log('\n== Server tomoni (400 xatosi) ==');
  let code = null;
  try { await assertPassword('123456789012'); } catch (e) { code = e.code; }
  ok(code === 'PW_ONLY_DIGITS', 'server "faqat sonlar" uchun 400 qaytaradi');

  code = null;
  try { await assertPassword('short'); } catch (e) { code = e.code; }
  ok(code === 'PW_SHORT', 'server qisqa parol uchun 400 qaytaradi');

  code = null;
  try { await assertPassword('a1b2c3d45678'); } catch (e) { code = e.code; }
  ok(code === 'PW_UPPERCASE', 'server katta harfsiz parol uchun 400 qaytaradi');

  let thrown = null;
  try { await assertPassword('A1B2C3D45678'); } catch (e) { thrown = e; }
  ok(thrown === null, 'server to‘g‘ri parolni qabul qiladi');

  thrown = null;
  try { await assertPassword('A1b2C3d45678'); } catch (e) { thrown = e; }
  ok(thrown === null, 'server aralash katta/kichik harfli parolni qabul qiladi');

  console.log(fail ? `\n${fail} ta xato\n` : '\nParol siyosati to‘g‘ri\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
