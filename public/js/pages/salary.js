/**
 * XODIMLAR + OYLIK / СОТРУДНИКИ + ЗАРПЛАТА
 *
 * Admin uchun: to'liq oylik jadval (asosiy oylik, sotuv limiti, bonus), statistika, tarix
 * Oddiy foydalanuvchi uchun: xodimlar ro'yxati (ism, lavozim, telefon)
 *
 * Mantiq:
 *   - Har bir xodimga oylik sotuv limiti belgilanadi
 *   - Agar oy davomidagi sotuvlar limitdan oshsa —
 *     oshgan summaning bonus_percent % i bonus sifatida qo'shiladi
 *   - Jami oylik = base_salary + joriy oy bonusi
 */
import { h, spinner, dataTable, pageHead, btn, modal, toast, money } from '../ui.js';
import { t, fn, getLang } from '../i18n.js';
import { api, auth } from '../api.js';

const L = () => getLang() === 'uz';

/** Birlashgan Xodimlar sahifasi — admin/non-admin farqlaydi */
export async function employeePage(root) {
  if (auth.isAdmin) {
    await adminEmployeePage(root);
  } else {
    await basicEmployeePage(root);
  }
}

// Eski nom bilan ham eksport — sys/salary marshrutiga mos kelish uchun
export { employeePage as salaryPage };

// ============================================================ ADMIN: to'liq jadval
async function adminEmployeePage(root) {
  root.replaceChildren(spinner());

  let employees;
  try {
    employees = await api.get('/api/salary/list');
  } catch (e) {
    root.replaceChildren(h('div', { class: 'alert alert-err', text: e.message }));
    return;
  }

  const reload = () => adminEmployeePage(root);

  // ---------- Sarlavha
  root.replaceChildren(
    pageHead(
      t('m_employees'),
      L() ? 'Xodimlar, oylik va bonus hisob-kitobi' : 'Сотрудники, оклад и бонусы',
      btn(L() ? '↻ Yangilash' : '↻ Обновить', { onClick: reload })
    )
  );

  // ---------- Statistika kartochkalari
  const totalBase    = employees.reduce((s, e) => s + (e.base_salary || 0), 0);
  const totalBonus   = employees.reduce((s, e) => s + (e.pending_bonus || 0), 0);
  const aboveLimit   = employees.filter((e) => e.over_limit > 0).length;

  root.append(h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' } },
    statCard(L() ? 'Xodimlar soni' : 'Сотрудников', employees.length, '🧑'),
    statCard(L() ? 'Limitdan oshganlar' : 'Превысили лимит', aboveLimit, '📈', aboveLimit > 0 ? '#e6f4ea' : null),
    statCard(L() ? 'Umumiy asosiy oylik' : 'Итого базовый оклад', money(totalBase), '💰'),
    statCard(L() ? 'Joriy oy bonuslari' : 'Бонусы за месяц', money(totalBonus), '🎯', totalBonus > 0 ? '#e6f4ea' : null),
    statCard(L() ? 'To\'lanishi lozim' : 'К выплате', money(totalBase + totalBonus), '💵', '#fff8e1'),
  ));

  // ---------- Jadval
  const tableWrap = h('div', { class: 'card' });
  root.append(tableWrap);

  tableWrap.append(dataTable({
    columns: [
      {
        key: 'name', title: t('salary_employee'),
        render: (r) => h('div', {},
          h('b', { text: fn(r, 'name_uz', 'name_ru') }),
          r.position ? h('div', { class: 'dim', style: { fontSize: '12px' }, text: r.position }) : null,
          r.phone   ? h('div', { class: 'dim', style: { fontSize: '12px' }, text: r.phone })    : null,
        ),
      },
      {
        key: 'base_salary', title: t('salary_base'), align: 'right',
        render: (r) => money(r.base_salary),
      },
      {
        key: 'sales_limit', title: t('salary_limit'), align: 'right',
        render: (r) => r.sales_limit > 0
          ? money(r.sales_limit)
          : h('span', { class: 'dim', text: t('salary_no_limit') }),
      },
      {
        key: 'bonus_percent', title: t('salary_bonus_pct'), align: 'right',
        render: (r) => h('span', {
          class: r.bonus_percent > 0 ? 'badge b-green' : 'dim',
          text: r.bonus_percent + '%',
        }),
      },
      {
        key: 'month_sales', title: t('salary_month_sales'), align: 'right',
        render: (r) => {
          const over = r.over_limit > 0;
          return h('div', { style: { textAlign: 'right' } },
            h('span', { style: { color: over ? '#2d7a3a' : undefined }, text: money(r.month_sales) }),
            over ? h('div', {
              class: 'dim', style: { fontSize: '11px', color: '#2d7a3a' },
              text: '+' + money(r.over_limit) + (L() ? ' limitdan oshgan' : ' сверх лимита'),
            }) : null,
          );
        },
      },
      {
        key: 'pending_bonus', title: t('salary_pending_bonus'), align: 'right',
        render: (r) => r.pending_bonus > 0
          ? h('b', { style: { color: '#2d7a3a' }, text: '+' + money(r.pending_bonus) })
          : h('span', { class: 'dim', text: '—' }),
      },
      {
        key: 'total', title: t('salary_total'), align: 'right',
        render: (r) => h('b', { text: money((r.base_salary || 0) + (r.pending_bonus || 0)) }),
      },
      {
        key: 'actions', title: '', align: 'right', width: '140px',
        render: (r) => h('div', { class: 'btn-row', style: { justifyContent: 'flex-end', gap: '4px' } },
          btn(L() ? '✎ Sozla' : '✎ Настр.', {
            cls: 'btn-sm',
            onClick: (e) => { e.stopPropagation(); openEditModal(r, reload); },
          }),
          btn(L() ? '📋 Tarix' : '📋 История', {
            cls: 'btn-sm',
            onClick: (e) => { e.stopPropagation(); openHistoryModal(r); },
          }),
        ),
      },
    ],
    rows: employees,
    onRowClick: (r) => openEditModal(r, reload),
  }));
}

