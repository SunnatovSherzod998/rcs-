'use strict';
/**
 * Minimal HTTP qatlami: router, JSON body, statik fayllar, sessiya.
 * Tashqi paketlarsiz (Express o'rniga).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { verifyPassword } = require('./crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}
const bad = (msg, code) => new HttpError(400, msg, code);
const notFound = (msg = 'Topilmadi / Не найдено') => new HttpError(404, msg);
const forbidden = (msg = 'Ruxsat yo‘q / Нет прав') => new HttpError(403, msg);

class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const rx = new RegExp(
      '^' + pattern.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })
        .replace(/\*/g, '(.*)') + '/?$'
    );
    this.routes.push({ method, rx, keys, handler, auth: opts.auth !== false, roles: opts.roles || null });
    return this;
  }
  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  put(p, h, o) { return this.add('PUT', p, h, o); }
  del(p, h, o) { return this.add('DELETE', p, h, o); }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.rx.exec(pathname);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  }
}

function readBody(req, limitBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new HttpError(413, 'Fayl hajmi katta / Файл слишком большой'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = req.headers['content-type'] || '';
      try {
        if (ct.includes('application/json')) return resolve(JSON.parse(raw));
        resolve({ _raw: raw });
      } catch {
        reject(bad('JSON formati noto‘g‘ri / Неверный JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload ?? null), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error('[ERROR]', err);
  sendJson(res, status, {
    ok: false,
    error: {
      message: err.message || 'Server xatosi / Ошибка сервера',
      code: err.code || null,
    },
  });
}

function serveStatic(root, urlPath, res) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.join(root, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(path.resolve(root))) { res.writeHead(403).end('Forbidden'); return true; }
  let stat;
  try { stat = fs.statSync(filePath); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

module.exports = { Router, HttpError, readBody, sendJson, sendError, serveStatic, bad, notFound, forbidden, verifyPassword, MIME };
