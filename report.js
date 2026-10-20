/* 月度经营小结 —— 给老板自己看的一页纸 */

const REPORT_RANGES = [
  ['month', '本月'],
  ['last', '上月'],
  ['year', '今年'],
];

function reportSpan(k) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = (yy, mm) => new Date(yy, mm, 1);
  const to = (yy, mm) => new Date(yy, mm + 1, 1);
  if (k === 'last') return [from(y, m - 1), to(y, m), '上月'];
  if (k === 'year') return [from(y, 0), to(y + 1, 0), '今年'];
  return [from(y, m), to(y, m), '本月'];
}

function inSpan(dateStr, span) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  if (span[0] && t < span[0].getTime()) return false;
  if (span[1] && t >= span[1].getTime()) return false;
  return true;
}

function reportData(k) {
  const span = reportSpan(k);
  const st = (typeof dashStats === 'function') ? dashStats(k) : null;
  const orders = (S.orders || []).filter((o) => o.status !== 'cancelled' && inSpan(o.created_at, span));
  const pays = (S.payments || []).filter((p) => inSpan(p.paid_at || p.created_at, span));
  const newCust = (S.customers || []).filter((c) => inSpan(c.created_at, span));
  const fus = (S.followups || []).filter((f) => inSpan(f.date, span));
  const quotes = (S.quotes || []).filter((q) => inSpan(q.created_at, span));
  const wonQuotes = quotes.filter((q) => q.status === 'won').length;
  const pools = (S.pools || []).filter((p) => inSpan(p.created_at, span));

  const paidIn = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
  const dueAll = (S.orders || []).filter((o) => o.status !== 'cancelled')
    .reduce((a, o) => a + Math.max(0, dueOf(o)), 0);

  return {
    label: span[2],
    st: st || { revenue: 0, gross: 0, margin: 0, avgOrder: 0, cat: [], customers: [], top20Amount: 0, top20Count: 0, repeat: 0, repeatRate: 0 },
    orders, pays, newCust, fus, quotes, wonQuotes, pools,
    paidIn, dueAll,
  };
}

function reportSummary(d) {
  const s = d.st;
  const bits = [];
  if (s.revenue > 0) {
    const topCat = s.cat[0];
    bits.push('这个月做了 ' + d.orders.length + ' 单，成交 ¥' + fmt0(Math.round(s.revenue)) +
      '，毛利 ¥' + fmt0(Math.round(s.gross)) + '（毛利率 ' + (s.margin * 100).toFixed(1) + '%）');
    if (topCat) {
      const share = Math.round((topCat[1] / s.revenue) * 100);
      bits.push('钱主要来自「' + topCat[0] + '」，占 ' + share + '%');
    }
    if (s.customers.length && s.revenue > 0) {
      const p = Math.round((s.top20Amount / s.revenue) * 100);
      bits.push('前 ' + s.top20Count + ' 个客户贡献了 ' + p + '%');
    }
  } else {
    bits.push('这个月还没有成交。' + (d.quotes.length ? '已经有 ' + d.quotes.length + ' 份报价在跑了，盯一下跟进。' : ''));
  }
  if (d.dueAll > 0) bits.push('账上还有 ¥' + fmt0(Math.round(d.dueAll)) + ' 没收回来');
  const tasks = (typeof buildTasks === 'function') ? buildTasks() : [];
  if (tasks.length) bits.push('眼下最该动的是：' + (tasks[0].c.company || '') + '（' + tasks[0].reason + '）');
  return bits.filter(Boolean);
}

function openReportForm() {
  openForm('出一份经营小结', [
    { key: 'range', label: '看哪一段', type: 'select', full: true,
      options: REPORT_RANGES.map(([k, label]) => ({ v: k, t: label })) },
    { key: 'signed', label: '落款', def: '', ph: '青禾礼品 · 小鱼' },
  ], { range: 'month' }, async (b) => {
    showReport(b.range || 'month', b.signed || '');
  });
}

