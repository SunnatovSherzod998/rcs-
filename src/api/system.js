'use strict';
/**
 * TIZIM / СИСТЕМА: login, foydalanuvchilar, sozlamalar, eksport/import
 */
const fs = require('node:fs');
const path = require('node:path');
const { all, get, run, tx, audit, setSetting, DATA_DIR, DB_FILE } = require('../db');
const { bad, notFound, forbidden } = require('../lib/http');
const { hashPassword, verifyPassword, randomToken } = require('../lib/crypto');
const { assertPassword } = require('../lib/password');
const { CATALOGS, positionPerms } = require('./catalogs');

const ROLES = {
  ADMIN:             { uz: 'Administrator',   ru: 'Администратор' },
  WAREHOUSE_MANAGER: { uz: 'Ombor mudiri',    ru: 'Управляющий складом' },
  CASHIER:           { uz: 'Kassir',           ru: 'Кассир' },
  OBSERVER:          { uz: 'Kuzatuvchi',       ru: 'Наблюдатель' },
};

const PERMISSIONS = {
  ADMIN: ['*'],
  // Xodimlar + foydalanuvchi akkauntlari — faqat ADMIN ('employees.write')
  WAREHOUSE_MANAGER: [
    'catalogs.read', 'catalogs.write', 'locations.read',
    'documents.read', 'documents.write', 'documents.post',
    'registers.read', 'reports.read', 'import', 'export',
  ],
  // Kassir joylashuvlar bo'limini ko'rmaydi — u faqat savdo qiladi
  CASHIER: [
    'catalogs.read', 'pos.use', 'documents.read', 'documents.write', 'documents.post',
    'registers.read', 'reports.read', 'export',
  ],
  OBSERVER: ['catalogs.read', 'locations.read', 'documents.read', 'registers.read', 'reports.read', 'export'],
};

const sessions = new Map();   // token -> session
const SESSION_TTL = 12 * 60 * 60 * 1000;

function createSession(user) {
  const token = randomToken(32);
  sessions.set(token, {
    userId: user.id, login: user.login, role: user.role,
    warehouseId: user.warehouse_id, expires: Date.now() + SESSION_TTL,
  });
  return token;
}
function readSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}
function destroySession(token) { sessions.delete(token); }

function can(role, perm) {
  const list = PERMISSIONS[role] || [];
  return list.includes('*') || list.includes(perm);
}

/**
 * Foydalanuvchining amaldagi huquqlari = rol huquqlari + lavozim huquqlari.
 * Xodim katalogida lavozim "Kassir" bo'lsa, sotish (pos.use) avtomatik beriladi.
 */
async function permsOf(user) {
  if (!user) return [];
  const base = PERMISSIONS[user.role] || [];
  if (base.includes('*')) return base;

  const emp = user.employee_id
    ? await get('SELECT position FROM catalog_employees WHERE id=?', user.employee_id)
    : null;
  const extra = positionPerms(emp?.position);
  if (!extra.length) return base;
  if (extra.includes('*')) return ['*'];

  const set = new Set(base);
  for (const p of extra) set.add(p);
  return [...set];
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, salt, ...rest } = u;
  let allowed = null;
  if (rest.allowed_features) {
    try {
      allowed = typeof rest.allowed_features === 'string'
        ? JSON.parse(rest.allowed_features)
        : rest.allowed_features;
    } catch {
      allowed = null;
    }
  }
  return { ...rest, allowed_features: allowed, role_label: ROLES[u.role] || null };
}

// ------------------------------------------------------------------ CSV

async function toCsv(rows, columns) {
  const cols = columns || (rows.length
    ? Object.keys(rows[0]).map((k) => ({ key: k, title: k }))
    : []);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const out = [cols.map((c) => esc(c.title)).join(';')];
  for (const r of rows) {
    out.push(cols.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(';'));
  }
  return '\uFEFF' + out.join('\r\n');   // BOM — Excel uchun
}

