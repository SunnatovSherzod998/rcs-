/**
 * API mijozi
 */
const state = {
  token: localStorage.getItem('ombor_token') || null,
  user: JSON.parse(localStorage.getItem('ombor_user') || 'null'),
  permissions: JSON.parse(localStorage.getItem('ombor_perms') || '[]'),
  meta: null,
  lang: localStorage.getItem('ombor_lang') || 'uz',
};

const listeners = new Set();
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((f) => f(state.user)); }

export const auth = {
  get user() { return state.user; },
  get token() { return state.token; },
  get permissions() { return state.permissions; },
  get isAdmin() { return state.user?.role === 'ADMIN'; },
  /** role === '*' yoki ro'yxatda bor */
  can(perm) {
    const p = state.permissions;
    return p.includes('*') || p.includes(perm);
  },
  isAuthed() { return !!state.token; },
};

export class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

async function request(method, path, body, opts = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;

  const res = await fetch(path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && !opts.noAuthRetry) {
    logout();
    throw new ApiError(401, 'Sessiya tugadi / Сессия истекла');
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = isJson ? (payload?.error?.message || 'Xato') : String(payload);
    throw new ApiError(res.status, msg, isJson ? payload?.error?.code : null);
  }
  return isJson ? payload.data : payload;
}

function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, v);
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

export const api = {
  get: (path, params) => request('GET', path + qs(params)),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  del: (path) => request('DELETE', path),

  async login(login, password) {
    const data = await request('POST', '/api/auth/login', { login, password }, { noAuthRetry: true });
    state.token = data.token;
    state.user = data.user;
    state.permissions = data.permissions || [];
    localStorage.setItem('ombor_token', data.token);
    localStorage.setItem('ombor_user', JSON.stringify(data.user));
    localStorage.setItem('ombor_perms', JSON.stringify(state.permissions));
    emit();
    return data;
  },

  async logout() {
    try { if (state.token) await request('POST', '/api/auth/logout'); } catch { /* noop */ }
    state.token = null; state.user = null; state.permissions = [];
    localStorage.removeItem('ombor_token');
    localStorage.removeItem('ombor_user');
    localStorage.removeItem('ombor_perms');
    emit();
  },

  /** CSV yuklab olish (brauzer orqali) */
  async download(kind, filename) {
    const res = await fetch('/api/export/' + kind + qs({ token: state.token }));
    if (!res.ok) throw new ApiError(res.status, 'Eksport xatosi / Ошибка экспорта');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || kind + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

export function setWarehouseFilter(id) {
  localStorage.setItem('ombor_wh', id || '');
}
export function getWarehouseFilter() {
  return localStorage.getItem('ombor_wh') || '';
}