function showReport(k, signed) {
  const d = reportData(k);
  const s = d.st;
  const sh = (typeof shop === 'function') ? shop() : {};
  const summary = reportSummary(d);
  const tasks = (typeof buildTasks === 'function') ? buildTasks().slice(0, 5) : [];

  const catRows = (s.cat || []).slice(0, 5).map(([name, amt]) => {
    const share = s.revenue ? Math.round((amt / s.revenue) * 100) : 0;
    return '<tr><td>' + esc(name) + '</td>' +
      '<td class="num">' + fmt0(Math.round(amt)) + '</td>' +
      '<td class="num">' + share + '%</td>' +
      '<td><div class="rp-bar"><i style="width:' + Math.max(share, 2) + '%"></i></div></td></tr>';
  }).join('');

  const custRows = (s.customers || []).slice(0, 5).map((c, i) =>
    '<tr><td>' + (i + 1) + '</td><td>' + esc(c.name || '') + '</td>' +
    '<td class="num">' + fmt0(Math.round(c.amount)) + '</td>' +
    '<td class="num">' + c.count + ' 单</td></tr>').join('');

  const taskRows = tasks.map((t) =>
    '<tr><td>' + esc(t.c.company || '') + '</td><td>' + esc(t.reason) + '</td></tr>').join('');

  const html =
    '<div class="sheet">' +
      '<div class="sh-head">' +
        '<div class="sh-brand">' +
          (sh.logo ? '<img class="sh-logo" src="' + esc(sh.logo) + '" alt="">' : '') +
          '<div><div class="sh-name">' + esc(sh.name) + '</div>' +
          '<div class="sh-slogan">' + esc(sh.slogan || '') + '</div></div>' +
        '</div>' +
        '<div class="sh-title">经营小结 · ' + esc(d.label) + '</div>' +
      '</div>' +
      '<div class="sh-meta">' +
        '<div>' + [sh.contact, sh.phone].filter(Boolean).map(esc).join('　·　') + '</div>' +
        '<div>制表：' + todayCn() + '</div>' +
      '</div>' +

      '<div class="rp-kpi">' +
        '<div class="rp-cell"><span>成交额</span><b>¥' + fmt0(Math.round(s.revenue)) + '</b></div>' +
        '<div class="rp-cell"><span>毛利</span><b class="ok">¥' + fmt0(Math.round(s.gross)) + '</b></div>' +
        '<div class="rp-cell"><span>毛利率</span><b>' + (s.margin * 100).toFixed(1) + '%</b></div>' +
        '<div class="rp-cell"><span>订单数</span><b>' + d.orders.length + '</b></div>' +
      '</div>' +
      '<div class="rp-kpi small">' +
        '<div class="rp-cell"><span>客单价</span><b>¥' + fmt0(Math.round(s.avgOrder)) + '</b></div>' +
        '<div class="rp-cell"><span>本期收款</span><b class="ok">¥' + fmt0(Math.round(d.paidIn)) + '</b></div>' +
        '<div class="rp-cell"><span>累计未收</span><b class="' + (d.dueAll > 0 ? 'warn' : '') + '">¥' + fmt0(Math.round(d.dueAll)) + '</b></div>' +
        '<div class="rp-cell"><span>新增客户</span><b>' + d.newCust.length + '</b></div>' +
      '</div>' +

      '<div class="rp-say">' +
        '<h3>一句话总结</h3>' +
        '<ul>' + summary.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '</div>' +

      '<div class="rp-two">' +
        '<div class="rp-col">' +
          '<h3>钱从哪类品赚的</h3>' +
          (catRows ? '<table class="sh-table"><thead><tr><th>类目</th><th class="num">金额</th>' +
            '<th class="num">占比</th><th style="width:110px"></th></tr></thead><tbody>' + catRows + '</tbody></table>'
            : '<p class="rp-empty">本期没有成交</p>') +
        '</div>' +
        '<div class="rp-col">' +
          '<h3>客户贡献 TOP5</h3>' +
          (custRows ? '<table class="sh-table"><thead><tr><th style="width:28px">#</th><th>客户</th>' +
            '<th class="num">金额</th><th class="num">单数</th></tr></thead><tbody>' + custRows + '</tbody></table>'
            : '<p class="rp-empty">本期没有成交</p>') +
        '</div>' +
      '</div>' +

      '<div class="rp-two">' +
        '<div class="rp-col">' +
          '<h3>这个月干了多少活</h3>' +
          '<table class="sh-table"><tbody>' +
            '<tr><td>跟进记录</td><td class="num">' + d.fus.length + ' 条</td></tr>' +
            '<tr><td>发出报价</td><td class="num">' + d.quotes.length + ' 份（成交 ' + d.wonQuotes + ' 份）</td></tr>' +
            '<tr><td>拼单</td><td class="num">' + d.pools.length + ' 个</td></tr>' +
            '<tr><td>新客户</td><td class="num">' + d.newCust.length + ' 家</td></tr>' +
          '</tbody></table>' +
        '</div>' +
        '<div class="rp-col">' +
          '<h3>接下来该盯谁</h3>' +
          (taskRows ? '<table class="sh-table"><tbody>' + taskRows + '</tbody></table>'
            : '<p class="rp-empty">暂时没有要跟的</p>') +
        '</div>' +
      '</div>' +

      '<div class="sh-foot">' +
        (signed ? esc(signed) + '　·　' : '') + esc(sh.name) +
        (sh.phone ? '　' + esc(sh.phone) : '') +
      '</div>' +
    '</div>' +
    '<div class="print-bar no-print">' +
      '<button class="btn" data-act="leave-print">← 返回</button>' +
      '<button class="btn primary" data-act="do-print">打印 / 存 PDF</button>' +
      '<span class="small muted">这张是给自己看的，不用发给客户</span>' +
    '</div>';

  S.view = 'print';
  if (typeof closeDrawer === 'function') closeDrawer();
  enterPrint();
  document.querySelectorAll('.nav-btn').forEach((x) => x.classList.remove('active'));
  $('#topActions').innerHTML = '';
  $('#view').innerHTML = html;
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'open-report') { openReportForm(); }
});

window.showReport = showReport;
window.openReportForm = openReportForm;
