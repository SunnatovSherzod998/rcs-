'use strict';
/** Aniq qatorlarni to'g'ri kodlash bilan almashtiradi (UTF-8 saqlanadi). */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

const EDITS = [
  ['src/api/system.js', 243, "  router.get('/api/users', async () => (await all('SELECT * FROM users ORDER BY id')).map(publicUser), { roles: ['ADMIN'] });"],
  ['src/api/plan.js', 189, 'async function roomDetail(roomId, q = {}) {'],
  ['src/api/warehouse.js', 209, 'async function autoPlace(warehouseId, opt = {}) {'],
];

for (const [rel, ln, text] of EDITS) {
  const file = path.join(ROOT, rel);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const i = ln - 1;
  if (i < 0 || i >= lines.length) { console.log(`SKIP ${rel}:${ln}`); continue; }
  console.log(`${rel}:${ln}\n  - ${lines[i].trim().slice(0, 76)}\n  + ${text.trim().slice(0, 76)}`);
  lines[i] = text;
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}
console.log('\nTayyor.');