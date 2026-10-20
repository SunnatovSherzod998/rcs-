'use strict';
/**
 * CRS — lokal server
 * Ishga tushirish:  npm start   (yoki: node src/server.js)
 *
 * Vercel uchun `api/index.js` foydalaniladi (serverless).
 * Ikkalasi bir xil yadroga (`src/app.js`) murojaat qiladi.
 */
const http = require('node:http');
const { handle, init } = require('./app');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[FATAL]', err);
    if (!res.headersSent) res.writeHead(500);
    try { res.end(); } catch { /* noop */ }
  });
});

init()
  .then(() => {
    server.listen(PORT, HOST, () => {
      const base = `http://localhost:${PORT}`;
      console.log('');
      console.log('  ╔══════════════════════════════════════════════════╗');
      console.log('  ║   CRS  ·  Ombor boshqaruv tizimi                    ║');
      console.log('  ╚══════════════════════════════════════════════════╝');
      console.log(`   Server:    ${base}`);
      console.log(`   Ma'lumot:  ${db.DB_FILE}`);
      console.log(`   Saqlash:   ${db.isRemote() ? 'Turso (bulut)' : 'lokal fayl'}`);
      console.log(`   Node.js:   ${process.version}`);
      console.log('');
      console.log('   Login:  admin  /  admin');
      console.log('   >>> Brauzerda oching:', base);
      console.log('');
    });
  })
  .catch((err) => {
    console.error('[ERROR] Bazani tayyorlash muvaffaqiyatsiz:', err);
    process.exit(1);
  });

function shutdown(sig) {
  console.log(`\n[${sig}] server to'xtatilmoqda...`);
  server.close(() => { try { db.close(); } catch { /* noop */ } process.exit(0); });
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => console.error('[UNCAUGHT]', e));
process.on('unhandledRejection', (e) => console.error('[UNHANDLED]', e));

module.exports = server;