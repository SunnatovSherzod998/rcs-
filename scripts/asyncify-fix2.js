'use strict';
/** Qo'lda aniqlangan tuzatishlar. */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const NODE = process.execPath;

function edit(rel, fn) {
  const file = path.join(ROOT, rel);
  const src = fs.readFileSync(file, 'utf8');
  const out = fn(src);
  if (out !== src) { fs.writeFileSync(file, out, 'utf8'); console.log('OK  ' + rel); }
  else console.log('-   ' + rel + ' (o‘zgarish yo‘q)');
}

// 1) route handler: `async ( async (ctx) =>` -> `async (ctx) =>`
for (const rel of ['src/api/registers.js', 'src/api/reports.js', 'src/api/system.js', 'src/api/catalogs.js',
  'src/api/documents.js', 'src/api/plan.js', 'src/api/warehouse.js']) {
  edit(rel, (s) => s.replace(/async\s*\(\s*async\s*\(/g, 'async ('));
}

// 2) documents.js — buzilgan qator
edit('src/api/documents.js', (s) => s.replace(
  /const total = \(\(\(\(\(\(await c\);/,
  "const total = (await get(`SELECT COUNT(*) AS c FROM documents d\n        LEFT JOIN catalog_warehouses w ON w.id=d.warehouse_id\n        LEFT JOIN catalog_counterparties cp ON cp.id=d.counterparty_id ${w}`, ...params)).c;"
));

// 3) async qo'shish kerak bo'lgan funksiyalar
const ASYNC_FNS = [
  ['src/api/catalogs.js', 'validate', '    validate(data, { isNew, row }) {', '    async validate(data, { isNew, row }) {'],
  ['src/api/catalogs.js', 'options', 'function options(cat, query = {}) {', 'async function options(cat, query = {}) {'],
  ['src/api/plan.js', 'buildPlan', 'function buildPlan(warehouseId, opt = {}) {', 'async function buildPlan(warehouseId, opt = {}) {'],
  ['src/api/plan.js', 'buildingPlan', 'function buildingPlan(warehouseId, q = {}) {', 'async function buildingPlan(warehouseId, q = {}) {'],
  ['src/api/plan.js', 'roomDetail', 'function roomDetail(roomId, q = {}) {', 'async function roomDetail(roomId, q = {}) {'],
  ['src/api/warehouse.js', 'buildWarehouseMap', 'function buildWarehouseMap(warehouseId, opt = {}) {', 'async function buildWarehouseMap(warehouseId, opt = {}) {'],
  ['src/api/warehouse.js', 'warehouseMap', 'function warehouseMap(warehouseId, q = {}) {', 'async function warehouseMap(warehouseId, q = {}) {'],
  ['src/api/warehouse.js', 'autoPlace', 'function autoPlace(warehouseId, opt = {}) {', 'async function autoPlace(warehouseId, opt = {}) {'],
  ['src/api/warehouse.js', 'byCategories', 'function byCategories(warehouseId, q = {}) {', 'async function byCategories(warehouseId, q = {}) {'],
  ['src/api/warehouse.js', 'applyPlacement', 'function applyPlacement(warehouseId, plan) {', 'async function applyPlacement(warehouseId, plan) {'],
];
for (const [rel, , from, to] of ASYNC_FNS) {
  edit(rel, (s) => s.replace(from, to));
}

// Tekshiruv
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : e.name.endsWith('.js') && out.push(p);
  }
  return out;
}
let bad = 0;
for (const file of walk(path.join(ROOT, 'src'))) {
  try { execFileSync(NODE, ['--check', file], { stdio: 'pipe' }); }
  catch (e) {
    bad++;
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    const ln = (msg.split('\n').find((l) => l.trim().startsWith('await') || l.includes('SyntaxError')) || '').trim();
    console.log(`XATO ${path.relative(path.join(ROOT, 'src'), file)}${m ? ':' + m[1] : ''}  ${ln.slice(0, 76)}`);
  }
}
console.log(bad === 0 ? 'SINTAKSIS TOGRI' : `XATO: ${bad}`);