/**
 * MENING STATISTIKAM / МОЯ СТАТИСТИКА
 * Kassir va ishchilar uchun — faqat ko'rish (o'zgartirish huquqi yo'q).
 */
import { api } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import { h, card, dataTable, pageHead, btn, money, qtyFmt, num, spinner } from '../ui.js';

export async function myStatsPage(root) {
  root.replaceChildren(spinner());
  const d = await api.get('/api/my-stats');

  if (!d.employee) {
    root.replaceChildren(
      pageHead(t('my_stats')),
      card(null, h('div', { class: 'alert alert-info' },
        t('no_employee_link') + ' — ' + (getLang() === 'uz'
          ? 'Administrator bilan bog‘lang.'
          : 'Обратитесь к администратору.')))
    );
    return;
  }

  const L = getLang() === 'uz';
  const e = d.employee;
  const limit = e.sales_limit || 0;
  const pct = limit > 0 ? Math.round((d.month.amount / limit) * 100) : null;

  // ---------------- KPI
  const kpis = [
    h('div', { class: 'kpi' },
      h('div', { class: 'k-l' }, t('salary_month_sales')),
      h('div', { class: 'k-v' }, money(d.month.amount) + ' UZS'),
      h('div', { class: 'k-s' }, `${num(d.month.docs)} ${L ? 'hujjat' : 'док.'} · ${qtyFmt(d.month.qty)} ${L ? 'dona' : 'шт'}`)),
    h('div', { class: 'kpi' },
      h('div', { class: 'k-l' }, t('salary_limit')),
      h('div', { class: 'k-v' }, limit > 0 ? money(limit) : (L ? 'Cheksiz' : 'Нет')),
      h('div', { class: 'k-s' }, pct === null ? '—' : pct + '%')),
    h('div', { class: 'kpi' },
      h('div', { class: 'k-l' }, t('salary_pending_bonus')),
      h('div', { class: 'k-v pos' }, d.bonus.amount > 0 ? '+' + money(d.bonus.amount) : '0'),
      h('div', { class: 'k-s' }, d.bonus.rate + '%')),
    h('div', { class: 'kpi' },
      h('div', { class: 'k-l' }, t('total')),
      h('div', { class: 'k-v' }, money(d.total.amount) + ' UZS'),
      h('div', { class: 'k-s' }, `${num(d.total.docs)} ${L ? 'hujjat' : 'док.'}`)),
  ];

  // ---------------- Kunlik diagramma
  const days = [];
  for (let i = 89; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const byDate = Object.fromEntries((d.daily || []).map((r) => [r.date, r]));
  const maxQty = Math.max(1, ...(d.daily || []).map((r) => Number(r.qty) || 0));

  const chart = h('div', { class: 'sales-chart' });
  const axis = h('div', { class: 'sc-axis' });
  for (const dt of days) {
    const r = byDate[dt];
    const q = Number(r?.qty) || 0;
    chart.append(h('div', {
      class: 'sc-day',
      title: dt + (q ? ' · ' + qtyFmt(q) + ' ' + (L ? 'dona' : 'шт') + ' · ' + money(r.amount) + ' UZS' : ''),
    }, h('div', { class: 'sc-stack' },
      q > 0
        ? h('div', { class: 'sc-seg', style: { height: '100%', background: 'var(--ok)' } })
        : h('div', { class: 'sc-seg', style: { height: '2px', background: 'var(--line)' } }))));
    axis.append(h('span', {
      text: (days.indexOf(dt) % 10 === 0 || days.indexOf(dt) === days.length - 1) ? dt.slice(8) : '',
    }));
  }

  // ---------------- Oylik sotuvlar jadvali (kunlik)
  const rows = (d.daily || []).slice().reverse();

  root.replaceChildren(
    pageHead(t('my_stats'),
      `${fn(e, 'name_uz', 'name_ru')}${e.position ? ' · ' + e.position : ''}`,
      btn(t('refresh'), { icon: '↻', onClick: () => myStatsPage(root) })),
    h('div', { class: 'kpi-row' }, ...kpis),
    card(t('m_sales') + ' · ' + (L ? 'kunlik sotuvlar (90 kun)' : 'продажи по дням (90 дней)'),
      h('div', {}, chart, axis)),
    card(t('salary_history'),
      dataTable({
        maxHeight: 400,
        columns: [
          { key: 'date', title: t('date'), width: '130px' },
          { key: 'docs', title: t('doc_number'), align: 'right', width: '90px', render: (r) => num(r.docs) },
          { key: 'qty', title: t('qty'), align: 'right', width: '110px', render: (r) => qtyFmt(r.qty) },
          { key: 'amount', title: t('amount'), align: 'right', render: (r) => money(r.amount) + ' UZS' },
        ],
        rows,
        empty: t('no_data'),
      }))
  );
}