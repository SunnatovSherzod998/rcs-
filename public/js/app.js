/**
 * CRS — asosiy ilova: login, menyu, router
 */
import { api, auth, onAuthChange, getWarehouseFilter, setWarehouseFilter } from './api.js';
import { t, tl, getLang, toggleLang } from './i18n.js';
import { h, spinner, attachPasswordToggle } from './ui.js';

import { dashboard } from './pages/dashboard.js';
import { posPage } from './pages/pos.js';
import { catalogPage } from './pages/catalog.js';
import { journalPage } from './pages/journal.js';
import { openEditor } from './pages/editor.js';
import { planPage } from './pages/plan.js';
import {
  balancesPage, movementsPage, turnoverPage, debtPage, pricesPage, productCard,
} from './pages/registers.js';
import {
  turnoverReport, profitReport, salesReport, purchasesReport,
  writeoffReport, invDiffReport, belowMinReport, auditReport,
} from './pages/reports.js';
import { usersPage, settingsPage, dataPage } from './pages/system.js';
import { employeePage, salaryPage } from './pages/salary.js';
import { myStatsPage } from './pages/mystats.js';
import { loadFeatures, feat, clearFeatures, DOC_FEAT } from './features.js';

// ------------------------------------------------------------ MENU

const MENU = [
  { key: 'pos', feat: 'pos', icon: '🛒', label: 'm_pos', perm: 'pos.use' },
  { key: 'dashboard', feat: 'boshqaruv_paneli', icon: '▦', label: 'm_dashboard', perm: null },
  { key: 'my/stats', feat: 'xodimlar', icon: '📈', label: 'my_stats', perm: null, hideAdmin: true },
  { group: 'm_catalogs' },
  { key: 'cat/products', feat: 'nomenklatura', icon: '☰', label: 'm_products', perm: 'catalogs.read' },
  { key: 'cat/warehouses', feat: 'omborlar', icon: '🏢', label: 'm_warehouses', perm: 'catalogs.read' },
  { key: 'cat/locations', feat: 'joylashuvlar', icon: '▤', label: 'm_locations', perm: 'locations.read' },
  { key: 'cat/counterparties', feat: 'kontragentlar', icon: '👤', label: 'm_counterparties', perm: 'catalogs.read' },
  { key: 'cat/categories', feat: 'toifalar', icon: '◈', label: 'm_categories', perm: 'catalogs.read' },
  { key: 'cat/brands', feat: 'brendlar', icon: '★', label: 'm_brands', perm: 'catalogs.read' },
  { key: 'cat/units', feat: 'birliklar', icon: '⚖', label: 'm_units', perm: 'catalogs.read' },
  { key: 'cat/employees', feat: 'xodimlar', icon: '🧑', label: 'm_employees', perm: 'catalogs.read' },
  { key: 'cat/currencies', feat: 'valyutalar', icon: '₽', label: 'm_currencies', perm: 'catalogs.read' },

  { group: 'm_documents' },
  { key: 'doc/jour', feat: 'jurnal', icon: '📋', label: 'm_journal', perm: 'documents.read' },
  { key: 'doc/RECEIPT', feat: 'kirim', icon: '↓', label: 'm_receipt', perm: 'documents.read' },
  { key: 'doc/ISSUE', feat: 'chiqim', icon: '↑', label: 'm_issue', perm: 'documents.read' },
  { key: 'doc/TRANSFER', feat: 'transfer', icon: '⇄', label: 'm_transfer', perm: 'documents.read' },
  { key: 'doc/PLACEMENT', feat: 'joylash', icon: '▩', label: 'm_placement', perm: 'documents.read' },
  { key: 'doc/PICK', feat: 'yigish', icon: '▤', label: 'm_pick', perm: 'documents.read' },
  { key: 'doc/INVENTORY', feat: 'inventarizatsiya', icon: '☑', label: 'm_inventory', perm: 'documents.read' },
  { key: 'doc/PAYMENT', feat: 'tolov', icon: '₽', label: 'm_payment', perm: 'documents.read' },
  { key: 'doc/OPENING', feat: 'boshlangich', icon: '⏱', label: 'm_opening', perm: 'documents.read' },

  { group: 'm_registers' },
  { key: 'reg/balances', feat: 'qoldiqlar', icon: '▦', label: 'm_balances', perm: 'registers.read' },
  { key: 'reg/movements', feat: 'harakatlar', icon: '⇅', label: 'm_movements', perm: 'registers.read' },
  { key: 'reg/turnover', feat: 'aylanma', icon: '🧾', label: 'm_turnover', perm: 'registers.read' },
  { key: 'reg/debt', feat: 'qarz', icon: '⇄', label: 'm_debt', perm: 'registers.read' },
  { key: 'reg/prices', feat: 'narxlar', icon: '¤', label: 'm_prices', perm: 'registers.read' },

  { group: 'm_reports' },
  { key: 'rep/turnover', feat: 'his_aylanma', icon: '📈', label: 'm_turnover_md', perm: 'reports.read' },
  { key: 'rep/sales', feat: 'his_sotuv', icon: '💰', label: 'm_sales', perm: 'reports.read' },
  { key: 'rep/purchases', feat: 'his_xarid', icon: '🛒', label: 'm_purchases', perm: 'reports.read' },
  { key: 'rep/profit', feat: 'his_foyda', icon: '📊', label: 'm_profit', perm: 'reports.read' },
  { key: 'rep/writeoff', feat: 'his_yozib', icon: '🗑', label: 'm_writeoff', perm: 'reports.read' },
  { key: 'rep/invdiff', feat: 'his_invdiff', icon: '⚖', label: 'm_invdiff', perm: 'reports.read' },
  { key: 'rep/belowmin', feat: 'his_min', icon: '🔻', label: 'm_belowmin', perm: 'reports.read' },

  { group: 'm_system' },
  { key: 'sys/users', feat: 'foydalanuvchilar', icon: '🛡', label: 'm_users', perm: null, admin: true },
  { key: 'sys/data', feat: 'ma_lumotlar', icon: '💾', label: 'm_data', perm: 'import' },
  { key: 'sys/audit', feat: 'audit', icon: '📜', label: 'm_audit', perm: null, admin: true },
  { key: 'sys/settings', feat: 'sozlamalar', icon: '⚙', label: 'm_settings', perm: null, admin: true },
];

