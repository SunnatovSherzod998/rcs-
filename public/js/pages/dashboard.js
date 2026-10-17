/** Boshqaruv paneli / Панель управления */
import { api, auth, getWarehouseFilter } from '../api.js';
import { t, getLang, fn } from '../i18n.js';
import { h, card, kpi, dataTable, pageHead, btn, money, num, qtyFmt, fmtDate, statusBadge, tr, spinner } from '../ui.js';
import { go } from '../app.js';
import { feat } from '../features.js';

export async function dashboard(root) {
  root.append(spinner());
  const wh = getWarehouseFilter();
  const d = await api.get('/api/reports/dashboard', { warehouse_id: wh });

  root.replaceChildren();
  root.append(
    pageHead(
      t('m_dashboard'),
      new Date().toLocaleDateString(getLang() === 'uz' ? 'ru-UZ' : 'ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      btn(t('refresh'), { icon: '↻', onClick: () => dashboard(root) })
    )
  );

  // ---------------- KPI
  const kpis = [
    kpi(t('d_total_stock'), money(d.totals.amount) + ' UZS', `${num(d.totals.positions)} ${t('d_positions').toLowerCase()}`, 'ok'),
  ];
  if (feat('nomenklatura')) {
    kpis.push(kpi(t('d_products'), num(d.products), t('m_products')));
  }
  if (feat('qarz')) {
    kpis.push(kpi(t('d_debt'), money(d.debt_total) + ' UZS', t('d_debt'), d.debt_total > 0 ? 'warn' : ''));
  }
  if (feat('jurnal')) {
    kpis.push(kpi(t('d_drafts'), num(d.drafts), t('m_journal'), d.drafts > 0 ? 'warn' : ''));
  }
  if (feat('qoldiqlar')) {
    kpis.push(kpi(t('d_negative'), num(d.negative_count), t('d_negative'), d.negative_count > 0 ? 'err' : ''));
  }
  if (feat('his_min')) {
    kpis.push(kpi(t('d_below_min'), num(d.below_min.length), t('d_alerts'), d.below_min.length > 0 ? 'warn' : ''));
  }
  root.append(h('div', { class: 'kpi-row' }, ...kpis));

  const cols = h('div', { class: 'cols-2' });

  // ---------------- Ogohlantirishlar
  if (feat('his_min')) {
    const alerts = card(t('d_alerts') + ' — ' + t('d_below_min'),
      d.below_min.length
        ? h('div', {}, ...d.below_min.map((r) => h('div', {
            class: 'alert-item',
            onclick: () => go('reports/belowmin'),
          },
            h('span', {},
              h('b', { text: r.sku }), ' — ',
              getLang() === 'uz' ? (r.name_uz || r.name_ru) : (r.name_ru || r.name_uz),
              h('span', { class: 'dim', text: ' · ' + (r.unit_code || '') })
            ),
            h('span', { class: 'v', text: `${qtyFmt(r.qty)} / ${qtyFmt(r.min_stock)}` })
          )))
        : h('div', { class: 'alert alert-ok', text: t('d_no_alerts') })
    );
    cols.append(alerts);
  }

  // ---------------- Diagramma (kirim/chiqim)
  if (feat('harakatlar') || feat('his_aylanma')) {
    const chart = d.chart.slice().reverse();
    const maxV = Math.max(1, ...chart.map((c) => Math.max(c.in_qty, c.out_qty)));
    cols.append(card(t('d_chart') + ' · ' + t('d_movements30'),
      chart.length ? h('div', {},
        h('div', { class: 'mini-chart' }, ...chart.map((c) => h('div', {
          class: 'bar-wrap', title: `${c.date}: +${qtyFmt(c.in_qty)} / -${qtyFmt(c.out_qty)}`,
        },
          h('div', { class: 'bar out', style: { height: (c.out_qty / maxV * 100) + '%' } }),
          h('div', { class: 'bar in', style: { height: (c.in_qty / maxV * 100) + '%' } })
        ))),
        h('div', { class: 'legend' },
          h('span', {}, h('i', { style: { background: 'var(--ok)' } }), t('m_receipt')),
          h('span', {}, h('i', { style: { background: 'var(--head-2)' } }), t('m_issue'))
        )
      ) : h('div', { class: 'alert alert-info', text: t('no_data') })
    ));
  }

  if (cols.children.length > 0) root.append(cols);

  // ---------------- Oxirgi hujjatlar + qarzlar
  const cols2 = h('div', { class: 'cols-2' });

  if (feat('jurnal')) {
    cols2.append(card(t('d_recent'),
      dataTable({
        maxHeight: 300,
        columns: [
          { key: 'number', title: t('doc_number'), align: 'right', render: (r) => t('m_' + (r.type === 'OPENING' ? 'opening' : r.type.toLowerCase())) + ' №' + r.number },
          { key: 'date', title: t('date'), render: (r) => fmtDate(r.date) },
          { key: 'warehouse', title: t('warehouse'), render: (r) => tr(r, 'warehouse') },
          { key: 'counterparty', title: t('counterparty'), render: (r) => tr(r, 'counterparty') || '—' },
          { key: 'total_amount', title: t('amount'), align: 'right', render: (r) => money(r.total_amount) },
          { key: 'status', title: '', align: 'right', render: (r) => statusBadge(r.status) },
        ],
        rows: d.recent,
        onRowClick: (r) => go('doc/open/' + r.id),
      })
    ));
  }

  if (feat('qarz')) {
    cols2.append(card(t('d_debt'),
      dataTable({
        maxHeight: 300,
        columns: [
          { key: 'name_ru', title: t('counterparty'), render: (r) => fn(r, 'name_uz', 'name_ru') },
          { key: 'amount', title: t('amount'), align: 'right',
            render: (r) => h('span', { class: r.amount > 0 ? 'pos' : 'neg', text: money(r.amount) }) },
        ],
        rows: d.debt_by_party,
        onRowClick: () => go('reg/debt'),
      })
    ));
  }

  if (cols2.children.length > 0) root.append(cols2);

  // ---------------- Kunlik sotuvlar (xodimlar bo'yicha, 30 kun)
  root.append(dailySalesChart(d.sales_by_emp_day || []));

  // ---------------- Xodimlar bo'yicha oylik sotuvlar (faqat admin)
  if (auth.isAdmin && feat('xodimlar') && d.emp_sales?.length) {
    const L = getLang() === 'uz';
    root.append(card(t('m_salary') + ' · ' + (L ? 'joriy oy sotuvlari' : 'продажи за текущий месяц'),
      dataTable({
        maxHeight: 320,
        columns: [
          {
            key: 'name', title: t('salary_employee'),
            render: (r) => h('span', {},
              h('b', { text: fn(r, 'name_uz', 'name_ru') }),
              r.position ? h('span', { class: 'dim', text: ' · ' + r.position }) : null),
          },
          { key: 'doc_count', title: t('doc_number'), align: 'right', render: (r) => num(r.doc_count) },
          { key: 'sales_limit', title: t('salary_limit'), align: 'right',
            render: (r) => (r.sales_limit > 0 ? money(r.sales_limit) : (L ? 'Cheksiz' : 'Нет')) },
          { key: 'month_sales', title: t('salary_month_sales'), align: 'right',
            render: (r) => h('b', { text: money(r.month_sales) }) },
          {
            key: 'progress', title: t('salary_over'), align: 'right',
            render: (r) => {
              if (!r.sales_limit || r.sales_limit <= 0) return '—';
              const pct = Math.round((r.month_sales / r.sales_limit) * 100);
              const over = r.month_sales > r.sales_limit;
              return h('span', { class: over ? 'neg' : 'dim' },
                pct + '%' + (over ? ' (+' + money(r.month_sales - r.sales_limit) + ')' : ''));
            },
          },
          {
            key: 'bonus', title: t('salary_bonus_pct'), align: 'right',
            render: (r) => {
              if (!r.sales_limit || r.sales_limit <= 0) return r.bonus_percent + '%';
              const over = Math.max(0, r.month_sales - r.sales_limit);
              const bonus = Math.round(over * (r.bonus_percent || 0));
              return bonus > 0 ? h('b', { class: 'pos', text: '+' + money(bonus) }) : '—';
            },
          },
        ],
        rows: d.emp_sales,
        onRowClick: () => go('cat/employees'),
      })
    ));
  }
}

/** Xodim ranglari — barqaror (id bo'yicha) */
const EMP_COLORS = ['#2f7ed8', '#e8833a', '#3aa76d', '#c0504d', '#8064a2', '#d4a017', '#17a2b8', '#e0609a', '#6b7f3a', '#7a5ea8'];

/** Kunlik sotuvlar diagrammasi — har bir kun ustida xodimlar kesimi */
function dailySalesChart(rows) {
  const L = getLang() === 'uz';

  // kunlar ro'yxati (bugundan 89 kun orqaga)
  const days = [];
  for (let i = 89; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const dayIdx = Object.fromEntries(days.map((d, i) => [d, i]));

  // xodimlar ro'yxati (sotuv bo'lganlari)
  const empMap = new Map();
  const byDay = new Map();
  for (const r of rows) {
    if (!dayIdx[r.date]) continue;
    if (!empMap.has(r.employee_id)) {
      empMap.set(r.employee_id, {
        id: r.employee_id, name: fn(r, 'name_uz', 'name_ru'),
        color: EMP_COLORS[empMap.size % EMP_COLORS.length],
      });
    }
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }
  const emps = [...empMap.values()];
  if (!emps.length) {
    return card(t('m_sales') + ' · ' + (L ? 'kunlik sotuvlar (30 kun)' : 'продажи по дням (30 дней)'),
      h('div', { class: 'alert alert-info', text: t('no_data') }));
  }

  const maxQty = Math.max(1, ...days.map((d) =>
    (byDay.get(d) || []).reduce((s, r) => s + (Number(r.qty) || 0), 0)));

  const chart = h('div', { class: 'sales-chart' });
  const axis = h('div', { class: 'sc-axis' });
  const tip = h('div', { class: 'sc-tip', style: { display: 'none' } });

  for (const d of days) {
    const list = (byDay.get(d) || []).slice()
      .sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0));
    const total = list.reduce((s, r) => s + (Number(r.qty) || 0), 0);
    const stack = h('div', { class: 'sc-stack' });

    for (const r of list) {
      const q = Number(r.qty) || 0;
      if (q <= 0) continue;
      const col = (empMap.get(r.employee_id) || {}).color || '#999';
      stack.append(h('div', {
        class: 'sc-seg',
        style: { height: (q / maxQty * 100) + '%', background: col },
      }));
    }

    const day = h('div', {
      class: 'sc-day',
      title: d + (total ? ' · ' + qtyFmt(total) + ' ' + (L ? 'dona' : 'шт') : ''),
      onmouseenter: (e) => {
        const rows2 = (byDay.get(d) || []).slice().sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0));
        const html = '<b>' + d + '</b><br>' + (rows2.length
          ? rows2.map((r) => {
              const c = (empMap.get(r.employee_id) || {}).color || '#999';
              return `<span style="color:${c}">■</span> ${fn(r, 'name_uz', 'name_ru')}: `
                + qtyFmt(r.qty) + ' ' + (L ? 'dona' : 'шт')
                + ' · ' + money(r.amount) + ' UZS'
                + (r.docs > 1 ? ` (${r.docs} ${L ? 'hujjat' : 'док.'})` : '');
            }).join('<br>')
          : (L ? 'sotuv yo‘q' : 'нет продаж'));
        tip.innerHTML = html;
        tip.style.display = 'block';
        const r2 = e.currentTarget.getBoundingClientRect();
        tip.style.left = (r2.left + r2.width / 2 - tip.offsetWidth / 2) + 'px';
        tip.style.top = (r2.top - tip.offsetHeight - 8) + 'px';
      },
      onmouseleave: () => { tip.style.display = 'none'; },
    }, total ? stack : h('div', { class: 'sc-seg', style: { height: '2px', background: 'var(--line)' } }));

    chart.append(day);
    axis.append(h('span', {
      text: days.length && (dayIdx[d] % 10 === 0 || dayIdx[d] === days.length - 1)
        ? d.slice(8) : '',
    }));
  }

  return card(t('m_sales') + ' · ' + (L ? 'kunlik sotuvlar (30 kun)' : 'продажи по дням (30 дней)'),
    h('div', {}, chart, axis,
      h('div', { class: 'legend', style: { marginTop: '10px' } },
        ...emps.map((e) => h('span', {},
          h('i', { style: { background: e.color } }), e.name)))),
    tip);
}
