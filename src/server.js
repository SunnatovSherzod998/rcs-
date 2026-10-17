'use strict';
/**
 * CRS — server
 * 1C uslubidagi katta omboralarni boshqarish tizimi
 * Ishga tushirish:  npm start   (yoki: node src/server.js)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Router, readBody, sendJson, sendError, serveStatic, forbidden, HttpError } = require('./lib/http');
const db = require('./db');
const system = require('./api/system');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

db.init();

// ------------------------------------------------------------ Router yig'ish

const router = new Router();

// Ochiq route'lar (auth: false) — login'dan tashqari
system.register(router);
require('./api/warehouse').register(router);
require('./api/plan').register(router);
require('./api/catalogs').register(router);
require('./api/documents').register(router);
require('./api/registers').register(router);
require('./api/reports').register(router);

// Tezkor "sog'lomlik" tekshiruvi
router.get('/api/health', () => ({ ok: true, time: new Date().toISOString() }), { auth: false });

// ------------------------------------------------------------ Server

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Credentials': 'true',
    });
    return res.end();
  }

  // CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!pathname.startsWith('/api/')) {
    // Tovarlar rasmlari
    if (pathname.startsWith('/uploads/')) {
      const UPLOADS = path.join(__dirname, '..', 'data', 'uploads');
      fs.mkdirSync(UPLOADS, { recursive: true });
      if (serveStatic(UPLOADS, pathname.slice('/uploads'.length), res)) return;
      res.writeHead(404).end('404');
      return;
    }
    // SPA fallback
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
    // Autentifikatsiya
    let session = null;
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const token = bearer || url.searchParams.get('token') || (req.headers['x-token'] ? String(req.headers['x-token']) : null);
    if (token) session = system.readSession(token);

    if (route.auth && !session) {
      return sendJson(res, 401, { ok: false, error: { message: 'Tizimga kiring / Требуется вход', code: 'UNAUTHORIZED' } });
    }
    const user = session
      ? (() => {
        const u = db.get('SELECT id, login, full_name, role, warehouse_id, employee_id, allowed_features FROM users WHERE id=?', session.userId);
        if (u) u._perms = system.permsOf(u);   // rol + lavozim huquqlari
        return u;
      })()
      : null;

    // Rol tekshiruvi: role mos kelsa yoki lavozim "*" huquqini bersa
    if (route.roles) {
      const byRole = session && route.roles.includes(session.role);
      const byPosition = user && user._perms && user._perms.includes('*');
      if (!byRole && !byPosition) {
        return sendJson(res, 403, { ok: false, error: { message: 'Bu amal uchun huquqingiz yo‘q / Недостаточно прав' } });
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
    const status = /not unique|UNIQUE constraint/i.test(err.message) ? 409
      : /FOREIGN KEY|CHECK constraint/i.test(err.message) ? 400
      : 500;
    if (status >= 500) {
      console.error(`\n[500] ${req.method} ${pathname}`);
      console.error('       ' + (err.stack || err.message).split('\n').slice(0, 4).join('\n       '));
    }
    return sendJson(res, status, {
      ok: false,
      error: {
        message: status === 409 ? 'Bu qiymat allaqachon mavjud / Такое значение уже существует'
          : status === 400 ? 'Ma’lumot mos kelmadi / Некорректные данные: ' + err.message
          : 'Server xatosi / Ошибка сервера',
        code: err.code || null,
        detail: status >= 500 ? String(err.message) : undefined,
      },
    });
  }
});

server.listen(PORT, HOST, () => {
  const base = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   CRS  ·  Ombor boshqaruv tizimi                    ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log(`   Server:    ${base}`);
  console.log(`   Ma'lumot:  ${db.DB_FILE}`);
  console.log(`   Node.js:   ${process.version}`);
  console.log('');
  console.log('   Login:  admin  /  admin');
  console.log('   >>> Brauzerda oching:', base);
  console.log('');
});

function shutdown(sig) {
  console.log(`\n[${sig}] server to'xtatilmoqda...`);
  server.close(() => { try { db.db.close(); } catch { /* noop */ } process.exit(0); });
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => console.error('[UNCAUGHT]', e));
process.on('unhandledRejection', (e) => console.error('[UNHANDLED]', e));

module.exports = server;