// ============================================================ ODDIY: faqat ro'yxat
async function basicEmployeePage(root) {
  root.replaceChildren(spinner());

  let result;
  try {
    result = await api.get('/api/catalogs/employees', { limit: 500 });
  } catch (e) {
    root.replaceChildren(h('div', { class: 'alert alert-err', text: e.message }));
    return;
  }

  root.replaceChildren(
    pageHead(t('m_employees'), `${result.total} ${t('total').toLowerCase()}`)
  );

  root.append(h('div', { class: 'card' },
    dataTable({
      columns: [
        { key: 'name', title: t('name'), render: (r) => h('div', {},
            h('b', { text: fn(r, 'name_uz', 'name_ru') }),
            r.position ? h('div', { class: 'dim', style: { fontSize: '12px' }, text: r.position }) : null,
          ),
        },
        { key: 'phone', title: L() ? 'Telefon' : 'Телефон', width: '150px', render: (r) => r.phone || '—' },
      ],
      rows: result.rows,
    })
  ));
}

// ================================================================ statCard
function statCard(label, value, icon, bg) {
  return h('div', {
    style: {
      background: bg || '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '12px 16px',
      minWidth: '160px',
      flex: '1',
    },
  },
    h('div', { style: { fontSize: '22px' }, text: icon }),
    h('div', { class: 'dim', style: { fontSize: '12px', marginTop: '4px' }, text: label }),
    h('div', { style: { fontWeight: 700, fontSize: '16px', marginTop: '2px' }, text: String(value) }),
  );
}

