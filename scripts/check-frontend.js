'use strict';
/**
 * Frontend importlarini tekshirish:
 *  1) sintaksis
 *  2) har bir importda so'ralgan nom eksport qilinganmi
 *  3) ishlatilgan nomlar mavjudmi
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const PUB = path.join(__dirname, '..', 'public', 'js');
const tmp = path.join(os.tmpdir(), 'ombor-syntax-check');
fs.mkdirSync(tmp, { recursive: true });

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return (p.endsWith('.js') || p.endsWith('.mjs')) ? [p] : [];
  });
}

// modul -> eksport qilingan nomlar
const exportsOf = new Map();
for (const file of walk(PUB)) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  // export function X / export async function X / export const X
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  exportsOf.set(path.resolve(file), names);
}

let fail = 0;

// ---- 1) sintaksis
console.log('\n== Sintaksis ==');
for (const file of walk(PUB)) {
  const copy = path.join(tmp, path.relative(PUB, file).replace(/[\\/]/g, '_') + '.mjs');
  fs.writeFileSync(copy, fs.readFileSync(file, 'utf8'));
  try {
    execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' });
    console.log('  OK   ' + path.relative(path.join(PUB, '..', '..'), file));
  } catch (e) {
    fail++;
    console.error('  FAIL ' + path.relative(path.join(PUB, '..', '..'), file));
    console.error('       ' + String(e.stderr).split('\n').slice(0, 6).join('\n       '));
  }
}

// ---- 2) importlar mavjudmi
console.log('\n== Importlar ==');
for (const file of walk(PUB)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), m[2]);
    const available = exportsOf.get(target);
    const rel = path.relative(path.join(PUB, '..', '..'), file);
    if (!available) {
      fail++;
      console.error(`  FAIL ${rel}: modul topilmadi -> ${m[2]}`);
      continue;
    }
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (!n) continue;
      if (!available.has(n)) {
        fail++;
        console.error(`  FAIL ${rel}: '${n}' ${m[2]} faylida eksport qilinmagan`);
      }
    }
  }
}

// ---- 3) ishlatilgan nomlar
console.log('\n== Ishlatilgan nomlar ==');
for (const file of walk(PUB)) {
  const src = fs.readFileSync(file, 'utf8');
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      imported.add((bits[1] || bits[0] || '').trim());
    }
  }
  const body = src.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?$/gm, '');
  const rel = path.relative(path.join(PUB, '..', '..'), file);
  for (const name of imported) {
    if (!name) continue;
    const used = new RegExp(`(?<![\\w$.'"\`])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(body);
    if (!used) {
      console.log(`  WARN ${rel}: '${name}' import qilingan, lekin ishlatilmagan`);
    }
  }
}

console.log(fail ? `\n${fail} ta xato\n` : '\nFrontend to‘g‘ri\n');
process.exit(fail ? 1 : 0);
