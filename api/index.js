/**
 * Vercel Serverless Function — barcha /api/* route'lar.
 *
 * Vercel `api/` papkasidagi `.js` fayllarini avtomatik funksiya sifatida
 * topadi. `public/` papkasi esa statik fayl sifatida avtomatik beriladi.
 */
const { handle } = require('../src/app');

module.exports = async function handler(req, res) {
  try {
    await handle(req, res);
  } catch (err) {
    console.error('[FATAL]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    try {
      res.end(JSON.stringify({
        ok: false,
        error: { message: 'Server xatosi / Ошибка сервера', detail: String(err?.message || err) },
      }));
    } catch { /* noop */ }
  }
};
