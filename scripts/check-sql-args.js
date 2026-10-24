'use strict';
/**
 * SQL placeholder va argument sonini solishtiradi (INSERT/UPDATE/DELETE).
 * Sintaksis jihatidan to'g'ri, lekin parametrlar soni mos kelmasligi mumkin.
 */
const fs = require('node:fs');
const path = require('node:path');
const SRC = path.join(__dirname, '..', 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** SQL satrini ajratadi (backtick yoki qo'shtirnoq ichida) */
function splitArgs(src, from) {
  // from: SQL string tugagandan keyingi pozitsiya
  let i = from, depth = 0, args = [];
  let cur = '';
  const push = () => { args.push(cur.trim()); cur = ''; };
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') { depth++; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) { push(); return { args, end: i }; }
      depth--; cur += c; continue;
    }
    if (c === ',' && depth === 0) { push(); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; cur += c; i++;
      while (i < src.length && src[i] !== q) { cur += src[i]; i++; }
      cur += q; continue;
    }
    cur += c;
  }
  return { args, end: i };
}

let n = 0;
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  // `await run(` / `await get(` / `await all(` / `await execRaw(`
  const rx = /\bawait\s+(?:run|get|all|execRaw)\s*\(\s*`/g;
  let m;
  while ((m = rx.exec(src))) {
    const sqlStart = m.index + m[0].length - 1;
    // SQL ni topamiz
    let j = sqlStart + 1;
    let sql = '';
    while (j < src.length) {
      if (src[j] === '\\') { sql += src[j] + src[j + 1]; j += 2; continue; }
      if (src[j] === '`') break;
      sql += src[j]; j++;
    }
    const after = src.slice(j + 1);
    const parsed = splitArgs(after, 0);
    if (!parsed.args.length) continue;

    // placeholder soni
    const ph = (sql.match(/\?/g) || []).length;
    const argN = parsed.args.length;
    if (ph !== argN) {
      const line = src.slice(0, m.index).split('\n').length;
      console.log(`${path.relative(SRC, file)}:${line}  placeholder=${ph} argument=${argN}`);
      console.log(`   SQL: ${sql.replace(/\s+/g, ' ').slice(0, 96)}`);
      n++;
    }
  }
}
console.log(`\nMos kelmaydigan SQL: ${n}`);