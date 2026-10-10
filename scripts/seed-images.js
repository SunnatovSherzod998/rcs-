'use strict';
/**
 * Tovarlarga demo rasmlar yuklash.
 * Har bir kategoriya uchun SVG rasm yaratadi (tarmoqsiz, serverga).
 */
const BASE = process.env.BASE || 'http://localhost:3000';
let token = '';

async function api(m, p, b) {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${m} ${p} -> ${r.status} ${j?.error?.message || ''}`);
  return j.data;
}

/** Kategoriya uchun chizilgan SVG rasm (data URL) */
function makeImage(label, bg, fg, icon) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/>
  </linearGradient></defs>
  <rect width="200" height="200" rx="14" fill="url(#g)"/>
  <rect x="8" y="8" width="184" height="184" rx="10" fill="none" stroke="${fg}" stroke-opacity=".25" stroke-width="2"/>
  <text x="100" y="88" font-size="64" text-anchor="middle">${icon}</text>
  <text x="100" y="130" font-size="17" font-weight="bold" text-anchor="middle" fill="${fg}">${label}</text>
  <text x="100" y="152" font-size="11" text-anchor="middle" fill="${fg}" fill-opacity=".7">CRS</text>
</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

const THEME = {
  'Электроника':   ['#e8f0f8', '#1f4e79', '📺'],
  'Бытовая техника':['#e4f5ec', '#1a7f4b', '🔌'],
  'Строительство': ['#fdf3e0', '#8a5a00', '🧱'],
  'Одежда':        ['#f3ecf8', '#5b3f8a', '👕'],
  'Медикаменты':   ['#fbe6e5', '#a8322a', '💊'],
};

(async () => {
  const d = await api('POST', '/api/auth/login', { login: 'admin', password: 'admin' });
  token = d.token;
  console.log('OK Kirildi');

  const cats = await api('GET', '/api/catalogs/categories/options?limit=200');
  const products = (await api('GET', '/api/catalogs/products?limit=500')).rows;

  let n = 0;
  for (const p of products) {
    const catName = p.category_id ? fn(cats.find((c) => c.id === p.category_id)) : null;
    const theme = THEME[catName] || ['#eef1f5', '#33475b', '📦'];
    const label = (p.sku || '').slice(0, 12);
    const image = makeImage(label, theme[0], theme[1], theme[2]);
    try {
      const r = await api('POST', '/api/plan/upload', { image, product_id: p.id });
      await api('PUT', `/api/catalogs/products/${p.id}`, { image_url: r.url });
      n++;
      process.stdout.write(`\r  yuklandi: ${n}/${products.length}   `);
    } catch (e) {
      console.log(`\n  ${p.sku}: ${e.message}`);
    }
  }
  console.log(`\n  Jami: ${n} tovar rasmi yuklandi\n`);
})().catch((e) => { console.error('XATO:', e.message); process.exit(1); });

function fn(c) {
  if (!c) return null;
  return c.name_ru;
}
