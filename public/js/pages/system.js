/**
 * TIZIM / СИСТЕМА: foydalanuvchilar, sozlamalar, import/export, zaxira nusxa
 */
import { api, auth } from '../api.js';
import { t, tl, getLang, fn } from '../i18n.js';
import {
  h, card, dataTable, pageHead, btn, iconBtn, modal, buildForm, confirmDialog,
  toast, spinner, num, fmtDate, attachPasswordToggle,
} from '../ui.js';
import { loadMeta, loadRefs } from './catalog.js';
import { FEATURES, FEATURE_KEYS, FEATURE_GROUPS, loadFeatures, feat, toSettings } from '../features.js';
import { buildMenu } from '../app.js';
import { attachPasswordMeter } from '../password-ui.js';
import { analyzePassword, passwordMessage } from '../password.mjs';

// ============================================================ FOYDALANUVCHILAR
export async function usersPage(root) {
  const state = { rows: [] };
  root.replaceChildren();
  root.append(pageHead(t('m_users'), t('m_system'),
    btn(t('add'), { icon: '＋', cls: 'btn-primary', onClick: () => formEditor(null) })));

  const box = h('div', {});
  root.append(card(null, box));

  async function load() {
    box.replaceChildren(spinner());
    state.rows = await api.get('/api/users');
    box.replaceChildren(dataTable({
      rows: state.rows,
      rowCls: (r) => (r.is_active ? '' : 'dim'),
      columns: [
        { key: 'id', title: 'ID', width: '50px', render: (r) => h('span', { class: 'dim mono', text: r.id }) },
        { key: 'login', title: t('username'), width: '150px', render: (r) => h('b', { text: r.login }) },
        { key: 'full_name', title: 'F.I.O.', render: (r) => r.full_name },
        { key: 'role', title: t('m_users'), width: '160px', render: (r) => h('span', { class: 'badge b-blue', text: tl(r.role_label) }) },
        { key: 'features', title: getLang() === 'uz' ? 'Ruxsatlar' : 'Разрешения', width: '150px',
          render: (r) => {
            if (r.role === 'ADMIN' || !r.allowed_features || r.allowed_features.length >= FEATURE_KEYS.length) {
              return h('span', { class: 'badge b-green', text: getLang() === 'uz' ? '✓ Barchasi' : '✓ Все' });
            }
            const count = Array.isArray(r.allowed_features) ? r.allowed_features.length : 0;
            return h('span', {
              class: 'badge b-blue',
              title: Array.isArray(r.allowed_features) ? r.allowed_features.join(', ') : '',
              text: `${count} / ${FEATURE_KEYS.length} ta`
            });
          } },
        { key: 'warehouse_id', title: t('warehouse'), width: '140px', render: (r) => r.warehouse_id || '—' },
        { key: 'last_login_at', title: t('opened'), width: '150px', render: (r) => r.last_login_at ? fmtDate(r.last_login_at) : '—' },
        { key: 'is_active', title: '', align: 'center', width: '70px',
          render: (r) => h('span', { class: 'badge ' + (r.is_active ? 'b-green' : 'b-gray'), text: r.is_active ? t('yes') : t('no') }) },
        { key: 'act', title: t('actions'), align: 'right', width: '80px', render: (r) =>
          h('div', { class: 'btn-row', style: { justifyContent: 'flex-end' } },
            iconBtn('✎', t('edit'), () => formEditor(r)),
            iconBtn('🗑', t('delete'), () => del(r))) },
      ],
      onRowClick: (r) => formEditor(r),
    }));
  }

  async function formEditor(row) {
    const meta = await loadMeta();
    const roles = (await api.get('/api/meta/info')).roles;
    const fields = [
      { name: 'login', type: 'text', required: !row, label: { uz: 'Login', ru: 'Логин' } },
      { name: 'full_name', type: 'text', required: true, label: { uz: 'F.I.O.', ru: 'Ф.И.О.' } },
      { name: 'role', type: 'select', required: true,
        options: roles.map((r) => ({ value: r.value, label: r.label })),
        label: { uz: 'Rol', ru: 'Роль' } },
      { name: 'warehouse_id', type: 'ref', ref: 'warehouses', label: { uz: 'Ombor', ru: 'Склад' } },
      { name: 'password', type: 'password', required: !row,
        label: { uz: row ? 'Yangi parol (ixtiyoriy)' : 'Parol', ru: row ? 'Новый пароль (необязательно)' : 'Пароль' } },
      { name: 'is_active', type: 'bool', label: { uz: 'Faol', ru: 'Активен' } },
    ];
    const form = buildForm(fields, row ? { ...row, password: '' } : { is_active: 1, role: 'OBSERVER' },
      await loadRefs());

    // Parol siyosati — jonli tekshiruv ro'yxati
    const pwMeter = attachPasswordMeter(form.inputs.password);

    const modalBody = h('div', {}, form.form);
    const featureSelector = createUserFeatureSelector(
      row ? row.allowed_features : null,
      () => form.inputs.role?.value
    );
    modalBody.append(featureSelector.el);

    if (!row && form.inputs.role) {
      form.inputs.role.addEventListener('change', () => {
        featureSelector.setByRole(form.inputs.role.value);
      });
      featureSelector.setByRole(form.inputs.role.value || 'OBSERVER');
    }

    const m = modal({
      title: (row ? t('edit') : t('add')) + ' · ' + t('m_users'),
      width: 780,
      body: modalBody,
      actions: (close) => [
        btn(t('cancel'), { onClick: close }),
        btn(t('save'), { cls: 'btn-primary', onClick: async () => {
          const v = form.collect();
          if (!v.password) delete v.password;

          // Parol siyosati — xato bo'lsa saqlanmaydi
          if (v.password) {
            const r = analyzePassword(v.password);
            if (!r.ok) {
              toast(passwordMessage(r), 'err');
              form.inputs.password.focus();
              pwMeter.update();
              return;
            }
          } else if (!row) {
            toast(getLang() === 'uz' ? 'Parol kiritish shart' : 'Введите пароль', 'err');
            form.inputs.password.focus();
            return;
          }

          if (!form.validate()) return;
          v.allowed_features = featureSelector.getAllowed();
          try {
            if (row) await api.put('/api/users/' + row.id, v);
            else await api.post('/api/users', v);
            toast(t('saved')); m.close(); load();
          } catch (e) { toast(e.message, 'err'); }
        } }),
      ],
    });
  }

  function del(r) {
    if (r.id === auth.user.id) { toast('O‘zini o‘chira olmaysiz', 'err'); return; }
    confirmDialog(`${t('confirm')} ${t('delete')} «${r.login}»?`, async () => {
      try { await api.del('/api/users/' + r.id); toast(t('deleted')); load(); }
      catch (e) { toast(e.message, 'err'); }
    });
  }

  await load();
}

