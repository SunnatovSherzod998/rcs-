/** Boshqaruv paneli / Панель управления */
import { api, getWarehouseFilter } from '../api.js';
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
}
