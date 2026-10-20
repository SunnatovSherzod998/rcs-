'use strict';
/**
 * Vercel serverless function'ni lokal sinov qilish.
 * `api/index.js` ni http server sifatida ishga tushirib, /api/health tekshiradi.
 */
const http = require('node:http');

process.env.PORT = '3999';

const handler = require('../api/index.js');

const server = http.createServer(async (req, res) => {
  await handler(req, res);
});

server.listen(3999, async () => {
  console.log('Serverless function test serveri: http://localhost:3999');
  const get = async (p) => {
    const r = await fetch('http://localhost:3999' + p);
    return { status: r.status, body: await r.text() };
  };
  const post = async (p, body) => {
    const r = await fetch('http://localhost:3999' + p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.text() };
  };

  console.log('\n1) GET /api/health');
  const h = await get('/api/health');
  console.log('  ', h.status, h.body.slice(0, 140));

  console.log('\n2) POST /api/auth/login');
  const l = await post('/api/auth/login', { login: 'admin', password: process.env.ADMIN_PASSWORD || 'ADMIN' });
  console.log('  ', l.status, l.body.slice(0, 120));
  const token = JSON.parse(l.body)?.data?.token;

  console.log('\n3) GET /api/reports/dashboard (token bilan)');
  const d = await get('/api/reports/dashboard?token=' + token);
  console.log('  ', d.status, d.body.slice(0, 120));

  console.log('\n4) GET /api/salary/list');
  const s = await get('/api/salary/list?token=' + token);
  console.log('  ', s.status, s.body.slice(0, 120));

  console.log('\n5) GET /api/my-stats (nodira)');
  const l2 = await post('/api/auth/login', { login: 'nodira', password: '12345' });
  const t2 = JSON.parse(l2.body)?.data?.token;
  const m = await get('/api/my-stats?token=' + t2);
  console.log('  ', m.status, m.body.slice(0, 140));

  console.log('\n6) GET / (static — Vercel beradi)');
  const r = await get('/');
  console.log('  ', r.status, r.body.slice(0, 80).replace(/\n/g, ' '));

  server.close();
  process.exit(0);
});