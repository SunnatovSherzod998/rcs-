'use strict';
/**
 * Zaxira nusxa yaratish (файлga nusxa oladi)
 */
const fs = require('node:fs');
const path = require('node:path');
const { db, DB_FILE, run } = require('../src/db');

const dest = process.argv[2] || path.join(path.dirname(DB_FILE), 'backups');
fs.mkdirSync(dest, { recursive: true });
try { run('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* noop */ }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(dest, `ombor-${stamp}.db`);
fs.copyFileSync(DB_FILE, out);
console.log(`\n  Nusxa yaratildi: ${out}`);
console.log(`  Hajmi: ${(fs.statSync(out).size / 1024).toFixed(0)} KB\n`);