// ------------------------------------------------------------ ROUTES

/** Ba'zi sahifalar alohida ruxsat talab qiladi (URL orqali kirishda ham tekshiriladi) */
const ROUTE_PERM = {
  'cat/locations': 'locations.read',
  pos: 'pos.use',
};

/** Har bir marshrut qaysi funksiyaga tegishli (sozlamadan o'chirilgan bo'lsa — kirish taqiqlanadi) */
const ROUTE_FEAT = Object.fromEntries(MENU.filter((m) => m.key).map((m) => [m.key, m.feat]));

const ROUTES = {
  pos: (root) => posPage(root),
  dashboard: (root) => dashboard(root),
  'cat/products': (root) => catalogPage('products', root),
  'cat/warehouses': (root) => catalogPage('warehouses', root),
  'cat/locations': (root) => catalogPage('locations', root),
  'cat/counterparties': (root) => catalogPage('counterparties', root),
  'cat/categories': (root) => catalogPage('categories', root),
  'cat/brands': (root) => catalogPage('brands', root),
  'cat/units': (root) => catalogPage('units', root),
  'cat/employees': (root) => employeePage(root),
  'cat/currencies': (root) => catalogPage('currencies', root),

  'doc/jour': (root) => journalPage(root, null),
  'doc/RECEIPT': (root) => journalPage(root, 'RECEIPT'),
  'doc/ISSUE': (root) => journalPage(root, 'ISSUE'),
  'doc/TRANSFER': (root) => journalPage(root, 'TRANSFER'),
  'doc/PLACEMENT': (root) => journalPage(root, 'PLACEMENT'),
  'doc/PICK': (root) => journalPage(root, 'PICK'),
  'doc/INVENTORY': (root) => journalPage(root, 'INVENTORY'),
  'doc/PAYMENT': (root) => journalPage(root, 'PAYMENT'),
  'doc/OPENING': (root) => journalPage(root, 'OPENING'),

  'plan': (root) => planPage(root),
  'reg/balances': (root) => balancesPage(root),
  'reg/movements': (root) => movementsPage(root),
  'reg/turnover': (root) => turnoverPage(root),
  'reg/debt': (root) => debtPage(root),
  'reg/prices': (root) => pricesPage(root),

  'rep/turnover': (root) => turnoverReport(root),
  'rep/sales': (root) => salesReport(root),
  'rep/purchases': (root) => purchasesReport(root),
  'rep/profit': (root) => profitReport(root),
  'rep/writeoff': (root) => writeoffReport(root),
  'rep/invdiff': (root) => invDiffReport(root),
  'rep/belowmin': (root) => belowMinReport(root),
  'rep/audit': (root) => auditReport(root),

  'sys/users': (root) => usersPage(root),
  'sys/salary': (root) => salaryPage(root),
  'my/stats': (root) => myStatsPage(root),
  'sys/data': (root) => dataPage(root),
  'sys/audit': (root) => auditReport(root),
  'sys/settings': (root) => settingsPage(root),
};

// ------------------------------------------------------------ APP state

let current = 'dashboard';
const $ = (id) => document.getElementById(id);

