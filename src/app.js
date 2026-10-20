'use strict';
/**
 * CRS — ilova yadrosi (platformaga bog'liq emas).
 *
 * `handle(req, res)` — Node.js http uchun umumiy request handler.
 * Ishlatiladi:
 *   • src/server.js  — lokal ishga tushirish (createServer + listen)
 *   • api/index.js   — Vercel serverless function
 *
 * Statik fayllar (public/) platforma tomonidan beriladi (Vercel `public`).
 * Shuning uchun bu yerda faqat /api/* route'lar va /uploads/ qayta beriladi.
 */
const path = require('node:path');
const fs = require('node:fs');
const { Router, readBody, sendJson, sendError, serveStatic, HttpError } = require('./lib/http');
const db = require('./db');
const system = require('./api/system');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** Dastur bir marta ishga tushadi (warm instance). */
let ready = null;

function buildRouter() {
  const router = new Router();
  system.register(router);
  require('./api/warehouse').register(router);
  require('./api/plan').register(router);
  require('./api/catalogs').register(router);
  require('./api/documents').register(router);
  require('./api/registers').register(router);
  require('./api/reports').register(router);

  router.get('/api/health', async () => ({
    ok: true,
    time: new Date().toISOString(),
    storage: db.isRemote() ? 'turso' : 'local',
  }), { auth: false });

  return router;
}

/** Baza va router tayyor bo'lishini kutiladi (bir marta) */
function init() {
  if (!ready) ready = db.init().then(() => buildRouter());
  return ready;
}

/** Umumiy request handler */
async function handle(req, res) {
  try {
    await init();
  } catch (err) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: false,
      error: { message: 'Baza tayyor emas: ' + (err.message || err) },
    }));
  }

  const router = await ready;
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // --- CORS / OPTIONS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // --- Rasmlar (serverlessda vaqtincha faylga yoziladi)
  if (pathname.startsWith('/uploads/')) {
    const UPLOADS = process.env.OMBOR_UPLOADS || path.join(db.DATA_DIR, 'uploads');
    fs.mkdirSync(UPLOADS, { recursive: true });
    if (serveStatic(UPLOADS, pathname.slice('/uploads'.length), res)) return;
    res.writeHead(404).end('404');
    return;
  }

  // --- SPA fallback (faqat lokal server uchun; Vercel'da public/ o'zi beradi)
  if (!pathname.startsWith('/api/')) {
    if (process.env.VERCEL) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404');
    }
    if (serveStatic(PUBLIC_DIR, pathname, res)) return;
    if (req.method === 'GET' && !path.extname(pathname)) {
      if (serveStatic(PUBLIC_DIR, '/index.html', res)) return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 — topilmadi / не найдено');
  }

  const match = router.match(req.method, pathname);
  if (!match) return sendJson(res, 404, { ok: false, error: { message: 'API topilmadi / Не найдено: ' + pathname } });

  const { route, params } = match;

  try {
    // --- Autentifikatsiya
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const token = bearer
      || url.searchParams.get('token')
      || (req.headers['x-token'] ? String(req.headers['x-token']) : null);
    const session = token ? system.readSession(token) : null;

    if (route.auth && !session) {
      return sendJson(res, 401, {
        ok: false,
        error: { message: 'Tizimga kiring / Требуется вход', code: 'UNAUTHORIZED' },
      });
    }

    const user = session
      ? await db.get(
          `SELECT id, login, full_name, role, warehouse_id, employee_id, allowed_features
             FROM users WHERE id=?`, session.userId)
      : null;

    // Rol + lavozim huquqlari (har doim hisoblanadi)
    if (user) user._perms = await system.permsOf(user);

    // Rol tekshiruvi: role mos kelsa yoki lavozim "*" huquqini bersa
    if (route.roles) {
      const byRole = session && route.roles.includes(session.role);
      const byPosition = user && user._perms && user._perms.includes('*');
      if (!byRole && !byPosition) {
        return sendJson(res, 403, {
          ok: false,
          error: { message: 'Bu amal uchun huquqingiz yo‘q / Недостаточно прав' },
        });
      }
    }

    const body = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const query = Object.fromEntries(url.searchParams.entries());

    const result = await route.handler({ req, res, params, query, body, user, session, token });

    if (res.headersSent || result === null) return;   // javob allaqachon yuborilgan
    return sendJson(res, 200, { ok: true, data: result });
  } catch (err) {
    if (res.headersSent) { try { res.end(); } catch { /* noop */ } return; }
    if (err instanceof HttpError) return sendError(res, err);

    const msg = String(err?.message || '');
    const status = /not unique|UNIQUE constraint/i.test(msg) ? 409
      : /FOREIGN KEY|CHECK constraint/i.test(msg) ? 400
      : 500;
    if (status >= 500) {
      console.error(`\n[500] ${req.method} ${pathname}`);
      console.error('       ' + (err?.stack || msg).split('\n').slice(0, 4).join('\n       '));
    }
    return sendJson(res, status, {
      ok: false,
      error: {
        message: status === 409 ? 'Bu qiymat allaqachon mavjud / Такое значение уже существует'
          : status === 400 ? 'Ma’lumot mos kelmadi / Некорректные данные: ' + msg
          : 'Server xatosi / Ошибка сервера',
        code: err?.code || null,
        detail: status >= 500 ? msg : undefined,
      },
    });
  }
}

module.exports = { handle, init, PUBLIC_DIR };