function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ';' || ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// ------------------------------------------------------------------ routes

async function register(router) {
  // ------------------------------------------------------------ Login
  router.post('/api/auth/login',async (ctx) => {
    const { login, password } = ctx.body || {};
    if (!login || !password) throw bad('Login va parol kiriting / Введите логин и пароль');
    const u = await get('SELECT * FROM users WHERE lower(login) = lower(?)', String(login).trim());
    if (!u || !u.is_active) throw forbidden('Login yoki parol noto‘g‘ri / Неверный логин или пароль');
    if (!verifyPassword(password, u.password_hash, u.salt)) {
      throw forbidden('Login yoki parol noto‘g‘ri / Неверный логин или пароль');
    }
    const token = createSession(u);
    await run("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id=?", u.id);
    await audit(u, 'LOGIN', 'user', u.id);
    const wh = u.warehouse_id
      ? await get('SELECT id, code, name_ru, name_uz FROM catalog_warehouses WHERE id=?', u.warehouse_id)
      : null;
    const permissions = await permsOf(u);
    return {
      token, user: publicUser(u), warehouse: wh,
      permissions, role_label: ROLES[u.role] || null,
    };
  }, { auth: false });

  router.post('/api/auth/logout',async (ctx) => {
    destroySession(ctx.token);
    if (ctx.user) await audit(ctx.user, 'LOGOUT', 'user', ctx.user.id);
    return { ok: true };
  });

  router.get('/api/auth/me', async (ctx) => ({
    user: ctx.user,
    permissions: await permsOf(ctx.user),
    role_label: ROLES[ctx.user.role] || null,
  }));

  router.post('/api/auth/password',async (ctx) => {
    const { old_password, new_password } = ctx.body || {};
    // Parol siyosati: kamida 12 belgi, 70% son / 30% harf-belgi, katta harf
    await assertPassword(new_password);
    const u = await get('SELECT * FROM users WHERE id=?', ctx.user.id);
    if (!verifyPassword(old_password || '', u.password_hash, u.salt)) {
      throw bad('Eski parol noto‘g‘ri / Неверный старый пароль');
    }
    const { hash, salt } = hashPassword(new_password);
    await run('UPDATE users SET password_hash=?, salt=? WHERE id=?', hash, salt, u.id);
    await audit(ctx.user, 'PASSWORD_CHANGE', 'user', u.id);
    return { ok: true };
  });

  // ------------------------------------------------------------ Meta
  router.get('/api/meta/info', async () => ({
    name: 'CRS', version: require('../../package.json').version,
    db: path.basename(DB_FILE), data_dir: DATA_DIR,
    roles: Object.entries(ROLES).map(([value, l]) => ({ value, label: l })),
    node: process.version,
  }));

  router.get('/api/meta/counts',async () => {
    const c = {};
    for (const t of [
      'catalog_products', 'catalog_warehouses', 'catalog_locations', 'catalog_counterparties',
      'catalog_categories', 'catalog_brands', 'catalog_units', 'catalog_employees', 'users',
    ]) c[t.replace('catalog_', '')] = (await get(`SELECT COUNT(*) AS c FROM ${t}`)).c;
    c.documents = (await get('SELECT COUNT(*) AS c FROM documents')).c;
    c.drafts = (await get(`SELECT COUNT(*) AS c FROM documents WHERE status='DRAFT'`)).c;
    c.posted = (await get(`SELECT COUNT(*) AS c FROM documents WHERE status='POSTED'`)).c;
    c.movements = (await get('SELECT COUNT(*) AS c FROM reg_stock_movements')).c;
    return c;
  });

  // ------------------------------------------------------------ Sozlamalar
  router.get('/api/settings', async () =>
    Object.fromEntries((await all('SELECT key, value FROM settings')).map((r) => [r.key, r.value])),
    { roles: ['ADMIN'] });

  // Funksiyalar yoqish/o'chirish — barcha foydalanuvchilar uchun
  // (menyu shakllanishi uchun kerak, ochiq konfiguratsiya)
  router.get('/api/features',async (ctx) => {
    const rows = await all("SELECT key, value FROM settings WHERE key LIKE 'feat_%'");
    const out = {};
    for (const r of rows) out[r.key.slice(5)] = r.value === '1' ? 1 : 0;

    // Agar tizimga kirgan foydalanuvchi bo'lsa va ADMIN bo'lmasa,
    // unga faqat o'ziga ruxsat berilgan funksiyalar qoldiriladi
    if (ctx.user && ctx.user.role !== 'ADMIN' && ctx.user.allowed_features) {
      let allowed = null;
      try {
        allowed = typeof ctx.user.allowed_features === 'string'
          ? JSON.parse(ctx.user.allowed_features)
          : ctx.user.allowed_features;
      } catch { allowed = null; }

      if (Array.isArray(allowed)) {
        for (const k of Object.keys(out)) {
          if (!allowed.includes(k)) out[k] = 0;
        }
      }
    }
    return out;
  }, { auth: false });

  router.put('/api/settings',async (ctx) => {
    for (const [k, v] of Object.entries(ctx.body || {})) await setSetting(k, v);
    await audit(ctx.user, 'SETTINGS_UPDATE', 'settings', null, ctx.body);
    return { ok: true };
  }, { roles: ['ADMIN'] });

  // ------------------------------------------------------------ Foydalanuvchilar
  router.get('/api/users', async () => (await all('SELECT * FROM users ORDER BY id')).map(publicUser), { roles: ['ADMIN'] });

  router.post('/api/users',async (ctx) => {
    const { login, password, full_name, role, warehouse_id, allowed_features, employee_id } = ctx.body || {};
    if (!login || !password) throw bad('Login va parol kerak / Нужны логин и пароль');
    await assertPassword(password);
    if (await get('SELECT id FROM users WHERE lower(login)=lower(?)', login)) {
      throw bad('Bu login band / Такой логин уже занят');
    }
    const featStr = Array.isArray(allowed_features)
      ? JSON.stringify(allowed_features)
      : (allowed_features || null);
    const { hash, salt } = hashPassword(password);

    // Foydalanuvchi xodimga bog'lanmagan bo'lsa — avtomatik xodim yaratamiz.
    // Shu sababli "Xodim (sotuvlar uchun)" maydonini forma'da ko'rsatish shart emas.
    let empId = employee_id || null;
    let autoEmployee = null;
    if (!empId) {
      const empName = full_name || login;
      const code = 'U' + String(login).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
        + '-' + Date.now().toString(36).slice(-3).toUpperCase();
      const pos = role === 'CASHIER' ? 'CASHIER' : (role === 'OBSERVER' ? 'Kuzatuvchi' : 'Ombor mudiri');
      const ins = await run(
        `INSERT INTO catalog_employees (code, name_uz, name_ru, position, warehouse_id, is_active)
         VALUES (?,?,?,?,?,1)`,
        code, empName, empName, pos, warehouse_id || null
      );
      empId = Number(ins.lastInsertRowid);
      autoEmployee = empId;
    }

    const res = await run(
      'INSERT INTO users (login, password_hash, salt, full_name, role, warehouse_id, allowed_features, employee_id) VALUES (?,?,?,?,?,?,?,?)',
      login, hash, salt, full_name || login, role || 'OBSERVER', warehouse_id || null, featStr, empId
    );
    const id = Number(res.lastInsertRowid);
    await audit(ctx.user, 'USER_CREATE', 'user', id, { login, employee_id: empId, auto: !!autoEmployee });
    const out = publicUser(await get('SELECT * FROM users WHERE id=?', id));
    if (autoEmployee) out.auto_employee_id = autoEmployee;
    return out;
  }, { roles: ['ADMIN'] });

  router.put('/api/users/:id',async (ctx) => {
    const id = Number(ctx.params.id);
    const u = await get('SELECT * FROM users WHERE id=?', id);
    if (!u) throw notFound();
    const b = ctx.body || {};
    const featStr = b.allowed_features !== undefined
      ? (Array.isArray(b.allowed_features) ? JSON.stringify(b.allowed_features) : b.allowed_features)
      : u.allowed_features;
    await run(
      'UPDATE users SET full_name=?, role=?, warehouse_id=?, is_active=?, allowed_features=?, employee_id=? WHERE id=?',
      b.full_name ?? u.full_name, b.role ?? u.role,
      b.warehouse_id === undefined ? u.warehouse_id : b.warehouse_id,
      b.is_active === undefined ? u.is_active : (b.is_active ? 1 : 0),
      featStr,
      b.employee_id === undefined ? u.employee_id : (b.employee_id || null),
      id
    );
    if (b.password) {
      await assertPassword(b.password);
      const { hash, salt } = hashPassword(b.password);
      await run('UPDATE users SET password_hash=?, salt=? WHERE id=?', hash, salt, id);
    }
    await audit(ctx.user, 'USER_UPDATE', 'user', id, { login: u.login });
    return publicUser(await get('SELECT * FROM users WHERE id=?', id));
  }, { roles: ['ADMIN'] });

  router.del('/api/users/:id',async (ctx) => {
    const id = Number(ctx.params.id);
    if (id === ctx.user.id) throw bad('O‘zini o‘chira olmaysiz / Нельзя удалить себя');
    if ((await get('SELECT COUNT(*) AS c FROM users')).c <= 1) throw bad('Oxirgi foydalanuvchini o‘chira olmaysiz');
    await run('DELETE FROM users WHERE id=?', id);
    await audit(ctx.user, 'USER_DELETE', 'user', id);
    return { ok: true };
  }, { roles: ['ADMIN'] });

  // ------------------------------------------------------------ Eksport (CSV)
  router.get('/api/export/:kind',async (ctx) => {
    const kind = ctx.params.kind;
    const kindMeta = CATALOGS[kind];
    let rows = [];

    if (kindMeta) {
      rows = await all(`SELECT * FROM ${kindMeta.table} ORDER BY ${kindMeta.order} LIMIT 100000`);
    } else if (kind === 'balances') {
      rows = await all(
        `SELECT w.name_ru AS ombor, l.code AS joylashuv, p.sku, p.barcode,
                p.name_ru, p.name_uz, b.qty, b.amount, p.min_stock
           FROM reg_stock_balances b
           JOIN catalog_products p ON p.id = b.product_id
           LEFT JOIN catalog_warehouses w ON w.id = b.warehouse_id
           LEFT JOIN catalog_locations l ON l.id = b.location_id
          ORDER BY w.code, p.sku`);
    } else if (kind === 'movements') {
      rows = await all(
        `SELECT m.date, d.type, d.number, p.sku, p.name_ru, w.name_ru AS ombor,
                m.qty_in, m.qty_out, m.price, m.amount
           FROM reg_stock_movements m
           JOIN catalog_products p ON p.id = m.product_id
           LEFT JOIN catalog_warehouses w ON w.id = m.warehouse_id
           LEFT JOIN documents d ON d.id = m.document_id
          ORDER BY m.date, m.id LIMIT 200000`);
    } else if (kind === 'documents') {
      rows = await all(
        `SELECT d.date, d.type, d.number, d.status, w.name_ru AS ombor, w2.name_ru AS ombor_2,
                cp.name_ru AS kontragent, d.total_qty, d.total_amount, d.note
           FROM documents d
           LEFT JOIN catalog_warehouses w ON w.id = d.warehouse_id
           LEFT JOIN catalog_warehouses w2 ON w2.id = d.dest_warehouse_id
           LEFT JOIN catalog_counterparties cp ON cp.id = d.counterparty_id
          ORDER BY d.date, d.number LIMIT 100000`);
    } else if (kind === 'debt') {
      rows = await all(
        `SELECT cp.code, cp.name_ru, cp.name_uz, COALESCE(SUM(m.amount),0) AS qarz
           FROM catalog_counterparties cp
           LEFT JOIN reg_debt_movements m ON m.counterparty_id = cp.id
          GROUP BY cp.id ORDER BY ABS(COALESCE(SUM(m.amount),0)) DESC`);
    } else {
      throw notFound('Eksport turi topilmadi / Неизвестный вид экспорта: ' + kind);
    }

    const csv = await toCsv(rows);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const filename = `${kind}-${stamp}.csv`;
    const buf = Buffer.from(csv, 'utf8');
    ctx.res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Length': buf.length,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    ctx.res.end(buf);
    return null;   // javob allaqachon yuborilgan
  });

  // ------------------------------------------------------------ Import (CSV -> katalog)
  router.post('/api/import/:kind',async (ctx) => {
    const kind = ctx.params.kind;
    const meta = CATALOGS[kind];
    if (!meta) throw notFound('Import turi topilmadi: ' + kind);
    const csv = String((ctx.body || {}).csv || '');

    return tx(async () => {
      const lines = csv.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) throw bad('CSV bo‘sh / Пустой CSV');
      const header = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
      const idx = (name) => header.indexOf(name);
      const table = meta.table;
      const boolFields = meta.fields.filter((f) => f.type === 'bool').map((f) => f.name);
      const keyField = kind === 'products' ? 'sku'
        : (meta.fields.find((f) => f.name === 'code') ? 'code' : null);

      let inserted = 0, updated = 0;
      const errors = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const cells = parseCsvLine(lines[i]);
          const obj = {};
          for (const f of meta.fields) {
            const j = idx(f.name);
            if (j >= 0 && cells[j] !== undefined && cells[j] !== '') obj[f.name] = cells[j];
          }
          for (const b of boolFields) {
            if (obj[b] !== undefined) obj[b] = /^(1|true|ha|да|yes)$/i.test(String(obj[b])) ? 1 : 0;
          }
          const cols = Object.keys(obj);
          if (!cols.length) continue;

          const existing = keyField && obj[keyField]
            ? await get(`SELECT id FROM ${table} WHERE ${keyField} = ?`, obj[keyField])
            : null;

          if (existing) {
            await run(`UPDATE ${table} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE id=?`,
              ...cols.map((c) => obj[c]), existing.id);
            updated++;
          } else {
            await run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
              ...cols.map((c) => obj[c]));
            inserted++;
          }
        } catch (e) {
          if (errors.length < 20) errors.push(`Qator ${i + 1}: ${e.message}`);
        }
      }
      await audit(ctx.user, 'IMPORT', kind, null, { inserted, updated });
      return { inserted, updated, errors };
    });
  });

  // ------------------------------------------------------------ Backup
  router.post('/api/system/backup',async (ctx) => {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(dir, `ombor-${stamp}.db`);
    await run('PRAGMA wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(DB_FILE, dest);
    await audit(ctx.user, 'BACKUP', 'system', null, { file: path.basename(dest) });
    return { ok: true, file: path.basename(dest), size: fs.statSync(dest).size };
  }, { roles: ['ADMIN'] });

  router.get('/api/system/audit', async (ctx) =>
    await all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', Math.min(Number(ctx.query.limit) || 200, 2000)),
    { roles: ['ADMIN'] });

  // ------------------------------------------------------------ Mening statistikam
  // Kassir/ishchi uchun — FAQAT o'z statistikasi (o'zgartirish huquqi yo'q)
  router.get('/api/my-stats',async (ctx) => {
    const empId = ctx.user.employee_id || null;
    if (!empId) return { employee: null, rows: [], month: { qty: 0, amount: 0, docs: 0 } };

    const emp = await get('SELECT * FROM catalog_employees WHERE id=?', empId);
    if (!emp) return { employee: null, rows: [], month: { qty: 0, amount: 0, docs: 0 } };

    const month = new Date().toISOString().slice(0, 7);
    const m = await get(
      `SELECT COUNT(*) AS docs, COALESCE(SUM(total_qty),0) AS qty, COALESCE(SUM(total_amount),0) AS amount
         FROM documents
        WHERE employee_id = ? AND type='ISSUE' AND status='POSTED' AND base_type='SALE'
          AND substr(date,1,7) = ?`,
      empId, month
    );
    const total = await get(
      `SELECT COUNT(*) AS docs, COALESCE(SUM(total_qty),0) AS qty, COALESCE(SUM(total_amount),0) AS amount
         FROM documents
        WHERE employee_id = ? AND type='ISSUE' AND status='POSTED' AND base_type='SALE'`,
      empId
    );

    // kunlik (90 kun) — diagramma uchun
    const daily = await all(
      `SELECT date, SUM(total_qty) AS qty, SUM(total_amount) AS amount, COUNT(*) AS docs
         FROM documents
        WHERE employee_id = ? AND type='ISSUE' AND status='POSTED' AND base_type='SALE'
          AND date >= date('now','-89 days')
        GROUP BY date ORDER BY date`,
      empId
    );

    const sales = m.amount || 0;
    const limit = emp.sales_limit || 0;
    const over = Math.max(0, sales - limit);
    const bonus = Math.round(over * (emp.bonus_percent || 0) / 100);

    return {
      employee: {
        id: emp.id, name_uz: emp.name_uz, name_ru: emp.name_ru, position: emp.position,
        base_salary: emp.base_salary, sales_limit: emp.sales_limit, bonus_percent: emp.bonus_percent,
      },
      month: { ...m, month },
      total,
      daily,
      bonus: { over_limit: over, amount: bonus, rate: emp.bonus_percent || 0 },
    };
  });

  // ------------------------------------------------------------ Ishchilar oyligi
  const salary = require('../services/salary');

  // Ishchilar ro'yxati + oylik + sotuv + bonus
  router.get('/api/salary/list', async (ctx) => await salary.salaryList(), { roles: ['ADMIN'] });

  // Xodim bonus tarixi
  router.get('/api/salary/history/:id', async (ctx) =>
    await salary.bonusHistory(Number(ctx.params.id)), { roles: ['ADMIN'] });

  // Xodim oylik/limit/bonusini sozlash
  router.put('/api/salary/:id',async (ctx) => {
    const id = Number(ctx.params.id);
    const emp = await get('SELECT * FROM catalog_employees WHERE id=?', id);
    if (!emp) throw notFound('Xodim topilmadi / Сотрудник не найден');
    const b = ctx.body || {};
    await run(
      `UPDATE catalog_employees SET base_salary=?, sales_limit=?, bonus_percent=? WHERE id=?`,
      Math.max(0, Number(b.base_salary ?? emp.base_salary) || 0),
      Math.max(0, Number(b.sales_limit ?? emp.sales_limit) || 0),
      Math.min(100, Math.max(0, Number(b.bonus_percent ?? emp.bonus_percent) || 0)),
      id
    );
    await audit(ctx.user, 'SALARY_UPDATE', 'employee', id, { base_salary: b.base_salary, sales_limit: b.sales_limit, bonus_percent: b.bonus_percent });
    return get('SELECT * FROM catalog_employees WHERE id=?', id);
  }, { roles: ['ADMIN'] });
}

module.exports = {
  register, createSession, readSession, destroySession, can, permsOf,
  ROLES, PERMISSIONS, toCsv, parseCsvLine, publicUser,
};
