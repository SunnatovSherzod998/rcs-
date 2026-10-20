'use strict';
/**
 * Turso bulut bazasi sozlash (Supabase alternativasi).
 *
 * 1) https://turso.tech → DB yarating
 * 2) Token yarating (Dashboard → API Tokens)
 * 3) Quyidagini to'ldiring va ishga tushiring:
 *
 *    $env:TURSO_DATABASE_URL="libsql://your-db-xxx.turso.io"
 *    $env:TURSO_AUTH_TOKEN="eyJ..."
 *    node scripts/turso-setup.js
 *
 * Skript: sxema yaratadi, bazani tozalaydi va test ma'lumotlarini yuklaydi.
 */
const db = require('../src/db');

(async () => {
  if (db.driver() !== 'turso') {
    console.log('✗ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN o‘rnatilmagan.');
    console.log('  .env.example faylini ko‘rib chiqing.\n');
    process.exit(1);
  }

  console.log('Driver:', db.driver());
  console.log('Sxema yaratilmoqda...');
  await db.init();
  console.log('✓ Sxema tayyor');

  const tables = await db.all(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`);
  console.log('Jadvallar:', tables.map((t) => t.table_name).join(', '));

  const users = await db.all('SELECT id, login, role FROM users ORDER BY id');
  console.log('\nFoydalanuvchilar:');
  for (const u of users) console.log(`  #${u.id} ${u.login} (${u.role})`);

  console.log('\n✓ Tayyor. Endi Vercel ga quyidagilarni qo‘shing:');
  console.log('  TURSO_DATABASE_URL = ...');
  console.log('  TURSO_AUTH_TOKEN  = ...');
  db.close();
})().catch((e) => { console.error('XATO:', e.message); process.exit(1); });