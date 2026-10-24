'use strict';
/**
 * Qolgan xatolarni tuzatadi — har biri tekshirilgan.
 *  1) `async ((ctx) =>`  ->  `async (ctx) =>`
 *  2) `const X = ((((((await c);`  ->  to'g'ri SQL bilan
 *  3) `}));`  ->  `}));` (route yopilishi)
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : e.name.endsWith('.js') && out.push(p);
  }
  return out;
}

const SRC = path.join(ROOT, 'src');

/** 1) qo'shimcha qavsni olib tashlash */
function fixExtraParen(src) {
  return src.replace(/async\s*\(\s*\((ctx)\)\s*=>/g, 'async ($1) =>')
    .replace(/\(\s*\(\(ctx\)\s*=>/g, '((ctx) =>');
}

/** 2) buzilgan `await c` qatorlarini tiklash */
const BROKEN = [
  ['src/api/plan.js',
    /const n = \(\(\(\(\(\(await c\) \+ 1;/,
    "const n = (await get(`SELECT COUNT(*) AS c FROM catalog_racks WHERE room_id = ? AND is_active = 1`, roomId)).c + 1;"],
  ['src/api/warehouse.js',
    /const withoutLocation = \(\(\(\(\(\(\(await c\);/,
    "const withoutLocation = (await get(`SELECT COUNT(*) AS c FROM catalog_locations WHERE warehouse_id = ? AND is_active = 1 AND location_id IS NULL`, warehouseId)).c;"],
  ['src/api/documents.js',
    /const total = \(\(\(\(\(\(await c\);/,
    "const total = (await get(`SELECT COUNT(*) AS c FROM documents d\n        LEFT JOIN catalog_warehouses w ON w.id=d.warehouse_id\n        LEFT JOIN catalog_counterparties cp ON cp.id=d.counterparty_id ${w}`, ...params)).c;"],
  ['src/api/registers.js',
    /const total = \(\(\(\(\(\(await c\);/,
    "const total = (await get(`SELECT COUNT(*) AS c FROM reg_stock_balances b JOIN catalog_products p ON p.id = b.product_id WHERE 1=1 ${w}`, ...params)).c;"],
  ['src/api/reports.js',
    /const c = \(\(\(\(\(\(await c\);/,
    "const c = (await get(`SELECT COUNT(*) AS c FROM catalog_products WHERE is_active = 1 AND is_service = 0`)).c;"],
  ['src/api/system.js',
    /const c = \(\(\(\(\(\(await c\);/,
    "const c = (await get(`SELECT COUNT(*) AS c FROM catalog_products WHERE is_active = 1 AND is_service = 0`)).c;"],
];

for (const rel of ['src/api/registers.js', 'src/api/reports.js', 'src/api/system.js', 'src/api/catalogs.js',
  'src/api/documents.js', 'src/api/plan.js', 'src/api/warehouse.js']) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  let out = fixExtraParen(src);
  for (const [r, rx, to] of BROKEN) {
    if (r === rel) out = out.replace(rx, to);
  }
  if (out !== src) { fs.writeFileSync(file, out, 'utf8'); console.log('OK  ' + rel); }
}

// Tekshiruv
let bad = 0;
for (const file of walk(SRC)) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    const ln = (msg.split('\n').find((l) => l.trim().startsWith('await') || l.includes('SyntaxError')) || '').trim();
    console.log(`XATO ${path.relative(SRC, file)}${m ? ':' + m[1] : ''}  ${ln.slice(0, 76)}`);
  }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad}`);