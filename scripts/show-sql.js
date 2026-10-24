'use strict';
/** Aniq SQL ni tekshiradi: placeholder soni va argument soni */
const fs = require('node:fs');

function show(file, line) {
  const L = fs.readFileSync(file, 'utf8').split('\n');
  console.log(`--- ${file}:${line} ---`);
  for (let i = line - 1; i < Math.min(line + 9, L.length); i++) {
    console.log(`${i + 1}: ${L[i]}`);
  }
  console.log();
}

show('src/services/stock.js', 466);
show('src/services/stock.js', 494);
show('src/services/stock.js', 510);
show('src/services/stock.js', 58);
show('src/services/stock.js', 83);