/**
 * Foydalanuvchi uchun funksiyalarni tanlash bloki (Galochkalar bilan)
 */
function createUserFeatureSelector(initialAllowed, getRole) {
  const switches = new Map();
  const itemElements = [];
  const groupControllers = [];

  // Boshlang'ich holat: agar initialAllowed mavjud bo'lsa, ro'yxatdagilar faol, aks holda hammasi faol
  const isCustom = Array.isArray(initialAllowed);
  for (const f of FEATURES) {
    if (!f.key) continue;
    switches.set(f.key, isCustom ? initialAllowed.includes(f.key) : true);
  }

  const container = h('div', { class: 'user-feat-wrap' });

  // Sarlavha
  const headerBox = h('div', {},
    h('div', { class: 'user-feat-title',
      text: getLang() === 'uz' ? 'Ruxsat berilgan funksiyalar (Galochka bilan tanlang)' : 'Разрешённые функции (Выберите галочками)' }),
    h('p', { class: 'user-feat-sub',
      text: getLang() === 'uz'
        ? 'Ushbu foydalanuvchi tizimda faqat belgilangan (galochka qo‘yilgan) bo‘lim va funksiyalarni ko‘ra oladi.'
        : 'Этот пользователь сможет видеть и открывать только отмеченные галочками разделы и функции.' })
  );
  container.append(headerBox);

  // Qidiruv va boshqaruv paneli
  const searchInput = h('input', {
    type: 'search',
    placeholder: getLang() === 'uz' ? 'Funksiyalarni qidirish...' : 'Поиск функций...',
  });
  const searchWrap = h('div', { class: 'feat-search-wrap', style: { maxWidth: '280px' } },
    h('span', { class: 'search-icon', text: '🔍' }),
    searchInput
  );

  const statCount = h('span', { text: '' });
  const statFill = h('div', { class: 'feat-stat-fill' });
  const statBadge = h('div', { class: 'feat-stat-badge' },
    h('span', { class: 'feat-stat-bar' }, statFill),
    statCount
  );

  function updateGlobalStats() {
    const activeCount = FEATURE_KEYS.filter((k) => switches.get(k)).length;
    const total = FEATURE_KEYS.length;
    const pct = Math.round((activeCount / total) * 100);
    statCount.textContent = getLang() === 'uz'
      ? `${activeCount} / ${total} ta (${pct}%)`
      : `${activeCount} / ${total} (${pct}%)`;
    statFill.style.width = pct + '%';
    statFill.style.background = pct > 60 ? 'var(--ok)' : (pct > 25 ? 'var(--warn)' : 'var(--err)');
  }

  const rolePresets = {
    ADMIN: FEATURE_KEYS,
    CASHIER: ['pos', 'nomenklatura', 'kontragentlar', 'jurnal', 'kirim', 'chiqim', 'tolov', 'qoldiqlar', 'harakatlar', 'his_sotuv'],
    WAREHOUSE_MANAGER: [
      'nomenklatura', 'omborlar', 'bino_reja', 'joylashuvlar', 'kontragentlar', 'toifalar', 'brendlar', 'birliklar', 'xodimlar',
      'jurnal', 'kirim', 'chiqim', 'transfer', 'joylash', 'yigish', 'inventarizatsiya', 'tolov', 'boshlangich',
      'xarita2d', 'qoldiqlar', 'harakatlar', 'aylanma', 'qarz',
      'his_aylanma', 'his_sotuv', 'his_xarid', 'his_invdiff', 'his_min',
      'boshqaruv_paneli', 'ma_lumotlar'
    ],
    OBSERVER: [
      'boshqaruv_paneli', 'nomenklatura', 'omborlar', 'joylashuvlar', 'kontragentlar',
      'jurnal', 'qoldiqlar', 'harakatlar', 'aylanma', 'qarz',
      'his_aylanma', 'his_sotuv', 'his_xarid', 'his_min'
    ],
  };

  function applyPreset(keys) {
    const keySet = new Set(keys);
    for (const f of FEATURES) {
      if (!f.key) continue;
      switches.set(f.key, keySet.has(f.key));
    }
    for (const el of itemElements) {
      el.input.checked = keySet.has(el.f.key);
      el.updateUI();
    }
    for (const g of groupControllers) g.updateGroup();
    updateGlobalStats();
  }

  const btnAllOn = btn(getLang() === 'uz' ? '✓ Barchasi' : '✓ Все', {
    cls: 'btn-sm',
    onClick: () => {
      for (const f of FEATURES) { if (f.key) switches.set(f.key, true); }
      for (const el of itemElements) { el.input.checked = true; el.updateUI(); }
      for (const g of groupControllers) g.updateGroup();
      updateGlobalStats();
    },
  });

  const btnAllOff = btn(getLang() === 'uz' ? '✗ O‘chirish' : '✗ Снять', {
    cls: 'btn-sm',
    onClick: () => {
      for (const f of FEATURES) { if (f.key) switches.set(f.key, false); }
      for (const el of itemElements) { el.input.checked = false; el.updateUI(); }
      for (const g of groupControllers) g.updateGroup();
      updateGlobalStats();
    },
  });

  const btnByRole = btn(getLang() === 'uz' ? 'Rol bo‘yicha' : 'По роли', {
    cls: 'btn-sm btn-ghost',
    onClick: () => {
      const r = getRole ? getRole() : 'OBSERVER';
      applyPreset(rolePresets[r] || rolePresets.OBSERVER);
    },
  });

  const toolbar = h('div', { class: 'feat-toolbar', style: { padding: '8px 12px', marginBottom: '10px' } },
    searchWrap,
    h('div', { class: 'feat-actions' },
      btnAllOn,
      btnAllOff,
      btnByRole,
      statBadge
    )
  );
  container.append(toolbar);

  // Guruhlar
  for (const g of FEATURE_GROUPS) {
    const gFeatures = FEATURES.filter((f) => f.key && f.groupId === g.id);
    if (gFeatures.length === 0) continue;

    const groupChk = h('input', { type: 'checkbox', title: getLang() === 'uz' ? 'Guruhni tanlash' : 'Выбрать группу' });
    const groupBadge = h('span', { class: 'feat-group-badge', text: '' });
    const itemsGrid = h('div', { class: 'feat-items-grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', padding: '10px', gap: '8px' } });
    const groupCard = h('div', { class: 'feat-group-card', dataset: { group: g.id }, style: { marginBottom: '10px' } });

    const groupController = {
      group: g,
      card: groupCard,
      items: [],
      updateGroup() {
        const checkedCount = gFeatures.filter((f) => switches.get(f.key)).length;
        const total = gFeatures.length;
        groupBadge.textContent = `${checkedCount} / ${total}`;

        if (checkedCount === 0) {
          groupChk.checked = false;
          groupChk.indeterminate = false;
        } else if (checkedCount === total) {
          groupChk.checked = true;
          groupChk.indeterminate = false;
        } else {
          groupChk.checked = false;
          groupChk.indeterminate = true;
        }
      },
    };
    groupControllers.push(groupController);

    groupChk.addEventListener('change', () => {
      const val = groupChk.checked;
      for (const f of gFeatures) switches.set(f.key, val);
      for (const item of groupController.items) {
        item.input.checked = val;
        item.updateUI();
      }
      groupController.updateGroup();
      updateGlobalStats();
    });

    const groupHead = h('div', { class: 'feat-group-head', style: { padding: '7px 12px' } },
      h('label', { class: 'feat-group-title-row', style: { fontSize: '13px' } },
        groupChk,
        h('span', { style: { fontSize: '14px' }, text: g.icon }),
        h('span', { text: tl(g.label) })
      ),
      h('div', { class: 'feat-group-right' }, groupBadge)
    );

    for (const f of gFeatures) {
      const input = h('input', { type: 'checkbox', checked: switches.get(f.key) });
      const pill = h('span', { class: 'feat-pill' });
      const itemCard = h('label', { class: 'feat-item', dataset: { key: f.key }, style: { padding: '7px 9px', gap: '8px' } },
        input,
        h('span', { class: 'feat-item-ico', style: { fontSize: '15px' }, text: f.icon || '•' }),
        h('div', { class: 'feat-item-body' },
          h('div', { class: 'feat-item-title', style: { fontSize: '12px' } }, tl(f.label))
        ),
        h('div', { class: 'feat-item-side' }, pill)
      );

      function updateItemUI() {
        const on = input.checked;
        itemCard.classList.toggle('active', on);
        itemCard.classList.toggle('disabled', !on);
        pill.className = 'feat-pill ' + (on ? 'on' : 'off');
        pill.textContent = on ? (getLang() === 'uz' ? 'Ha' : 'Да') : (getLang() === 'uz' ? 'Yo‘q' : 'Нет');
      }

      input.addEventListener('change', () => {
        switches.set(f.key, input.checked);
        updateItemUI();
        groupController.updateGroup();
        updateGlobalStats();
      });

      updateItemUI();

      const itemObj = { f, el: itemCard, input, updateUI: updateItemUI };
      itemElements.push(itemObj);
      groupController.items.push(itemObj);
      itemsGrid.append(itemCard);
    }

    groupController.updateGroup();
    groupCard.append(groupHead, itemsGrid);
    container.append(groupCard);
  }

  // Qidiruv
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    for (const item of itemElements) {
      const nameUz = (item.f.label.uz || '').toLowerCase();
      const nameRu = (item.f.label.ru || '').toLowerCase();
      const key = item.f.key.toLowerCase();
      const match = !q || nameUz.includes(q) || nameRu.includes(q) || key.includes(q);
      item.el.style.display = match ? 'flex' : 'none';
    }
    for (const g of groupControllers) {
      const visibleItems = g.items.some((it) => it.el.style.display !== 'none');
      g.card.style.display = visibleItems ? 'block' : 'none';
    }
  });

  updateGlobalStats();

  return {
    el: container,
    getAllowed() {
      return [...switches.entries()].filter(([k, v]) => v).map(([k]) => k);
    },
    setByRole(role) {
      applyPreset(rolePresets[role] || rolePresets.OBSERVER);
    },
  };
}

