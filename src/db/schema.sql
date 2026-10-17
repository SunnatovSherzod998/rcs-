-- =====================================================================
--  CRS : 1C uslubidagi ombor boshqaruvi bazasi
--  Справочники -> Документы -> Регистры -> Отчеты
--  (Qat'iy nol tashqi bog'liqlik / zero dependencies)
-- =====================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 1. SPRAVOCHNIKI / СПРАВОЧНИКИ (nomlar ro'yxatlari)
-- ---------------------------------------------------------------------

-- Валюты
CREATE TABLE IF NOT EXISTS catalog_currencies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,          -- UZS, USD, EUR, RUB
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  rate          REAL NOT NULL DEFAULT 1,       -- 1 USD = ? UZS
  is_base       INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Склады (omboralar)
CREATE TABLE IF NOT EXISTS catalog_warehouses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'STORE', -- STORE | BRANCH | TRANSIT | VIRTUAL
  address       TEXT,
  phone         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  is_negative_allowed INTEGER NOT NULL DEFAULT 0, -- manfiy qoldiqga ruxsat
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- О комнаты / XONALAR (binodagi помещение, reja bo'yicha joylashuvi)
CREATE TABLE IF NOT EXISTS catalog_rooms (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id  INTEGER NOT NULL REFERENCES catalog_warehouses(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,                  -- 101, 102 ...
  name_uz       TEXT,
  name_ru       TEXT,
  kind          TEXT NOT NULL DEFAULT 'STORAGE',-- STORAGE|RECEIVING|SHIPPING|COOLING|QUARANTINE|BUFFER
  floor         INTEGER NOT NULL DEFAULT 1,     -- qavat / этаж
  pos_x         INTEGER NOT NULL DEFAULT 0,     -- reja bo'yicha X
  pos_y         INTEGER NOT NULL DEFAULT 0,     -- reja bo'yicha Y
  width         INTEGER NOT NULL DEFAULT 2,
  height        INTEGER NOT NULL DEFAULT 2,
  temperature   REAL,                           -- sovuq xona uchun
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (warehouse_id, code)
);

-- Стеллажи / STELLAJLAR (xona ichidagi to'qimalar)
CREATE TABLE IF NOT EXISTS catalog_racks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id       INTEGER NOT NULL REFERENCES catalog_rooms(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name_uz       TEXT,
  name_ru       TEXT,
  kind          TEXT NOT NULL DEFAULT 'RACK',   -- RACK|SHELF|PALLET|FLOOR
  pos_x         INTEGER NOT NULL DEFAULT 0,
  pos_y         INTEGER NOT NULL DEFAULT 0,
  levels        INTEGER NOT NULL DEFAULT 2,
  capacity      REAL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (room_id, code)
);

-- Места хранения (joylashuv / katak)
-- 2D xarita uchun: xona -> stellaj -> qavat -> o'rin (kinoteatr "joyi")
CREATE TABLE IF NOT EXISTS catalog_locations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id  INTEGER NOT NULL REFERENCES catalog_warehouses(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name_uz       TEXT,
  name_ru       TEXT,
  kind          TEXT NOT NULL DEFAULT 'CELL',   -- ZONE | RACK | SHELF | CELL | FLOOR
  room_id       INTEGER REFERENCES catalog_rooms(id) ON DELETE CASCADE,
  rack_id       INTEGER REFERENCES catalog_racks(id) ON DELETE CASCADE,
  zone          TEXT,                          -- A, B, C ... (eski rejim)
  row_no        INTEGER,                       -- qator / ряд
  level_no      INTEGER DEFAULT 1,             -- qavat / ярус
  pos           INTEGER,                       -- o'rin / позиция
  capacity      REAL DEFAULT 0,                -- sig'imi (0 = cheksiz)
  cell_w        REAL DEFAULT 1,
  cell_d        REAL DEFAULT 1,
  is_active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE (warehouse_id, code)
);
-- ix_loc_map indeksi migrateColumns() orqali yaratiladi (eski bazalar uchun)

-- Категории (toifalar)
CREATE TABLE IF NOT EXISTS catalog_categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER REFERENCES catalog_categories(id) ON DELETE SET NULL,
  code          TEXT,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1
);

-- Бренды / Производители
CREATE TABLE IF NOT EXISTS catalog_brands (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  country       TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1
);

-- Единицы измерения (o'lchov birligi)
CREATE TABLE IF NOT EXISTS catalog_units (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  -- базовые / упаковочные
  base_unit_id  INTEGER REFERENCES catalog_units(id) ON DELETE SET NULL,
  ratio         REAL NOT NULL DEFAULT 1,   -- сколько базовых в 1 этой
  is_active     INTEGER NOT NULL DEFAULT 1
);

-- Номенклатура (tovarlar) -- asosiy katalog
CREATE TABLE IF NOT EXISTS catalog_products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sku            TEXT NOT NULL UNIQUE,       -- артикул
  barcode        TEXT,                       -- skaner kodi
  name_uz        TEXT NOT NULL,
  name_ru        TEXT NOT NULL,
  category_id    INTEGER REFERENCES catalog_categories(id) ON DELETE SET NULL,
  brand_id       INTEGER REFERENCES catalog_brands(id) ON DELETE SET NULL,
  unit_id        INTEGER REFERENCES catalog_units(id) ON DELETE SET NULL,
  pack_unit_id   INTEGER REFERENCES catalog_units(id) ON DELETE SET NULL,
  pack_ratio     REAL NOT NULL DEFAULT 1,   -- qadoqda nechta birlik
  country        TEXT,
  weight         REAL,
  length         REAL,
  width          REAL,
  height         REAL,                       -- gabarit / to'ldirish hajmi
  min_stock      REAL NOT NULL DEFAULT 0,    -- minimal qoldiq
  max_stock      REAL NOT NULL DEFAULT 0,    -- maksimal qoldiq (0 = cheksiz)
  cost_price     REAL NOT NULL DEFAULT 0,    -- ulgurji tannarx
  sale_price     REAL NOT NULL DEFAULT 0,    -- chakana/talon tannarx
  currency_id    INTEGER REFERENCES catalog_currencies(id) ON DELETE SET NULL,
  account        TEXT,                       -- hisob raqami
  description    TEXT,
  image_path     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  is_service     INTEGER NOT NULL DEFAULT 0, -- xizmat (qoldiq hisoblanmaydi)
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS ix_products_barcode ON catalog_products(barcode);
CREATE INDEX IF NOT EXISTS ix_products_name     ON catalog_products(name_ru);
CREATE INDEX IF NOT EXISTS ix_products_category ON catalog_products(category_id);

-- Контрагенты (yetkazib beruvchi / mijoz)
CREATE TABLE IF NOT EXISTS catalog_counterparties (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT UNIQUE,
  name_uz        TEXT NOT NULL,
  name_ru        TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'BOTH', -- SUPPLIER | CUSTOMER | BOTH
  tax_id         TEXT,                        -- STIR / ИНН
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  contact_person TEXT,
  payment_terms  TEXT,
  bank_name      TEXT,
  bank_account   TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Сотрудники (xodimlar)
CREATE TABLE IF NOT EXISTS catalog_employees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT UNIQUE,
  name_uz       TEXT NOT NULL,
  name_ru       TEXT NOT NULL,
  position      TEXT,
  phone         TEXT,
  warehouse_id  INTEGER REFERENCES catalog_warehouses(id) ON DELETE SET NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  base_salary   REAL NOT NULL DEFAULT 0,        -- asosiy oylik
  sales_limit   REAL NOT NULL DEFAULT 0,        -- oylik sotuv limiti (0 = cheksiz)
  bonus_percent REAL NOT NULL DEFAULT 0,        -- limitdan oshgan summaga bonus foizi
  bonus_total   REAL NOT NULL DEFAULT 0         -- jami berilgan bonus
);

-- Ishchilar bonus harakati (append-only)
CREATE TABLE IF NOT EXISTS reg_employee_bonuses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id    INTEGER NOT NULL REFERENCES catalog_employees(id) ON DELETE CASCADE,
  document_id    INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  doc_type       TEXT NOT NULL,                 -- ISSUE (sotuv)
  sale_amount    REAL NOT NULL DEFAULT 0,       -- sotuv summasi
  over_limit     REAL NOT NULL DEFAULT 0,       -- limitdan oshgan summa
  bonus_amount   REAL NOT NULL DEFAULT 0,       -- berilgan bonus
  note           TEXT
);
CREATE INDEX IF NOT EXISTS ix_emp_bonus_emp ON reg_employee_bonuses(employee_id);
CREATE INDEX IF NOT EXISTS ix_emp_bonus_date ON reg_employee_bonuses(date);

-- Пользователи (foydalanuvchilar)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'WAREHOUSE_MANAGER',
  warehouse_id  INTEGER REFERENCES catalog_warehouses(id) ON DELETE SET NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  allowed_features TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_login_at TEXT
);
-- Роли: ADMIN | WAREHOUSE_MANAGER | CASHIER | OBSERVER

-- ---------------------------------------------------------------------
-- 2. DOCUMENTS / ДОКУМЕНТЫ (hujjatlar)
--    Bitta jadval umumiy sarlavha + qatorlar (1C uslubi)
--    OPENING     - Начальные остатки / Boshlang'ich qoldiq
--    RECEIPT     - Приход / Kirim
--    ISSUE       - Расход  / Chiqim  (sale | writeoff | usage)
--    TRANSFER    - Перемещение / Ko'chirish
--    INVENTORY   - Инвентаризация
--    PAYMENT     - Оплата / To'lash
--    STATUS: DRAFT | POSTED | CANCELLED
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL,
  number          INTEGER NOT NULL,
  date            TEXT NOT NULL,              -- YYYY-MM-DD
  time            TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  status          TEXT NOT NULL DEFAULT 'DRAFT',
  warehouse_id    INTEGER REFERENCES catalog_warehouses(id) ON DELETE RESTRICT,
  dest_warehouse_id INTEGER REFERENCES catalog_warehouses(id) ON DELETE RESTRICT,
  counterparty_id INTEGER REFERENCES catalog_counterparties(id) ON DELETE SET NULL,
  employee_id     INTEGER REFERENCES catalog_employees(id) ON DELETE SET NULL,
  currency_id     INTEGER REFERENCES catalog_currencies(id) ON DELETE SET NULL,
  rate            REAL NOT NULL DEFAULT 1,
  reason          TEXT,                        -- chiqim/yo'qotish sababi
  base_type       TEXT,                        -- ISSUE ichidagi turi
  note            TEXT,
  total_qty       REAL NOT NULL DEFAULT 0,
  total_amount    REAL NOT NULL DEFAULT 0,
  total_cost      REAL NOT NULL DEFAULT 0,
  posted_at       TEXT,
  posted_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_type_number ON documents(type, number);
CREATE INDEX IF NOT EXISTS ix_documents_date   ON documents(date);
CREATE INDEX IF NOT EXISTS ix_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS ix_documents_type   ON documents(type, date);

CREATE TABLE IF NOT EXISTS document_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_no       INTEGER NOT NULL DEFAULT 0,
  product_id    INTEGER NOT NULL REFERENCES catalog_products(id) ON DELETE RESTRICT,
  location_id   INTEGER REFERENCES catalog_locations(id) ON DELETE SET NULL,
  qty           REAL NOT NULL DEFAULT 0,      -- hujjat bo'yicha miqdor
  price         REAL NOT NULL DEFAULT 0,      -- narx (valyutada)
  amount        REAL NOT NULL DEFAULT 0,      -- price*qty*(1-discount)
  discount      REAL NOT NULL DEFAULT 0,      -- skidka, % (0-100)
  dest_location_id INTEGER REFERENCES catalog_locations(id) ON DELETE SET NULL, -- TRANSFER: qabul qiluvchi joy
  qty_system    REAL,                         -- INVENTORY: tizimdagi miqdor
  note          TEXT
);
CREATE INDEX IF NOT EXISTS ix_lines_doc     ON document_lines(document_id);
CREATE INDEX IF NOT EXISTS ix_lines_product ON document_lines(product_id);

-- ---------------------------------------------------------------------
-- 3. REGISTRI / РЕГИСТРЫ (qoldiq hisobi)
-- ---------------------------------------------------------------------

-- Регистр остатков товаров / Tovarlar qoldig'i harakati (append-only)
CREATE TABLE IF NOT EXISTS reg_stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
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

-- Итоги регистра / Registr natijalari (tez qoldiq)
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

-- Регистр взаиморасчётов / Qarzdorlik (debt) harakati
CREATE TABLE IF NOT EXISTS reg_debt_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  counterparty_id INTEGER NOT NULL,
  warehouse_id   INTEGER,
  amount         REAL NOT NULL DEFAULT 0,   -- + = bizning qarzimiz, - = ularning qarzi
  note           TEXT
);
CREATE INDEX IF NOT EXISTS ix_debt_cp   ON reg_debt_movements(counterparty_id);
CREATE INDEX IF NOT EXISTS ix_debt_date ON reg_debt_movements(date);

-- Регистр цен / Narxlar (o'rtacha tannarx hisobi)
CREATE TABLE IF NOT EXISTS reg_prices (
  product_id  INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL DEFAULT 0,
  cost        REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (product_id, warehouse_id)
);

-- Счётчики нумерации документов / Hujjat raqamlari
CREATE TABLE IF NOT EXISTS counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- Лог действий / Amallar jurnali
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  user_id    INTEGER,
  user_login TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  details    TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts);

-- Настройки / Sozlamalar
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
