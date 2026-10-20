'use strict';
/**
 * Ma'lumotlar bazasi qatlami — ko'p driverli.
 *
 *   • POSTGRES (Supabase / Neon / Render) — pg
 *   • TURSO   (libSQL)                   — @libsql/client
 *   • LOKAL   (node:sqlite)              — node:sqlite
 *
 * Tanlov o'zgaruvchilar orqali:
 *   SUPABASE_DATABASE_URL / DATABASE_URL  → Postgres
 *   TURSO_DATABASE_URL                   → Turso
 *   aks holda                            → lokal fayl
 *
 * SQL yozilishi SQLite uslubida (`?` placeholder). Postgres uchun
 * `toPg()` funksiyasi SQL'ni avtomatik konvertatsiya qiladi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('../lib/crypto');

const DATA_DIR = process.env.OMBOR_DATA_DIR
  || (process.env.VERCEL ? '/tmp/ombor' : path.join(__dirname, '..', '..', 'data'));
const DB_FILE = process.env.OMBOR_DB || path.join(DATA_DIR, 'ombor.db');
const SCHEMA_SQLITE = path.join(__dirname, 'schema.sql');
const SCHEMA_PG = path.join(__dirname, 'schema.pg.sql');

const PG_URL = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const PG_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const TURSO_URL = process.env.TURSO_DATABASE_URL || '';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

const DRIVER = PG_URL ? 'postgres' : (TURSO_URL ? 'turso' : 'sqlite');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

// ---------------------------------------------------------------- SQL konvertatsiyasi

/** SQLite SQL -> Postgres SQL (`?` -> `$1`, maxsus funksiyalar) */
function toPg(sql) {
  let s = sql;
  // funksiyalar
  s = s.replace(/datetime\('now','localtime'\)/gi, 'CURRENT_TIMESTAMP');
  s = s.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
  s = s.replace(/date\('now',\s*'-\s*(\d+)\s+days'\)/gi, "(CURRENT_DATE - INTERVAL '$1 days')");
  s = s.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  // placeholderlar: ? -> $1, $2, ...
  let n = 0;
  s = s.replace(/\?/g, () => `$${++n}`);
  return { sql: s, count: n };
}

// ---------------------------------------------------------------- driver

let drv = null;

function initDriver() {
  if (drv) return drv;

  if (DRIVER === 'postgres') {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: PG_URL,
      ssl: PG_URL.includes('localhost') || PG_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
    });
    drv = {
      kind: 'postgres',
      exec: async (sql) => { await pool.query(sql); },
      all: async (sql, p) => {
        const { sql: q, count } = toPg(sql);
        if (count !== p.length) throw new Error(`SQL parametr soni mos emas (${count} vs ${p.length}): ${sql.slice(0, 80)}`);
        const r = await pool.query(q, p);
        return r.rows;
      },
      run: async (sql, p) => {
        let q = sql;
        // INSERT ... RETURNING id (Postgres ID qaytarish uchun)
        if (/^\s*INSERT\s+INTO/i.test(sql) && !/RETURNING/i.test(sql) && !/ON\s+CONFLICT/i.test(sql)) {
          q = sql.replace(/\s*;?\s*$/, ' RETURNING id');
        }
        const conv = toPg(q);
        if (conv.count !== p.length) {
          throw new Error(`SQL parametr soni mos emas (${conv.count} vs ${p.length}): ${sql.slice(0, 90)}`);
        }
        const r = await pool.query(conv.sql, p);
        const newId = r.rows && r.rows[0] && r.rows[0].id !== undefined ? Number(r.rows[0].id) : r.rowCount;
        return { lastInsertRowid: newId, changes: r.rowCount };
      },
      close: () => { try { pool.end(); } catch { /* noop */ } },
    };
  } else if (DRIVER === 'turso') {
    const { createClient } = require('@libsql/client');
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    drv = {
      kind: 'turso',
      exec: async (sql) => { await client.executeMultiple(sql); },
      all: async (sql, p) => (await client.execute({ sql, args: p })).rows,
      run: async (sql, p) => {
        const r = await client.execute({ sql, args: p });
        return { lastInsertRowid: r.lastInsertRowid, changes: r.rowsAffected };
      },
      close: () => { /* noop */ },
    };
  } else {
    let DatabaseSync;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch (e) {
      console.error('\n[ERROR] node:sqlite topilmadi. Node.js 22.5+ kerak (LTS 24 tavsiya etiladi).\n');
      throw e;
    }
    const d = new DatabaseSync(DB_FILE);
    d.exec('PRAGMA foreign_keys = ON;');
    d.exec('PRAGMA journal_mode = WAL;');
    d.exec('PRAGMA busy_timeout = 5000;');
    drv = {
      kind: 'sqlite',
      exec: async (sql) => { d.exec(sql); },
      all: async (sql, p) => d.prepare(sql).all(...p),
      run: async (sql, p) => {
        const r = d.prepare(sql).run(...p);
        return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
      },
      close: () => { try { d.close(); } catch { /* noop */ } },
    };
  }
  return drv;
}