// ============================================================ SOZLAMALAR
export async function settingsPage(root) {
  root.replaceChildren();
  root.append(pageHead(t('m_settings'), t('m_system')));
  const [settings, info, counts, currencies] = await Promise.all([
    api.get('/api/settings'), api.get('/api/meta/info'),
    api.get('/api/meta/counts'), api.get('/api/catalogs/currencies/options', { limit: 50 }),
    loadFeatures(true),
  ]);

  const sLang = h('select', {}, ...[['uz', 'O‘zbekcha'], ['ru', 'Русский']].map(([v, l]) =>
    h('option', { value: v, selected: (settings.default_language || 'uz') === v, text: l })));
  const sBase = h('select', {}, ...currencies.map((c) =>
    h('option', { value: c.code, selected: settings.base_currency === c.code, text: c.code + ' — ' + fn(c, 'name_uz', 'name_ru') })));
  const sNeg = h('input', { type: 'checkbox', checked: settings.negative_stock_block === '1' });
  const sPrefix = h('input', { type: 'text', value: settings.fiscal_prefix || '00000' });

  root.append(
    h('div', { class: 'cols-2' },
      card(getLang() === 'uz' ? 'Umumiy' : 'Общие',
        h('div', { class: 'form-grid' },
          fld(t('language'), sLang),
          fld(getLang() === 'uz' ? 'Asosiy valyuta' : 'Базовая валюта', sBase),
          fld(getLang() === 'uz' ? 'Manfiy qoldiqni bloklash' : 'Блокировать отрицательные остатки', chk(sNeg)),
          fld(getLang() === 'uz' ? 'Hujjat raqami formati' : 'Формат номера документа', sPrefix),
        ),
        h('div', { style: { marginTop: '12px', textAlign: 'right' } },
          btn(t('save'), { cls: 'btn-primary', onClick: async () => {
            try {
              await api.put('/api/settings', {
                default_language: sLang.value, base_currency: sBase.value,
                negative_stock_block: sNeg.checked ? '1' : '0', fiscal_prefix: sPrefix.value,
              });
              toast(t('saved'));
            } catch (e) { toast(e.message, 'err'); }
          } }))),

      card(getLang() === 'uz' ? 'Tizim ma’lumotlari' : 'Сведения о системе',
        h('dl', { class: 'kv' },
          h('dt', { text: t('app_name') }), h('dd', { text: info.name + ' v' + info.version }),
          h('dt', { text: 'Node.js' }), h('dd', { text: info.node }),
          h('dt', { text: getLang() === 'uz' ? 'Ma’lumotlar bazasi' : 'База данных' }), h('dd', { class: 'mono', text: info.db }),
          h('dt', { text: getLang() === 'uz' ? 'Papka' : 'Папка' }), h('dd', { class: 'mono', style: { fontSize: '11.5px' }, text: info.data_dir }),
          h('dt', { text: getLang() === 'uz' ? 'Tovarlar' : 'Товаров' }), h('dd', { text: num(counts.products) }),
          h('dt', { text: getLang() === 'uz' ? 'Omborlar' : 'Складов' }), h('dd', { text: num(counts.warehouses) }),
          h('dt', { text: getLang() === 'uz' ? 'Kontragentlar' : 'Контрагентов' }), h('dd', { text: num(counts.counterparties) }),
          h('dt', { text: t('m_documents') }), h('dd', { text: `${num(counts.documents)} (${num(counts.drafts)} ${t('st_draft').toLowerCase()})` }),
          h('dt', { text: getLang() === 'uz' ? 'Harakatlar' : 'Движений' }), h('dd', { text: num(counts.movements) })
        )),

      card(getLang() === 'uz' ? 'Zaxira nusxa' : 'Резервное копирование',
        h('p', { style: { fontSize: '13px', color: 'var(--text-dim)' },
          text: getLang() === 'uz'
            ? 'Ma’lumotlar bazasi nusxasi data/backups papkasiga saqlanadi.'
            : 'Копия базы данных сохраняется в папку data/backups.' }),
        btn(getLang() === 'uz' ? 'Hozir nusxa olish' : 'Создать копию', { icon: '⛁', cls: 'btn-primary',
          onClick: async () => {
            try { const r = await api.post('/api/system/backup'); toast(r.file + ' (' + num(r.size) + ' bayt)'); }
            catch (e) { toast(e.message, 'err'); }
          } })),

      auth.user ? card(getLang() === 'uz' ? 'Parolni o‘zgartirish' : 'Смена пароля',
        h('button', { class: 'btn', text: getLang() === 'uz' ? 'Parolni yangilash' : 'Изменить пароль',
          onClick: changePassword })) : null
    )
  );

  // ------------------------------------------------ SAYT FUNKSIYALARI
  root.append(h('div', { class: 'span-all', style: { marginTop: '16px' } }, featureCard()));

  function featureCard() {
    const switches = new Map();
    const itemElements = [];
    const groupControllers = [];

    // Barcha kalitlar uchun boshlang'ich holat
    for (const f of FEATURES) {
      if (!f.key) continue;
      switches.set(f.key, f.locked ? true : feat(f.key));
    }

    const container = h('div', { class: 'feat-container' });

    // ---------------- Toolbar (Qidiruv, tugmalar, hisoblagich)
    const searchInput = h('input', {
      type: 'search',
      placeholder: getLang() === 'uz'
        ? 'Funksiyalarni qidirish... (nomi, kodi yoki tavsifi)'
        : 'Поиск функций... (название, код или описание)',
    });
    const searchWrap = h('div', { class: 'feat-search-wrap' },
      h('span', { class: 'search-icon', text: '🔍' }),
      searchInput
    );

    const statCount = h('span', { text: '' });
    const statFill = h('div', { class: 'feat-stat-fill' });
    const statBadge = h('div', { class: 'feat-stat-badge' },
      h('span', { class: 'feat-stat-bar' }, statFill),
      statCount
    );

    function updateGlobalStats() {
      const activeCount = FEATURE_KEYS.filter((k) => switches.get(k)).length;
      const total = FEATURE_KEYS.length;
      const pct = Math.round((activeCount / total) * 100);
      statCount.textContent = getLang() === 'uz'
        ? `Faol: ${activeCount} / ${total} (${pct}%)`
        : `Активно: ${activeCount} / ${total} (${pct}%)`;
      statFill.style.width = pct + '%';
      statFill.style.background = pct > 60 ? 'var(--ok)' : (pct > 25 ? 'var(--warn)' : 'var(--err)');
    }

    const saveBtn = btn(getLang() === 'uz' ? '💾 Saqlash' : '💾 Сохранить', {
      cls: 'btn-primary',
      onClick: async () => {
        saveBtn.disabled = true;
        try {
          await api.put('/api/settings', toSettings(switches));
          await loadFeatures(true);
          buildMenu();
          window.dispatchEvent(new CustomEvent('features-updated'));
          toast(getLang() === 'uz' ? 'Barcha funksiyalar sozlamasi muvaffaqiyatli saqlandi!' : 'Настройки функций успешно сохранены!');
          updateGlobalStats();
        } catch (e) {
          toast(e.message, 'err');
        } finally {
          saveBtn.disabled = false;
        }
      },
    });

    const btnAllOn = btn(getLang() === 'uz' ? '✓ Hammasini yoqish' : '✓ Включить всё', {
      cls: 'btn-sm',
      onClick: () => {
        for (const f of FEATURES) {
          if (!f.key) continue;
          switches.set(f.key, true);
        }
        for (const el of itemElements) {
          el.input.checked = true;
          el.updateUI();
        }
        for (const g of groupControllers) g.updateGroup();
        updateGlobalStats();
      },
    });

    const btnAllOff = btn(getLang() === 'uz' ? '✗ Hammasini o‘chirish' : '✗ Выключить всё', {
      cls: 'btn-sm',
      onClick: () => {
        for (const f of FEATURES) {
          if (!f.key) continue;
          if (f.locked) { switches.set(f.key, true); continue; }
          switches.set(f.key, false);
        }
        for (const el of itemElements) {
          if (el.f.locked) continue;
          el.input.checked = false;
          el.updateUI();
        }
        for (const g of groupControllers) g.updateGroup();
        updateGlobalStats();
      },
    });

    const toolbar = h('div', { class: 'feat-toolbar' },
      searchWrap,
      h('div', { class: 'feat-actions' },
        btnAllOn,
        btnAllOff,
        statBadge,
        saveBtn
      )
    );
    container.append(toolbar);

    // ---------------- Guruhlar bo'yicha kartalar
    for (const g of FEATURE_GROUPS) {
      const gFeatures = FEATURES.filter((f) => f.key && f.groupId === g.id);
      if (gFeatures.length === 0) continue;

      const groupChk = h('input', { type: 'checkbox', title: getLang() === 'uz' ? 'Guruhni tanlash (galochka)' : 'Выбрать группу (галочка)' });
      const groupBadge = h('span', { class: 'feat-group-badge', text: '' });
      const itemsGrid = h('div', { class: 'feat-items-grid' });
      const groupCard = h('div', { class: 'feat-group-card', dataset: { group: g.id } });

      const groupController = {
        group: g,
        card: groupCard,
        items: [],
        updateGroup() {
          const checkedCount = gFeatures.filter((f) => switches.get(f.key)).length;
          const total = gFeatures.length;
          groupBadge.textContent = `${checkedCount} / ${total} ${getLang() === 'uz' ? 'faol' : 'активно'}`;

          if (checkedCount === 0) {
            groupChk.checked = false;
            groupChk.indeterminate = false;
          } else if (checkedCount === total) {
            groupChk.checked = true;
            groupChk.indeterminate = false;
          } else {
            groupChk.checked = false;
            groupChk.indeterminate = true;
          }
        },
      };
      groupControllers.push(groupController);

      // Guruh checkboxi bosilganda: butun guruh elementlarini yoqish/o'chirish
      groupChk.addEventListener('change', () => {
        const val = groupChk.checked;
        for (const f of gFeatures) {
          if (f.locked) continue;
          switches.set(f.key, val);
        }
        for (const item of groupController.items) {
          if (item.f.locked) continue;
          item.input.checked = val;
          item.updateUI();
        }
        groupController.updateGroup();
        updateGlobalStats();
      });

      const groupHead = h('div', { class: 'feat-group-head' },
        h('label', { class: 'feat-group-title-row' },
          groupChk,
          h('span', { style: { fontSize: '16px' }, text: g.icon }),
          h('span', { text: tl(g.label) })
        ),
        h('div', { class: 'feat-group-right' },
          btn(getLang() === 'uz' ? 'Hammasi' : 'Все', {
            cls: 'btn-sm btn-ghost',
            onClick: () => {
              for (const f of gFeatures) switches.set(f.key, true);
              for (const item of groupController.items) { item.input.checked = true; item.updateUI(); }
              groupController.updateGroup();
              updateGlobalStats();
            },
          }),
          btn(getLang() === 'uz' ? 'O‘chirish' : 'Снять', {
            cls: 'btn-sm btn-ghost',
            onClick: () => {
              for (const f of gFeatures) {
                if (f.locked) continue;
                switches.set(f.key, false);
              }
              for (const item of groupController.items) {
                if (item.f.locked) continue;
                item.input.checked = false;
                item.updateUI();
              }
              groupController.updateGroup();
              updateGlobalStats();
            },
          }),
          groupBadge
        )
      );

      // Guruh ichidagi funksiyalar
      for (const f of gFeatures) {
        const input = h('input', { type: 'checkbox', checked: switches.get(f.key) });
        if (f.locked) {
          input.disabled = true;
          input.checked = true;
        }

        const pill = h('span', { class: 'feat-pill' });
        const itemCard = h('label', { class: 'feat-item', dataset: { key: f.key } },
          input,
          h('span', { class: 'feat-item-ico', text: f.icon || '•' }),
          h('div', { class: 'feat-item-body' },
            h('div', { class: 'feat-item-title' },
              h('span', { text: tl(f.label) }),
              f.locked ? h('span', { class: 'feat-pill locked', text: getLang() === 'uz' ? '🔒 Asosiy' : '🔒 Основной' }) : null
            ),
            h('div', { class: 'feat-item-desc', text: tl(f.desc) })
          ),
          h('div', { class: 'feat-item-side' }, pill)
        );

        function updateItemUI() {
          const on = input.checked;
          itemCard.classList.toggle('active', on);
          itemCard.classList.toggle('disabled', !on);
          pill.className = 'feat-pill ' + (f.locked ? 'locked' : (on ? 'on' : 'off'));
          pill.textContent = f.locked
            ? (getLang() === 'uz' ? 'Doimiy' : 'Постоянно')
            : (on ? (getLang() === 'uz' ? 'Faol' : 'Активно') : (getLang() === 'uz' ? 'O‘chirilgan' : 'Выключено'));
        }

        input.addEventListener('change', () => {
          if (f.locked) { input.checked = true; return; }
          switches.set(f.key, input.checked);
          updateItemUI();
          groupController.updateGroup();
          updateGlobalStats();
        });

        updateItemUI();

        const itemObj = { f, el: itemCard, input, updateUI: updateItemUI };
        itemElements.push(itemObj);
        groupController.items.push(itemObj);
        itemsGrid.append(itemCard);
      }

      groupController.updateGroup();
      groupCard.append(groupHead, itemsGrid);
      container.append(groupCard);
    }

    // ---------------- Qidiruv mantig'i
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      for (const item of itemElements) {
        const nameUz = (item.f.label.uz || '').toLowerCase();
        const nameRu = (item.f.label.ru || '').toLowerCase();
        const descUz = (item.f.desc?.uz || '').toLowerCase();
        const descRu = (item.f.desc?.ru || '').toLowerCase();
        const key = item.f.key.toLowerCase();
        const match = !q || nameUz.includes(q) || nameRu.includes(q) || descUz.includes(q) || descRu.includes(q) || key.includes(q);
        item.el.style.display = match ? 'flex' : 'none';
      }

      // Agar guruhda hech qanday qidiruv natijasi qolmasa, guruh kartasini yashirish
      for (const g of groupControllers) {
        const visibleItems = g.items.some((it) => it.el.style.display !== 'none');
        g.card.style.display = visibleItems ? 'block' : 'none';
      }
    });

    updateGlobalStats();

    return card(getLang() === 'uz' ? 'Sayt funksiyalarini boshqarish' : 'Управление функциями сайта',
      h('p', { class: 'dim', style: { fontSize: '13px', margin: '0 0 14px' },
        text: getLang() === 'uz'
          ? 'Saytdagi har bir funksiyani galochka (✓) yordamida yoqishingiz yoki olib tashlashingiz mumkin. O‘chirilgan funksiyalar menyudan va tizimdan yashiriladi. Barcha arxiv va ma’lumotlar bazada xavfsiz saqlanadi.'
          : 'С помощью галочек (✓) вы можете включать или отключать любые функции на сайте. Отключённые функции скрываются из меню и интерфейса. Все данные и архив сохраняются в безопасности.' }),
      container
    );
  }

  function fld(label, input) {
    return h('div', { class: 'form-field' }, h('label', { text: label }), input);
  }
  function chk(input) {
    return h('label', { class: 'form-check' }, input, h('span', { style: { fontSize: '13px' }, text: '' }));
  }
}

