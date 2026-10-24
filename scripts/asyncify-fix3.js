'use strict';
/** Oxirgi tuzatishlar. */
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
}

// 1) `async ((ctx) =>` -> `async (ctx) =>`
for (const rel of ['src/api/registers.js', 'src/api/reports.js', 'src/api/system.js', 'src/api/catalogs.js',
  'src/api/documents.js', 'src/api/plan.js', 'src/api/warehouse.js']) {
  edit(rel, (s) => s.replace(/async\s*\(\s*\((ctx)\)\s*=>/g, 'async ($1) =>'));
}

// 2) warehouse.js — buzilgan qatorni tiklash
edit('src/api/warehouse.js', (s) => s.replace(
  /const withoutLocation = \(\(\(\(\(\(\(await c\);/,
  "const withoutLocation = (await get(`SELECT COUNT(*) AS c FROM catalog_locations\n       WHERE warehouse_id = ? AND is_active = 1 AND location_id IS NULL`, warehouseId)).c;"
));

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