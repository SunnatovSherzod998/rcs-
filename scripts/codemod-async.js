'use strict';
/**
 * Codemod: DB chaqiruvlarini async qiladi.
 *   X -> await X
 *   (ctx) => ...  ->  async (ctx) => ...   (faqat DB ishlatgan funksiyalar)
 * Ishlatish: node scripts/codemod-async.js
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const SKIP = new Set(['db', 'app', 'server']);

const FILES = [
  'api/catalogs.js', 'api/documents.js', 'api/plan.js', 'api/registers.js',
  'api/reports.js', 'api/system.js', 'api/warehouse.js',
  'services/salary.js', 'services/stock.js', 'lib/http.js',
];

// Import qilingan DB yordamchilari
const DB_FNS = ['all', 'get', 'run', 'tx', 'audit', 'nextNumber', 'setSetting', 'getSetting', 'execRaw'];

function addAwait(src) {
  let n = 0;
  // .method( emas, sof DB yordamchisi nom bilan boshlanuvchi qo'ng'iroq
  const rx = new RegExp(
    `(?<![\\w.$\\]'"\`])(?<!await\\s)(?<!function\\s)(${DB_FNS.join('|')})\\(`,
    'g'
  );
  src = src.replace(rx, (m, fn) => { n++; return `await ${fn}(`; });
  return [src, n];
}

function addAsyncToFunctions(src) {
  let n = 0;
  // function NAME(...) {   — DB ishlatgan bo'lsa async qilamiz
  src = src.replace(
    /(^|\n)(\s*)function\s+(\w+)\s*\(/g,
    (m, nl, ind, name) => {
      const body = extractBody(src, m.index + m.length - 1);
      if (!usesDb(body)) return m;
      n++;
      return `${nl}${ind}async function ${name}(`;
    }
  );

  // arrow: (args) => { ... }  va  x => { ... }
  src = src.replace(
    /(^|[\s(,={[])(async\s+)?(\(\s*[\w\s,{}\[\]]*\s*\)|\w+)\s*=>\s*\{/g,
    (m, pre, _a, args) => {
      const body = extractBody(src, m.index + m.length - 1);
      if (!usesDb(body)) return m;
      if (/\basync\b/.test(pre)) return m;
      n++;
      return `${pre}async ${args} => {`;
    }
  );
  return [src, n];
}

function extractBody(src, openIdx) {
  const start = src.indexOf('{', openIdx);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return src.slice(start, start + 4000);
}

function usesDb(body) {
  const rx = new RegExp(`\\b(?:await\\s+)?(?:db\\.)?(?:${DB_FNS.join('|')})\\s*\\(`);
  return rx.test(body);
}

let totalAwait = 0, totalAsync = 0;
for (const rel of FILES) {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) { console.log('YO`Q  ' + rel); continue; }
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  let [s1, a] = addAwait(src);
  let [s2, b] = addAsyncToFunctions(s1);

  if (s2 !== before) {
    fs.writeFileSync(file, s2, 'utf8');
    console.log(`OK    ${rel.padEnd(24)} await=+${a}  async=+${b}`);
    totalAwait += a; totalAsync += b;
  } else {
    console.log(`-     ${rel.padEnd(24)} o'zgarish yo'q`);
  }
}
console.log(`\nJAMI: await +${totalAwait}, async +${totalAsync}`);