function changePassword() {
  const oldP = h('input', { type: 'password' });
  const newP = h('input', { type: 'password' });
  const repP = h('input', { type: 'password' });

  const oldF = h('div', { class: 'form-field span2' },
    h('label', { text: getLang() === 'uz' ? 'Eski parol' : 'Старый пароль' }), oldP);
  const newF = h('div', { class: 'form-field span2' },
    h('label', { text: getLang() === 'uz' ? 'Yangi parol' : 'Новый пароль' }), newP);
  const repF = h('div', { class: 'form-field span2' },
    h('label', { text: getLang() === 'uz' ? 'Tasdiqlash' : 'Подтверждение' }), repP);

  // Parolni ko'rsatish / yashirish tugmalari (maydonlar DOM'ga qo'yilgandan keyin)
  attachPasswordToggle(oldP);
  attachPasswordToggle(newP);
  attachPasswordToggle(repP);

  const m = modal({
    title: getLang() === 'uz' ? 'Parolni o‘zgartirish' : 'Смена пароля',
    width: 460,
    body: h('div', { class: 'form-grid' }, oldF, newF, repF),
    actions: (close) => [
      btn(t('cancel'), { onClick: close }),
      btn(t('save'), { cls: 'btn-primary', onClick: async () => {
        // Parol siyosati
        const r = analyzePassword(newP.value);
        if (!r.ok) {
          toast(passwordMessage(r), 'err');
          newP.focus();
          pwMeter.update();
          return;
        }
        if (newP.value !== repP.value) { toast(getLang() === 'uz' ? 'Parollar mos emas' : 'Пароли не совпадают', 'err'); return; }
        try {
          await api.post('/api/auth/password', { old_password: oldP.value, new_password: newP.value });
          toast(t('saved')); m.close();
        } catch (e) { toast(e.message, 'err'); }
      } }),
    ],
  });
  // Parol siyosati — jonli tekshiruv ro'yxati
  const pwMeter = attachPasswordMeter(newP);
}

