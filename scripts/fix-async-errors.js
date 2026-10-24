'use strict';
/**
 * Codemod 4: qolgan async konvertatsiya nuqsonlarini tuzatadi.
 *
 *  1. `tx (() => {`  /  `tx(() => {`      -> `tx(async () => {`
 *  2. `(await get(...).c`  / `.x`          -> `(await get(...)).x`
 *  3. `Router.get(` kabi methodlarni      -> tiklash (lib/http.js)
 *  4. `validate(...)` -> `async validate(...)` (agar tana async bo'lsa)
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SRC = path.join(__dirname, '..', 'src');
const NODE = process.execPath;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function check(file) {
  try {
    execFileSync(NODE, ['--check', file], { stdio: 'pipe' });
    return null;
  } catch (e) {
    const msg = String(e.stderr || '');
    const m = msg.match(/[\w\\.\/]+\.js:(\d+)/);
    const code = (msg.split('\n').find((l) => l.includes('SyntaxError')) || '').trim();
    return { line: m ? Number(m[1]) : 0, code };
  }
}

const MAX_PASS = 40;
let pass = 0;

for (pass = 1; pass <= MAX_PASS; pass++) {
  const files = walk(SRC);
  const broken = [];
  for (const f of files) {
    const err = check(f);
    if (err) broken.push({ file: f, ...err });
  }
  if (!broken.length) { console.log(`\nBARCHASI TOGRI (${pass - 1} iteratsiya)`); break; }

  console.log(`\n--- iteratsiya ${pass}: ${broken.length} faylda xato ---`);
  let fixed = 0;

  for (const b of broken) {
    let src = fs.readFileSync(b.file, 'utf8');
    const lines = src.split('\n');
    const idx = b.line - 1;
    if (idx < 0 || idx >= lines.length) continue;
    const cur = lines[idx];
    let out = cur;
    let how = '';

    // A) `tx (() => {`  ->  `tx(async () => {`
    if (/await/.test(cur) && /\btx\s*\(\s*\(\s*\)\s*=>/.test(cur)) {
      out = cur.replace(/\btx\s*\(\s*(\(\s*\)\s*=>)/, (m, g) => `tx(async ${g}`);
      how = 'tx async';
    }
    // B) `(await get(...).x`  ->  qavsni to'g'rilash
    else if (/\(await\s+(all|get|run)\s*\(.*\)\s*\.\w/.test(cur)) {
      out = cur.replace(/(\(await\s+(?:all|get|run)\s*\([^()]*\))\s*\.\s*(\w+)/, '$1).$2');
      how = 'paren';
    }
    // C) route handler body da await bor, lekin async yo'q
    else if (/^\s*(router\.(get|post|put|del)\()\s*\(/.test(cur) && /await/.test(cur)) {
      out = cur.replace(/\((ctx)\s*=>/, 'async (ctx) =>');
      how = 'route async';
    }

    if (out !== cur) {
      lines[idx] = out;
      fs.writeFileSync(b.file, lines.join('\n'), 'utf8');
      fixed++;
      console.log(`  ${path.relative(SRC, b.file)}:${b.line}  [${how}]  ${cur.trim().slice(0, 70)}`);
    } else {
      console.log(`  ${path.relative(SRC, b.file)}:${b.line}  qo'lda kerak: ${cur.trim().slice(0, 70)}`);
    }
  }
  if (!fixed) {
    console.log('\nAvtomatik tuzatish tugadi — qo\'lda davom etish kerak.');
    break;
  }
}