// ================================================================ Oylik sozlash modal
export function openEditModal(emp, onSaved) {
  const fBase  = h('input', { type: 'number', min: '0', step: '1000',   value: emp.base_salary   || 0 });
  const fLimit = h('input', { type: 'number', min: '0', step: '100000', value: emp.sales_limit   || 0 });
  const fBonus = h('input', { type: 'number', min: '0', max: '100', step: '0.5', value: emp.bonus_percent || 0 });

  const fld = (label, el, hint) => h('div', { class: 'form-field' },
    h('label', { text: label }),
    el,
    hint ? h('div', { class: 'dim', style: { fontSize: '11px', marginTop: '2px' }, text: hint }) : null,
  );

  modal({
    title: (L() ? "Oylik sozlash" : 'Настройка зарплаты') + ' — ' + fn(emp, 'name_uz', 'name_ru'),
    width: 440,
    body: h('div', { class: 'form-grid' },
      fld(
        L() ? 'Asosiy oylik (so\'m)' : 'Базовый оклад (сум)',
        fBase,
        L() ? 'Har oy to\'lanadigan belgilangan miqdor' : 'Фиксированная ежемесячная выплата',
      ),
      fld(
        L() ? 'Oylik sotuv limiti (so\'m)' : 'Месячный лимит продаж (сум)',
        fLimit,
        L() ? '0 = cheksiz. Limitdan oshsa bonus hisoblanadi' : '0 = без лимита. Бонус считается на сумму сверх лимита',
      ),
      fld(
        L() ? 'Bonus foizi (%)' : 'Процент бонуса (%)',
        fBonus,
        L() ? 'Limitdan oshgan summaning necha foizi bonus bo\'ladi' : 'Процент от суммы сверх лимита',
      ),
      h('div', {
        class: 'alert alert-info',
        style: { gridColumn: '1/-1', fontSize: '12px', lineHeight: '1.7', whiteSpace: 'pre-line' },
        text: L()
          ? 'Misol: Oylik = 3 000 000. Limit = 10 000 000. Bonus = 5%.\n'
            + 'Xodim 15 mln so\'mlik tovar sotsa:\n'
            + 'Oshgan summa: 15M − 10M = 5 000 000\n'
            + 'Bonus: 5 000 000 × 5% = 250 000 so\'m\n'
            + 'Jami oylik = 3 000 000 + 250 000 = 3 250 000 so\'m'
          : 'Пример: Оклад = 3 000 000. Лимит = 10 000 000. Бонус = 5%.\n'
            + 'Продал на 15 млн: сверх лимита = 5 000 000\n'
            + 'Бонус: 5 000 000 × 5% = 250 000 сум\n'
            + 'Итого: 3 000 000 + 250 000 = 3 250 000 сум',
      }),
    ),
    actions: (close) => [
      btn(t('cancel'), { onClick: close }),
      btn(t('save'), {
        cls: 'btn-primary',
        onClick: async () => {
          try {
            await api.put('/api/salary/' + emp.id, {
              base_salary:   Number(fBase.value)  || 0,
              sales_limit:   Number(fLimit.value) || 0,
              bonus_percent: Number(fBonus.value) || 0,
            });
            toast(t('saved'));
            close();
            if (onSaved) onSaved();
          } catch (e) {
            toast(e.message, 'err');
          }
        },
      }),
    ],
  });
}

// ================================================================ Bonus tarixi modal
export async function openHistoryModal(emp) {
  let hist;
  try {
    hist = await api.get('/api/salary/history/' + emp.id);
  } catch (e) {
    toast(e.message, 'err');
    return;
  }

  modal({
    title: t('salary_history') + ' — ' + fn(emp, 'name_uz', 'name_ru'),
    width: 700,
    body: hist.length === 0
      ? h('p', { class: 'dim', style: { textAlign: 'center', padding: '24px 0' }, text: t('no_data') })
      : h('div', {},
          dataTable({
            columns: [
              { key: 'date', title: t('date'), width: '110px' },
              { key: 'doc_number', title: L() ? 'Hujjat' : 'Документ', width: '90px',
                render: (r) => r.doc_number ? '#' + r.doc_number : '—' },
              { key: 'sale_amount', title: t('salary_sale_amount'), align: 'right', render: (r) => money(r.sale_amount) },
              { key: 'over_limit',  title: t('salary_over_limit'),  align: 'right', render: (r) => money(r.over_limit) },
              { key: 'bonus_amount', title: t('salary_bonus_amount'), align: 'right',
                render: (r) => h('b', { style: { color: '#2d7a3a' }, text: money(r.bonus_amount) }) },
              { key: 'note', title: L() ? 'Izoh' : 'Примечание', width: '140px',
                render: (r) => h('span', { class: 'dim', text: r.note || '—' }) },
            ],
            rows: hist,
          }),
          h('div', { style: { textAlign: 'right', marginTop: '10px', fontWeight: 700, fontSize: '14px' } },
            (L() ? 'Jami bonus: ' : 'Итого бонусов: ') +
            money(hist.reduce((s, r) => s + (r.bonus_amount || 0), 0)),
          ),
        ),
    actions: (close) => [btn(t('close'), { onClick: close })],
  });
}