// ============================================================ IMPORT / EXPORT
export async function dataPage(root) {
  const meta = await loadMeta();
  const counts = await api.get('/api/meta/counts');
  root.replaceChildren();
  root.append(pageHead(getLang() === 'uz' ? 'Ma’lumotlar' : 'Данные',
    'Import / Export / Загрузка данных'));

  // ---- eksport
  const expBox = h('div', { class: 'kpi-row' });
  const exportables = [
    { key: 'products', label: t('m_products'), n: counts.products },
    { key: 'balances', label: t('m_balances'), n: counts.products },
    { key: 'movements', label: t('m_movements'), n: counts.movements },
    { key: 'documents', label: t('m_documents'), n: counts.documents },
    { key: 'debt', label: t('m_debt'), n: counts.counterparties },
    { key: 'warehouses', label: t('m_warehouses'), n: counts.warehouses },
    { key: 'counterparties', label: t('m_counterparties'), n: counts.counterparties },
    { key: 'locations', label: t('m_locations'), n: counts.locations },
    { key: 'categories', label: t('m_categories'), n: counts.categories },
    { key: 'units', label: t('m_units'), n: counts.units },
  ];
  for (const e of exportables) {
    expBox.append(h('div', { class: 'kpi' },
      h('div', { class: 'kpi-label', text: e.label }),
      h('div', { class: 'kpi-value', text: num(e.n) }),
      h('button', { class: 'btn btn-sm', style: { marginTop: '7px' }, text: '⭳ ' + t('export'),
        onClick: () => api.download(e.key).catch((err) => toast(err.message, 'err')) })));
  }
  root.append(card(getLang() === 'uz' ? 'Eksport (CSV / Excel)' : 'Экспорт (CSV / Excel)', expBox));

  // ---- import
  const importable = ['products', 'counterparties', 'warehouses', 'locations', 'categories', 'brands', 'units', 'employees', 'currencies'];
  root.append(card(getLang() === 'uz' ? 'Import (CSV)' : 'Импорт (CSV)',
    h('div', { class: 'alert alert-info', text: getLang() === 'uz'
      ? 'CSV faylda birinchi qator — ustun nomlari (sku;name_uz;name_ru;cost_price...). Mavjud SKU bo‘lsa yangilanadi, aks holda qo‘shiladi.'
      : 'Первая строка CSV — имена колонок (sku;name_uz;name_ru;cost_price...). Существующий SKU обновляется, новый — добавляется.' }),
    h('div', { class: 'filter-bar' },
      ...importable.map((k) => btn(t('m_' + k) || k, { cls: 'btn-sm', onClick: () => importDialog(k, meta[k]) }))),
    h('div', { style: { marginTop: '10px' } },
      btn(getLang() === 'uz' ? 'Shablon yuklab olish' : 'Скачать шаблон', { icon: '⭳',
        onClick: () => downloadTemplate('products', meta.products) }))));

  function importDialog(key, spec) {
    const file = h('input', { type: 'file', accept: '.csv,text/csv' });
    const area = h('textarea', { rows: 8, style: { width: '100%', fontFamily: 'monospace', fontSize: '12px' },
      placeholder: 'sku;name_uz;name_ru;cost_price;sale_price' });
    const info = h('div', { class: 'alert alert-info' },
      getLang() === 'uz' ? 'Kutilayotgan ustunlar: ' : 'Ожидаемые колонки: ',
      h('b', { text: spec.fields.map((f) => f.name).join('; ') }));

    const m = modal({
      title: 'Import · ' + tl(spec.label),
      width: 820,
      body: h('div', {}, info,
        h('div', { class: 'file-drop', onClick: () => file.click() },
          h('div', { text: '📄 ' + (getLang() === 'uz' ? 'CSV fayl tanlang yoki shu yerga bosing' : 'Выберите CSV файл или нажмите сюда') }),
          file),
        h('div', { style: { marginTop: '11px' } },
          h('label', { style: { display: 'block', fontSize: '12px', marginBottom: '4px', color: 'var(--text-dim)' },
            text: getLang() === 'uz' ? 'yoki matnni shu yerga yozing' : 'или вставьте текст' }),
          area)),
      actions: (close) => [
        btn(t('cancel'), { onClick: close }),
        btn(t('import'), { cls: 'btn-primary', onClick: async () => {
          let csv = area.value;
          if (!csv && file.files[0]) csv = await file.files[0].text();
          if (!csv.trim()) { toast('Fayl bo‘sh / Пустой файл', 'err'); return; }
          try {
            const r = await api.post('/api/import/' + key, { csv });
            toast(`${getLang() === 'uz' ? 'Qo‘shildi' : 'Добавлено'}: ${r.inserted}, ${getLang() === 'uz' ? 'yangilandi' : 'обновлено'}: ${r.updated}` +
              (r.errors?.length ? ' | ' + r.errors.join('; ') : ''), r.errors?.length ? 'warn' : 'ok');
            m.close();
          } catch (e) { toast(e.message, 'err'); }
        } }),
      ],
    });
    file.addEventListener('change', async () => {
      if (file.files[0]) area.value = await file.files[0].text();
    });
  }

  function downloadTemplate(key, spec) {
    const head = spec.fields.map((f) => f.name).join(';');
    const sample = spec.fields.map((f) => {
      if (f.name === 'sku') return 'T-0001';
      if (f.name === 'code') return 'KOD-1';
      if (f.name === 'name_uz' || f.name === 'name_ru') return 'Nomi';
      if (f.type === 'bool') return '1';
      if (f.type === 'money' || f.type === 'number') return '0';
      if (f.type === 'ref') return '';
      return '';
    }).join(';');
    const csv = '\uFEFF' + head + '\r\n' + sample + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shablon-${key}.csv`;
    a.click();
  }
}