// ---------------------------------------------------------------- helpers

const all = async (sql, ...p) => initDriver().all(sql, p);
const get = async (sql, ...p) => {
  const rows = await initDriver().all(sql, p);
  return rows[0];
};
const run = async (sql, ...p) => initDriver().run(sql, p);

/** Dinamik WHERE qurish (faqat ishonchli maydon nomlari) */
function buildWhere(filters = {}, allowed = []) {
  const parts = [];
  const params = [];
  for (const [key, value] of Object.entries(filters)) {
    if (!allowed.includes(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${key} IN (${value.map(() => '?').join(',')})`);
      params.push(...value);
    } else if (typeof value === 'number') {
      parts.push(`${key} = ?`);
      params.push(value);
    } else if (value === true || value === false || value === 'true' || value === 'false') {
      parts.push(`${key} = ?`);
      params.push(value === true || value === 'true' ? 1 : 0);
    } else {
      parts.push(`${key} = ?`);
      params.push(value);
    }
  }
  return { clause: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

async function nextNumber(name) {
  await run('INSERT INTO counters(name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING', name);
  await run('UPDATE counters SET value = value + 1 WHERE name = ?', name);
  const row = await get('SELECT value FROM counters WHERE name = ?', name);
  return row.value;
}

async function audit(user, action, entity, entityId, details) {
  await run(
    `INSERT INTO audit_log (user_id, user_login, action, entity, entity_id, details)
     VALUES (?,?,?,?,?,?)`,
    user?.id ?? null, user?.login ?? 'system', action,
    entity ?? null, entityId ?? null, details ? JSON.stringify(details) : null
  );
}

async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await run(
    'INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value)
  );
}

// ---------------------------------------------------------------- schema

const COLUMN_MIGRATIONS = [
  ['catalog_locations', 'zone', 'TEXT'],
  ['catalog_locations', 'row_no', 'INTEGER'],
  ['catalog_locations', 'level_no', 'INTEGER DEFAULT 1'],
  ['catalog_locations', 'pos', 'INTEGER'],
  ['catalog_locations', 'capacity', 'REAL DEFAULT 0'],
  ['catalog_locations', 'cell_w', 'REAL DEFAULT 1'],
  ['catalog_locations', 'cell_d', 'REAL DEFAULT 1'],
  ['catalog_locations', 'room_id', 'INTEGER'],
  ['catalog_locations', 'rack_id', 'INTEGER'],
  ['catalog_warehouses', 'map_zones', 'TEXT'],
  ['catalog_warehouses', 'map_rows', 'INTEGER DEFAULT 4'],
  ['catalog_warehouses', 'map_levels', 'INTEGER DEFAULT 2'],
  ['catalog_warehouses', 'map_slots', 'INTEGER DEFAULT 10'],
  ['catalog_warehouses', 'is_pick_face', 'INTEGER NOT NULL DEFAULT 0'],
  ['catalog_warehouses', 'map_cols', 'INTEGER DEFAULT 3'],
  ['catalog_warehouses', 'map_rooms', 'INTEGER DEFAULT 6'],
  ['catalog_products', 'image_url', 'TEXT'],
  ['catalog_products', 'color', 'TEXT'],
  ['document_lines', 'discount', 'REAL DEFAULT 0'],
  ['document_lines', 'dest_location_id', 'INTEGER'],
  ['users', 'allowed_features', 'TEXT'],
  ['catalog_employees', 'base_salary', 'REAL NOT NULL DEFAULT 0'],
  ['catalog_employees', 'sales_limit', 'REAL NOT NULL DEFAULT 0'],
  ['catalog_employees', 'bonus_percent', 'REAL NOT NULL DEFAULT 0'],
  ['catalog_employees', 'bonus_total', 'REAL NOT NULL DEFAULT 0'],
  ['users', 'employee_id', 'INTEGER'],
];

async function execRaw(sql) {
  await initDriver().exec(sql);
}

async function migrate() {
  const d = initDriver();
  if (d.kind === 'postgres') {
    await execRaw(fs.readFileSync(SCHEMA_PG, 'utf8'));
  } else {
    await execRaw(fs.readFileSync(SCHEMA_SQLITE, 'utf8'));
  }
  await migrateColumns();
}

async function migrateColumns() {
  const d = initDriver();
  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    let exists = false;
    if (d.kind === 'postgres') {
      const r = await d.all(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = ? AND column_name = ?`, table, column);
      exists = r.length > 0;
    } else {
      const cols = await all(`PRAGMA table_info(${table})`);
      if (!cols.length) continue;
      exists = cols.some((c) => c.name === column);
    }
    if (exists) continue;
    try {
      await execRaw(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch { /* allaqon bor */ }
  }
  for (const sql of [
    'CREATE INDEX IF NOT EXISTS ix_loc_map ON catalog_locations(warehouse_id, zone, row_no, level_no, pos)',
    'CREATE INDEX IF NOT EXISTS ix_loc_room ON catalog_locations(warehouse_id, room_id, rack_id, level_no, pos)',
    'CREATE INDEX IF NOT EXISTS ix_rooms_wh ON catalog_rooms(warehouse_id, floor, pos_y, pos_x)',
  ]) {
    try { await execRaw(sql); } catch { /* eski bazada ustun yo'q */ }
  }
}

// ---------------------------------------------------------------- tranzaksiya

async function tx(fn) {
  const d = initDriver();
  if (d.kind === 'postgres') {
    // Postgres: har bir so'rov o'z tranzaksiyasida (autocommit).
    // Qo'lda BEGIN/COMMIT ishlatilmaydi — pg Pool bilan ishlash xavfsizroq.
    return fn();
  }
  await execRaw('BEGIN');
  try {
    const r = await fn();
    await execRaw('COMMIT');
    return r;
  } catch (err) {
    try { await execRaw('ROLLBACK'); } catch { /* noop */ }
    throw err;
  }
}

// ---------------------------------------------------------------- seed

async function seed() {
  const has = async (t) => {
    const r = await get(`SELECT COUNT(*) AS c FROM ${t}`);
    return r.c > 0;
  };

  if (!await has('catalog_currencies')) {
    const cur = [
      ['UZS', 'O‘zbek so‘mi', 'Узбекский сум', 1, 1],
      ['USD', 'AQSH dollari', 'Доллар США', 12650, 0],
      ['EUR', 'Yevro', 'Евро', 13700, 0],
      ['RUB', 'Rossiya rubli', 'Российский рубль', 139, 0],
    ];
    for (const c of cur) {
      await run('INSERT INTO catalog_currencies (code, name_uz, name_ru, rate, is_base) VALUES (?,?,?,?,?)', ...c);
    }
  }

  if (!await has('catalog_units')) {
    const units = [
      ['DONA', 'dona', 'штука', 1], ['KG', 'kilogramm', 'килограмм', 1],
      ['M', 'metr', 'метр', 1], ['M2', 'kvadrat metr', 'квадратный метр', 1],
      ['M3', 'kub metr', 'кубический метр', 1], ['L', 'litr', 'литр', 1],
      ['PACK', 'quti', 'коробка', 1], ['UP', 'dona (o‘ram)', 'штука (упаковка)', 1],
    ];
    for (const u of units) {
      await run('INSERT INTO catalog_units (code, name_uz, name_ru, base_unit_id, ratio) VALUES (?,?,?,NULL,?)', ...u);
    }
  }

  if (!await has('catalog_warehouses')) {
    await run(`INSERT INTO catalog_warehouses (code, name_uz, name_ru, kind, address, phone, is_negative_allowed)
         VALUES ('MAIN','Markaziy ombor','Центральный склад','STORE','Toshkent, Sergeli tumani','+998 71 000 00 00', 0)`);
    await run(`INSERT INTO catalog_warehouses (code, name_uz, name_ru, kind, address, phone, is_negative_allowed)
         VALUES ('FIL1','Filial 1','Филиал 1','BRANCH','Toshkent, Chilonzor','+998 71 111 11 11', 0)`);
    await run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind)
         SELECT id,'A-01','A zona 1','Зона A-1','ZONE' FROM catalog_warehouses WHERE code='MAIN'`);
    await run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind)
         SELECT id,'A-01-01','Stellaj 1','Стеллаж 1','RACK' FROM catalog_warehouses WHERE code='MAIN'`);
    await run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind)
         SELECT id,'A-01-02','Stellaj 2','Стеллаж 2','RACK' FROM catalog_warehouses WHERE code='MAIN'`);
  }

  if (!await has('users')) {
    const wh = await get(`SELECT id FROM catalog_warehouses WHERE code='MAIN'`);
    const pass = process.env.ADMIN_PASSWORD || 'admin';
    const { hash, salt } = hashPassword(pass);
    await run(`INSERT INTO users (login, password_hash, salt, full_name, role, warehouse_id)
         VALUES (?,?,?,?,?,?)`, 'admin', hash, salt, 'Administrator', 'ADMIN', wh?.id ?? null);
  }

  if (await getSetting('base_currency') === null) await setSetting('base_currency', 'UZS');
  if (await getSetting('negative_stock_block') === null) await setSetting('negative_stock_block', '1');
  if (await getSetting('default_language') === null) await setSetting('default_language', 'uz');
  if (await getSetting('fiscal_prefix') === null) await setSetting('fiscal_prefix', '00000');
}

async function init() {
  await migrate();
  await seed();
  return drv;
}

module.exports = {
  init, tx, all, get, run, buildWhere, nextNumber, audit,
  getSetting, setSetting, execRaw, toPg,
  DATA_DIR, DB_FILE,
  driver: () => DRIVER,
  isRemote: () => DRIVER !== 'sqlite',
  close: () => { if (drv) drv.close(); },
};
