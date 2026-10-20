/* 经营数据导出 —— 交给 Excel 做图、发给合伙人看 */

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvLine(arr) { return arr.map(csvCell).join(','); }

function monthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function buildReportCsv(range) {
  const st = (typeof dashStats === 'function') ? dashStats(range) : null;
  if (!st) return '';
  const label = ({ month: '本月', last: '上月', quarter: '近 90 天', year: '今年', all: '全部' })[range] || '本月';
  const span = (typeof rangeBounds === 'function') ? rangeBounds(range) : [null, null];
  const inSpan = (d) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    if (isNaN(t)) return false;
    if (span[0] !== null && t < span[0]) return false;
    if (span[1] !== null && t >= span[1]) return false;
    return true;
  };

  const orders = (S.orders || []).filter((o) => o.status !== 'cancelled' && inSpan(o.created_at));
  const pays = (S.payments || []).filter((p) => inSpan(p.paid_at || p.created_at));
  const paidIn = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
  const dueAll = (S.orders || []).filter((o) => o.status !== 'cancelled')
    .reduce((a, o) => a + Math.max(0, dueOf(o)), 0);

  const L = [];
  L.push(csvLine(['礼品管家 经营数据导出']));
  L.push(csvLine(['区间', label, '导出时间', todayStr()]));
  L.push('');

  L.push(csvLine(['【一、总览】']));
  L.push(csvLine(['成交额', '毛利', '毛利率', '订单数', '客单价', '本期收款', '累计未收']));
  L.push(csvLine([
    Math.round(st.revenue), Math.round(st.gross),
    (st.margin * 100).toFixed(1) + '%', orders.length,
    Math.round(st.avgOrder), Math.round(paidIn), Math.round(dueAll),
  ]));
  L.push('');

  L.push(csvLine(['【二、月度趋势（近 12 个月）】']));
  L.push(csvLine(['月份', '订单数', '成交额', '毛利']));
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const a = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const list = (S.orders || []).filter((o) => {
      if (o.status === 'cancelled') return false;
      const t = new Date(o.created_at).getTime();
      return !isNaN(t) && t >= a.getTime() && t < b.getTime();
    });
    const rev = list.reduce((x, o) => x + Number(o.total_price || 0), 0);
    const gr = list.reduce((x, o) => x + Number(o.total_price || 0) - Number(o.total_cost || 0), 0);
    L.push(csvLine([monthKey(a), list.length, Math.round(rev), Math.round(gr)]));
  }
  L.push('');

  L.push(csvLine(['【三、品类结构】']));
  L.push(csvLine(['类目', '金额', '占比']));
  (st.cat || []).forEach(([name, amt]) => {
    L.push(csvLine([name, Math.round(amt), st.revenue ? ((amt / st.revenue) * 100).toFixed(1) + '%' : '0%']));
  });
  L.push('');

  L.push(csvLine(['【四、客户贡献 TOP20】']));
  L.push(csvLine(['排名', '客户', '金额', '单数']));
  (st.customers || []).slice(0, 20).forEach((c, i) => {
    L.push(csvLine([i + 1, c.name || '', Math.round(c.amount), c.count]));
  });
  L.push('');

  L.push(csvLine(['【五、订单明细】']));
  L.push(csvLine(['日期', '单号', '客户', '订单额', '已收', '待收', '状态']));
  orders.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((o) => {
      L.push(csvLine([
        localDate(o.created_at), o.code || '', custName(o.customer_id, o.customer_name),
        Math.round(Number(o.total_price || 0) + Number(o.freight || 0)),
        Math.round(paidOf(o.id)), Math.round(dueOf(o)), OSTAGE[o.status] || o.status,
      ]));
    });
  L.push('');

  L.push(csvLine(['【六、收款明细】']));
  L.push(csvLine(['日期', '单号', '客户', '方式', '金额']));
  pays.slice().sort((a, b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')))
    .forEach((p) => {
      const o = byId(S.orders, p.order_id) || {};
      L.push(csvLine([
        p.paid_at || localDate(p.created_at), o.code || '',
        custName(o.customer_id, o.customer_name), p.kind || '', Math.round(Number(p.amount || 0)),
      ]));
    });

  return '\ufeff' + L.join('\r\n') + '\r\n';
}

function openExportForm() {
  openForm('导出经营数据', [
    { key: 'range', label: '导哪一段', type: 'select', full: true,
      options: [['month', '本月'], ['last', '上月'], ['quarter', '近 90 天'],
        ['year', '今年'], ['all', '全部']].map(([v, t]) => ({ v, t })) },
  ], { range: 'year' }, async (b) => {
    const csv = buildReportCsv(b.range || 'year');
    if (!csv) return toast('没数据可导');
    const tag = ({ month: '本月', last: '上月', quarter: '近90天', year: '今年', all: '全部' })[b.range] || '导出';
    download('经营数据-' + tag + '-' + todayStr() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('导出好了，用 Excel 打开');
  });
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'open-export') openExportForm();
});

window.openExportForm = openExportForm;
window.buildReportCsv = buildReportCsv;