export function go(route) {
  if (location.hash.slice(1) !== route) { location.hash = route; return; }
  render();
}

/** Tizimda mavjud bo'lgan birinchi ochiq sahifa (dashboard o'chirilgan bo'lsa) */
export function getDefaultRoute() {
  if (feat('boshqaruv_paneli')) return 'dashboard';
  for (const item of MENU) {
    if (item.key && (!item.feat || feat(item.feat)) && (!item.admin || auth.isAdmin) && (!item.perm || auth.can(item.perm))) {
      return item.key;
    }
  }
  return 'sys/settings';
}

async function render() {
  const root = $('content');
  await loadFeatures();          // sozlamadagi yoqilgan funksiyalarni hisobga olish
  const hash = location.hash.slice(1) || getDefaultRoute();

  // maxsus route'lar
  if (hash.startsWith('doc/new/')) {
    const type = hash.split('/')[2];
    const featKey = DOC_FEAT[type];
    if (featKey && !feat(featKey)) {
      current = getDefaultRoute();
      return go(current);
    }
    return openEditor(type, null, () => render());
  }
  if (hash.startsWith('doc/open/')) {
    const id = Number(hash.split('/')[2]);
    const d = await api.get('/api/documents/' + id);
    return openEditor(d.type, id, () => render(), true);
  }
  if (hash.startsWith('card/')) {
    return productCard(Number(hash.split('/')[2]), getWarehouseFilter());
  }
  if (hash.startsWith('plan/room/')) {
    if (!feat('bino_reja')) {
      current = getDefaultRoute();
      return go(current);
    }
    return planPage(root, Number(hash.split('/')[2]));
  }

  const fn = ROUTES[hash];
  if (!fn) { current = getDefaultRoute(); return go(current); }
  // funksiya sozlamada o'chirilgan bo'lsa — kirish taqiqlanadi
  if (ROUTE_FEAT[hash] && !feat(ROUTE_FEAT[hash])) {
    // Administrator har doim sozlamalarga kira olsin
    if (hash !== 'sys/settings' || !auth.isAdmin) {
      current = getDefaultRoute();
      return go(current);
    }
  }
  // ruxsat yo'q bo'lsa (masalan, kassir → joylashuvlar) — ruxsat berilgan sahifaga
  if (ROUTE_PERM[hash] && !auth.can(ROUTE_PERM[hash])) {
    current = getDefaultRoute();
    return go(current);
  }
  current = hash;

  // menyu faolligi
  document.querySelectorAll('.menu-item').forEach((el) =>
    el.classList.toggle('active', el.dataset.key === hash));

  root.replaceChildren(spinner());
  try {
    await fn(root);
  } catch (e) {
    root.replaceChildren(h('div', { class: 'alert alert-err' },
      h('b', { text: t('error') + ': ' }), e.message));
  }
}

export function buildMenu() {
  const sb = $('sidebar');
  if (!sb) return;
  const counts = { drafts: 0 };
  sb.replaceChildren();

  let pendingGroup = null;
  let hasItemsInGroup = false;

  for (const item of MENU) {
    if (item.group) {
      pendingGroup = h('div', { class: 'menu-group' }, h('div', { class: 'menu-title', text: t(item.group) }));
      hasItemsInGroup = false;
      continue;
    }
    if (item.admin && !auth.isAdmin) continue;
    if (item.hideAdmin && auth.isAdmin) continue;   // admin o'z statistasini "Ishchilar oyligi" da ko'radi
    if (item.feat && !feat(item.feat)) continue;
    if (item.perm && !auth.can(item.perm)) continue;

    // Guruhda kamida bitta ko'rinadigan band bo'lsa, guruh sarlavhasini chiqaramiz
    if (pendingGroup && !hasItemsInGroup) {
      sb.append(pendingGroup);
      hasItemsInGroup = true;
    }

    const el = h('div', { class: 'menu-item', dataset: { key: item.key }, onclick: () => go(item.key) },
      h('span', { class: 'mi-ico', text: item.icon }),
      h('span', { text: t(item.label) })
    );
    if (item.key === 'doc/jour' && counts.drafts > 0) {
      el.append(h('span', { class: 'menu-badge warn', text: String(counts.drafts) }));
    }
    sb.append(el);
  }

  sb.append(h('div', { class: 'sidebar-foot' },
    h('div', { text: 'CRS v1.1' }),
    h('div', { text: 'Node.js ' + (window.__node || '') })));

  const curHash = location.hash.slice(1) || 'dashboard';
  document.querySelectorAll('.menu-item').forEach((el) =>
    el.classList.toggle('active', el.dataset.key === curHash));
}

