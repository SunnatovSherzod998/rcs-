-- =====================================================================
--  CRS : PostgreSQL (Supabase) uchun sxema
--  ОМБОР БОШҚАРУВ ТИЗИМИ / СИСТЕМА УПРАВЛЕНИЯ СКЛАДОМ
--  (Supabase / Neon / Render Postgres bilan mos)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SPRAVOCHNIKI / СПРАВОЧНИКИ
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS catalog_currencies (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  rate          REAL NOT NULL DEFAULT 1,
  is_base       INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_warehouses (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'STORE',
  address       TEXT,
  phone         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_negative_allowed INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_rooms (
  id            SERIAL PRIMARY KEY,
  warehouse_id  INTEGER NOT NULL REFERENCES catalog_warehouses(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name_uz       TEXT,
  name_ru       TEXT,
  kind          TEXT NOT NULL DEFAULT 'STORAGE',
  floor         INTEGER NOT NULL DEFAULT 1,
  pos_x         INTEGER NOT NULL DEFAULT 0,
  pos_y         INTEGER NOT NULL DEFAULT 0,
  width         INTEGER NOT NULL DEFAULT 2,
  height        INTEGER NOT NULL DEFAULT 2,
  temperature   REAL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS catalog_racks (
  id            SERIAL PRIMARY KEY,
  room_id       INTEGER NOT NULL REFERENCES catalog_rooms(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name_uz       TEXT,
  name_ru       TEXT,
  kind          TEXT NOT NULL DEFAULT 'RACK',
  pos_x         INTEGER NOT NULL DEFAULT 0,
  pos_y         INTEGER NOT NULL DEFAULT 0,
  levels        INTEGER NOT NULL DEFAULT 2,
  capacity      REAL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (room_id, code)
);

CREATE TABLE IF NOT EXISTS catalog_locations (
  id            SERIAL PRIMARY KEY,
  warehouse_id  INTEGER NOT NULL REFERENCES catalog_warehouses(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name_uz       TEXT,
  name_ru       TEXT,
  kind          TEXT NOT NULL DEFAULT 'CELL',
  room_id       INTEGER REFERENCES catalog_rooms(id) ON DELETE CASCADE,
  rack_id       INTEGER REFERENCES catalog_racks(id) ON DELETE CASCADE,
  zone          TEXT,
  row_no        INTEGER,
  level_no      INTEGER DEFAULT 1,
  pos           INTEGER,
  capacity      REAL DEFAULT 0,
  cell_w        REAL DEFAULT 1,
  cell_d        REAL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS catalog_categories (
  id            SERIAL PRIMARY KEY,
  parent_id     INTEGER REFERENCES catalog_categories(id) ON DELETE SET NULL,
  code          TEXT,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS catalog_brands (
  id            SERIAL PRIMARY KEY,
  code          TEXT,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  country       TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS catalog_units (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  base_unit_id  INTEGER REFERENCES catalog_units(id) ON DELETE SET NULL,
  ratio         REAL NOT NULL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS catalog_products (
  id             SERIAL PRIMARY KEY,
  sku            TEXT NOT NULL UNIQUE,
  barcode        TEXT,
  name_uz        TEXT NOT NULL,
  name_ru        TEXT NOT NULL,
  category_id    INTEGER REFERENCES catalog_categories(id) ON DELETE SET NULL,
  brand_id       INTEGER REFERENCES catalog_brands(id) ON DELETE SET NULL,
  unit_id        INTEGER REFERENCES catalog_units(id) ON DELETE SET NULL,
  pack_unit_id   INTEGER REFERENCES catalog_units(id) ON DELETE SET NULL,
  pack_ratio     REAL NOT NULL DEFAULT 1,
  country        TEXT,
  weight         REAL,
  length         REAL,
  width          REAL,
  height         REAL,
  min_stock      REAL NOT NULL DEFAULT 0,
  max_stock      REAL NOT NULL DEFAULT 0,
  cost_price     REAL NOT NULL DEFAULT 0,
  sale_price     REAL NOT NULL DEFAULT 0,
  currency_id    INTEGER REFERENCES catalog_currencies(id) ON DELETE SET NULL,
  account        TEXT,
  description    TEXT,
  image_path     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  is_service     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_products_barcode ON catalog_products(barcode);
CREATE INDEX IF NOT EXISTS ix_products_name     ON catalog_products(name_ru);
CREATE INDEX IF NOT EXISTS ix_products_category ON catalog_products(category_id);

CREATE TABLE IF NOT EXISTS catalog_counterparties (
  id             SERIAL PRIMARY KEY,
  code           TEXT UNIQUE,
  name_uz        TEXT NOT NULL,
  name_ru        TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'BOTH',
  tax_id         TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  contact_person TEXT,
  payment_terms  TEXT,
  bank_name      TEXT,
  bank_account   TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_employees (
  id            SERIAL PRIMARY KEY,
  code          TEXT UNIQUE,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  position      TEXT,
  phone         TEXT,
  warehouse_id  INTEGER REFERENCES catalog_warehouses(id) ON DELETE SET NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  base_salary   REAL NOT NULL DEFAULT 0,
  sales_limit   REAL NOT NULL DEFAULT 0,
  bonus_percent REAL NOT NULL DEFAULT 0,
  bonus_total   REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'WAREHOUSE_MANAGER',
  warehouse_id  INTEGER REFERENCES catalog_warehouses(id) ON DELETE SET NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  allowed_features TEXT,
  employee_id   INTEGER REFERENCES catalog_employees(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 2. DOCUMENTS / ДОКУМЕНТЫ
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id              SERIAL PRIMARY KEY,
  type            TEXT NOT NULL,
  number          INTEGER NOT NULL,
  date            TEXT NOT NULL,
  time            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::TEXT,
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  warehouse_id    INTEGER REFERENCES catalog_warehouses(id) ON DELETE RESTRICT,
  dest_warehouse_id INTEGER REFERENCES catalog_warehouses(id) ON DELETE RESTRICT,
  counterparty_id INTEGER REFERENCES catalog_counterparties(id) ON DELETE SET NULL,
  employee_id     INTEGER REFERENCES catalog_employees(id) ON DELETE SET NULL,
  currency_id     INTEGER REFERENCES catalog_currencies(id) ON DELETE SET NULL,
  rate            REAL NOT NULL DEFAULT 1,
  reason          TEXT,
  base_type       TEXT,
  note            TEXT,
  total_qty       REAL NOT NULL DEFAULT 0,
  total_amount    REAL NOT NULL DEFAULT 0,
  total_cost      REAL NOT NULL DEFAULT 0,
  posted_at       TIMESTAMPTZ,
  posted_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_type_number ON documents(type, number);
CREATE INDEX IF NOT EXISTS ix_documents_date   ON documents(date);
CREATE INDEX IF NOT EXISTS ix_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS ix_documents_type   ON documents(type, date);

CREATE TABLE IF NOT EXISTS document_lines (
  id            SERIAL PRIMARY KEY,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no       INTEGER NOT NULL DEFAULT 0,
  product_id    INTEGER NOT NULL REFERENCES catalog_products(id) ON DELETE RESTRICT,
  location_id   INTEGER REFERENCES catalog_locations(id) ON DELETE SET NULL,
  qty           REAL NOT NULL DEFAULT 0,
  price         REAL NOT NULL DEFAULT 0,
  amount        REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  dest_location_id INTEGER REFERENCES catalog_locations(id) ON DELETE SET NULL,
  qty_system    REAL,
  note          TEXT
);
CREATE INDEX IF NOT EXISTS ix_lines_doc     ON document_lines(document_id);
CREATE INDEX IF NOT EXISTS ix_lines_product ON document_lines(product_id);

-- ---------------------------------------------------------------------
-- 3. REGISTRI / РЕГИСТРЫ
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reg_stock_movements (
  id             SERIAL PRIMARY KEY,
  document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_line_id INTEGER REFERENCES document_lines(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  doc_type       TEXT NOT NULL,
  product_id     INTEGER NOT NULL,
  warehouse_id   INTEGER NOT NULL,
  location_id    INTEGER,
  qty_in         REAL NOT NULL DEFAULT 0,
  qty_out        REAL NOT NULL DEFAULT 0,
  price          REAL NOT NULL DEFAULT 0,
  amount         REAL NOT NULL DEFAULT 0,
  counterparty_id INTEGER
);
CREATE INDEX IF NOT EXISTS ix_mov_date   ON reg_stock_movements(date);
CREATE INDEX IF NOT EXISTS ix_mov_prod   ON reg_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS ix_mov_wh     ON reg_stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS ix_mov_key    ON reg_stock_movements(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS ix_mov_doc    ON reg_stock_movements(document_id);

CREATE TABLE IF NOT EXISTS reg_stock_balances (
  product_id    INTEGER NOT NULL,
  warehouse_id  INTEGER NOT NULL,
  location_id   INTEGER NOT NULL DEFAULT 0,
  qty           REAL NOT NULL DEFAULT 0,
  amount        REAL NOT NULL DEFAULT 0,
  last_date     TEXT,
  PRIMARY KEY (product_id, warehouse_id, location_id)
);
CREATE INDEX IF NOT EXISTS ix_bal_wh ON reg_stock_balances(warehouse_id);

CREATE TABLE IF NOT EXISTS reg_debt_movements (
  id             SERIAL PRIMARY KEY,
  document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  counterparty_id INTEGER NOT NULL,
  warehouse_id   INTEGER,
  amount         REAL NOT NULL DEFAULT 0,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS ix_debt_cp   ON reg_debt_movements(counterparty_id);
CREATE INDEX IF NOT EXISTS ix_debt_date ON reg_debt_movements(date);

CREATE TABLE IF NOT EXISTS reg_prices (
  product_id  INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL DEFAULT 0,
  cost        REAL NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS reg_employee_bonuses (
  id             SERIAL PRIMARY KEY,
  employee_id    INTEGER NOT NULL REFERENCES catalog_employees(id) ON DELETE CASCADE,
  document_id    INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  doc_type       TEXT NOT NULL,
  sale_amount    REAL NOT NULL DEFAULT 0,
  over_limit     REAL NOT NULL DEFAULT 0,
  bonus_amount   REAL NOT NULL DEFAULT 0,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS ix_emp_bonus_emp ON reg_employee_bonuses(employee_id);
CREATE INDEX IF NOT EXISTS ix_emp_bonus_date ON reg_employee_bonuses(date);

CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id    INTEGER,
  user_login TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  details    TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS ix_loc_map ON catalog_locations(warehouse_id, zone, row_no, level_no, pos);
CREATE INDEX IF NOT EXISTS ix_loc_room ON catalog_locations(warehouse_id, room_id, rack_id, level_no, pos);
CREATE INDEX IF NOT EXISTS ix_rooms_wh ON catalog_rooms(warehouse_id, floor, pos_y, pos_x);
