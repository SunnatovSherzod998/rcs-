'use strict';
/**
 * Ma'lumotlar bazasi qatlami.
 * Ishlatiladi: node:sqlite (Node.js 22.5+), tashqi paket talab qilinmaydi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword } = require('../lib/crypto');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n[ERROR] node:sqlite topilmadi. Node.js 22.5+ kerak (LTS 24 tavsiya etiladi).');
  console.error('         "node --version" bilan versiyani tekshiring.\n');
  throw e;
}

const DATA_DIR = process.env.OMBOR_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DB_FILE = process.env.OMBOR_DB || path.join(DATA_DIR, 'ombor.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

/** Jadvalni yaratadi (idempotent) */
function migrate() {
  db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  migrateColumns();
}

/**
 * Eski bazalarda yangi ustunlar qo'shilishi uchun.
 * (CREATE TABLE IF NOT EXISTS mavjud jadvalni o'zgartirmaydi)
 */
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

function migrateColumns() {
  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    const cols = all(`PRAGMA table_info(${table})`);
    if (!cols.length) continue;                       // jadval yo'q
    if (cols.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  // yangi ustunlarga bog'liq indekslar (faqat mavjudlik tekshiriladi)
  for (const sql of [
    'CREATE INDEX IF NOT EXISTS ix_loc_map ON catalog_locations(warehouse_id, zone, row_no, level_no, pos)',
    'CREATE INDEX IF NOT EXISTS ix_loc_room ON catalog_locations(room_id, rack_id, level_no, pos)',
    'CREATE INDEX IF NOT EXISTS ix_rooms_wh ON catalog_rooms(warehouse_id, floor, pos_y, pos_x)',
  ]) {
    try { db.exec(sql); } catch { /* eski bazada ustun yo'q */ }
  }
}

/** Tranzaksiya ichida ishlovchilar */
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

// ---------------------------------------------------------------- helpers

const stmtCache = new Map();
function prep(sql) {
  let s = stmtCache.get(sql);
  if (!s) { s = db.prepare(sql); stmtCache.set(sql, s); }
  return s;
}
const all = (sql, ...p) => prep(sql).all(...p);
const get = (sql, ...p) => prep(sql).get(...p);
const run = (sql, ...p) => prep(sql).run(...p);

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

function nextNumber(name) {
  run('INSERT INTO counters(name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING', name);
  run('UPDATE counters SET value = value + 1 WHERE name = ?', name);
  return get('SELECT value FROM counters WHERE name = ?', name).value;
}

function audit(user, action, entity, entityId, details) {
  run(
    `INSERT INTO audit_log (user_id, user_login, action, entity, entity_id, details)
     VALUES (?,?,?,?,?,?)`,
    user?.id ?? null, user?.login ?? 'system', action,
    entity ?? null, entityId ?? null, details ? JSON.stringify(details) : null
  );
}

function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  run(
    'INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value)
  );
}

// ---------------------------------------------------------------- seed

function seed() {
  const has = (t) => {
    const r = get(`SELECT COUNT(*) AS c FROM ${t}`);
    return r.c > 0;
  };

  // Валюты
  if (!has('catalog_currencies')) {
    const cur = [
      ['UZS', 'O‘zbek so‘mi', 'Узбекский сум', 1, 1],
      ['USD', 'AQSH dollari', 'Доллар США', 12650, 0],
      ['EUR', 'Yevro', 'Евро', 13700, 0],
      ['RUB', 'Rossiya rubli', 'Российский рубль', 139, 0],
    ];
    for (const c of cur) {
      run('INSERT INTO catalog_currencies (code, name_uz, name_ru, rate, is_base) VALUES (?,?,?,?,?)', ...c);
    }
  }

  // Единицы измерения
  if (!has('catalog_units')) {
    const units = [
      ['DONA', 'dona', 'штука', 1],
      ['KG', 'kilogramm', 'килограмм', 1],
      ['M', 'metr', 'метр', 1],
      ['M2', 'kvadrat metr', 'квадратный метр', 1],
      ['M3', 'kub metr', 'кубический метр', 1],
      ['L', 'litr', 'литр', 1],
      ['PACK', 'quti', 'коробка', 1],
      ['UP', 'dona (o‘ram)', 'штука (упаковка)', 1],
    ];
    for (const u of units) {
      run('INSERT INTO catalog_units (code, name_uz, name_ru, base_unit_id, ratio) VALUES (?,?,?,NULL,?)', ...u);
    }
  }

  // Склады
  if (!has('catalog_warehouses')) {
    run(`INSERT INTO catalog_warehouses (code, name_uz, name_ru, kind, address, phone, is_negative_allowed)
         VALUES ('MAIN','Markaziy ombor','Центральный склад','STORE','Toshkent, Sergeli tumani','+998 71 000 00 00', 0)`);
    run(`INSERT INTO catalog_warehouses (code, name_uz, name_ru, kind, address, phone, is_negative_allowed)
         VALUES ('FIL1','Filial 1','Филиал 1','BRANCH','Toshkent, Chilonzor','+998 71 111 11 11', 0)`);
    run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind)
         SELECT id,'A-01','A zona 1','Зона A-1','ZONE' FROM catalog_warehouses WHERE code='MAIN'`);
    run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind)
         SELECT id,'A-01-01','Stellaj 1','Стеллаж 1','RACK' FROM catalog_warehouses WHERE code='MAIN'`);
    run(`INSERT INTO catalog_locations (warehouse_id, code, name_uz, name_ru, kind)
         SELECT id,'A-01-02','Stellaj 2','Стеллаж 2','RACK' FROM catalog_warehouses WHERE code='MAIN'`);
  }

  // Пользователи
  if (!has('users')) {
    const wh = get(`SELECT id FROM catalog_warehouses WHERE code='MAIN'`);
    const pass = 'admin';
    const { hash, salt } = hashPassword(pass);
    run(`INSERT INTO users (login, password_hash, salt, full_name, role, warehouse_id)
         VALUES (?,?,?,?,?,?)`, 'admin', hash, salt, 'Administrator', 'ADMIN', wh?.id ?? null);
  }

  // Настройки
  if (getSetting('base_currency') === null) setSetting('base_currency', 'UZS');
  if (getSetting('negative_stock_block') === null) setSetting('negative_stock_block', '1');
  if (getSetting('default_language') === null) setSetting('default_language', 'uz');
  if (getSetting('fiscal_prefix') === null) setSetting('fiscal_prefix', '00000');
}

function init() {
  migrate();
  seed();
  return db;
}

module.exports = {
  db, init, tx, all, get, run, buildWhere, nextNumber, audit,
  getSetting, setSetting,
  DATA_DIR, DB_FILE,
};