async function refreshDrafts() {
  try {
    const c = await api.get('/api/meta/counts');
    const el = document.querySelector('.menu-item[data-key="doc/jour"] .menu-badge');
    if (c.drafts > 0) {
      if (el) el.textContent = String(c.drafts);
      else {
        const item = document.querySelector('.menu-item[data-key="doc/jour"]');
        if (item) item.append(h('span', { class: 'menu-badge warn', text: String(c.drafts) }));
      }
    } else if (el) el.remove();
  } catch { /* noop */ }
}

// ------------------------------------------------------------ LOGIN

function showLogin() {
  $('app').classList.remove('on');
  $('login').style.display = 'flex';
  applyLang();
  setTimeout(() => $('lgPass')?.focus(), 50);
}

async function showApp() {
  $('login').style.display = 'none';
  $('app').classList.add('on');
  applyLang();
  await loadFeatures();
  buildMenu();
  await loadWhFilter();
  render();
  refreshDrafts();
}

async function loadWhFilter() {
  const sel = $('whFilter');
  try {
    const whs = await api.get('/api/catalogs/warehouses/options', { limit: 500 });
    const cur = getWarehouseFilter();
    sel.replaceChildren(
      h('option', { value: '', text: t('all') + ' · ' + t('warehouse') }),
      ...whs.map((w) => h('option', {
        value: w.id, selected: String(cur) === String(w.id),
        text: (getLang() === 'uz' ? (w.name_uz || w.name_ru) : (w.name_ru || w.name_uz)),
      })));
    sel.onchange = () => { setWarehouseFilter(sel.value); render(); };
  } catch { /* noop */ }
}

function applyLang() {
  const uz = getLang() === 'uz';
  $('brandSub').textContent = t('app_subtitle');
  $('loginSub').textContent = t('app_subtitle');
  $('lblLogin').textContent = t('username');
  $('lblPass').textContent = t('password');
  $('btnLogin').textContent = t('sign_in');
  $('logoutBtn').textContent = t('logout');
  $('langBtn').textContent = uz ? 'RU' : 'UZ';
  // Parol tugmasi sarlavhani yangilash
  $('lgPass')?._pwToggle?.update();
  const u = auth.user;
  $('userChip').replaceChildren(
    h('span', { text: '👤' }),
    h('span', { text: u ? u.full_name + ' · ' + tl(u.role_label) : '' })
  );
}

// ------------------------------------------------------------ BOOT

window.addEventListener('hashchange', () => { if (auth.isAuthed()) render(); });

// Login parol maydonida ko'rsatish / yashirish tugmasi
attachPasswordToggle($('lgPass'));

// Login maydonlari har doim bo'sh bo'lsin (brauzer autofill'ini ham tozalaymiz)
function clearLoginFields() {
  $('lgLogin').value = '';
  $('lgPass').value = '';
}
clearLoginFields();
window.addEventListener('load', clearLoginFields);

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnEl = $('btnLogin');
  btnEl.disabled = true;
  $('loginErr').replaceChildren();
  try {
    await api.login($('lgLogin').value.trim(), $('lgPass').value);
    clearLoginFields();
    location.hash = 'dashboard';
    await showApp();
  } catch (err) {
    $('loginErr').replaceChildren(h('div', { class: 'alert alert-err', text: err.message }));
  } finally {
    btnEl.disabled = false;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await api.logout();
  clearFeatures();
  clearLoginFields();
  showLogin();
});

$('langBtn').addEventListener('click', () => {
  toggleLang();
  applyLang();
  buildMenu();
  if (auth.isAuthed()) { loadWhFilter(); render(); }
  else { $('loginHint').textContent = getLang() === 'uz' ? 'O‘zbekcha / Русский' : 'Русский / O‘zbekcha'; }
});

// F5 / klaviatura shortcut
document.addEventListener('keydown', (e) => {
  if (e.key === 'F5' && auth.isAuthed()) { e.preventDefault(); render(); refreshDrafts(); }
  if (e.key === 'F2' && auth.isAuthed() && e.target === document.body) {
    e.preventDefault();
    openEditor('RECEIPT', null, () => render());
  }
});

onAuthChange(() => {
  if (!auth.isAuthed()) { clearFeatures(); showLogin(); return; }
  // kirgandan keyin funksiyalarni yuklab, menyuni qayta quramiz
  loadFeatures(true).then(() => { buildMenu(); render(); });
});

// Sozlamalardan funksiyalar o'zgarganda menyu va sahifani yangilash
window.addEventListener('features-updated', () => {
  buildMenu();
  render();
});


// Sessiya tiklash
(async () => {
  if (auth.isAuthed()) {
    try {
      await api.get('/api/auth/me');
      location.hash = location.hash.slice(1) || 'dashboard';
      await showApp();
      return;
    } catch { await api.logout(); }
  }
  showLogin();
})();
