/* 对账单 —— 给客户的一页纸：这段下了哪些单、收了多少、还差多少 */

const STMT_RANGES = [
  ['month', '本月'],
  ['last', '上月'],
  ['year', '今年'],
  ['all', '全部往来'],
];

function stmtRange(k) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = (yy, mm) => new Date(yy, mm, 1);
  const to = (yy, mm) => new Date(yy, mm + 1, 1);
  if (k === 'month') return [from(y, m), to(y, m), '本月'];
  if (k === 'last') return [from(y, m - 1), to(y, m), '上月'];
  if (k === 'year') return [from(y, 0), to(y + 1, 0), '今年'];
  return [null, null, '全部往来'];
}

function inSpan(dateStr, span) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  const [a, b] = span;
  if (a && t < a.getTime()) return false;
  if (b && t >= b.getTime()) return false;
  return true;
}

function openStatementForm(customerId) {
  const c = byId(S.customers, customerId) || {};
  openForm('给「' + (c.company || '客户') + '」出对账单', [
    { key: 'range', label: '统计哪一段', type: 'select', full: true,
      options: STMT_RANGES.map(([k, label]) => ({ v: k, t: label })) },
    { key: 'withPay', label: '是否列出收款明细', type: 'select',
      options: [{ v: '1', t: '列（看得清楚）' }, { v: '0', t: '不列（只给总数）' }] },
    { key: 'memo', label: '备注（会印在单子上）', full: true, ph: '请于本周内结清尾款' },
  ], { range: 'all', withPay: '1' }, async (b) => {
    showStatement(customerId, { range: b.range || 'all', withPay: b.withPay !== '0', memo: b.memo || '' });
  });
}

function showStatement(customerId, opts) {
  const c = byId(S.customers, customerId) || {};
  const sh = (typeof shop === 'function') ? shop() : {};
  const span = stmtRange(opts.range || 'all');
  const label = span[2];

  const allOrders = (S.orders || []).filter(
    (o) => Number(o.customer_id) === Number(customerId) && o.status !== 'cancelled');
  const orders = allOrders.filter((o) => inSpan(o.created_at, span));

  const orderIds = {};
  orders.forEach((o) => { orderIds[Number(o.id)] = 1; });
  const pays = (S.payments || []).filter((p) => orderIds[Number(p.order_id)])
    .sort((a, b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')));

  const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
  const totalOrders = sum(orders, (o) => Number(o.total_price || 0) + Number(o.freight || 0));
  const totalPaidPeriod = sum(pays, (p) => Number(p.amount || 0));
  // 这段里下的单，到现在还差多少
  const duePeriod = orders.reduce((a, o) => a + dueOf(o), 0);
  // 这个客户所有单加起来还差多少（催款最关心的数）
  const dueAll = allOrders.reduce((a, o) => a + dueOf(o), 0);

  const orderRows = orders.length ? orders.map((o) => {
    const items = normalizeItems(o.items_json);
    const desc = items.length
      ? items.map((it) => (it.name || '') + (it.spec ? '（' + it.spec + '）' : '') + '×' + it.qty).join('；')
      : (o.title || '—');
    const due = dueOf(o);
    return '<tr>' +
      '<td>' + esc(localDate(o.created_at)) + '</td>' +
      '<td>' + esc(o.code || '') + '<div class="ps">' + esc(desc.slice(0, 40)) + (desc.length > 40 ? '…' : '') + '</div></td>' +
      '<td class="num">' + fmt(Number(o.total_price || 0) + Number(o.freight || 0)) + '</td>' +
      '<td class="num">' + fmt(paidOf(o.id)) + '</td>' +
      '<td class="num' + (due > 0 ? ' red' : '') + '">' + (due > 0 ? fmt(due) : '已结清') + '</td>' +
      '</tr>';
  }).join('') : '<tr><td colspan="5" class="empty">这段时间没有往来</td></tr>';

  const payRows = (opts.withPay && pays.length) ? pays.map((p) => {
    const o = byId(S.orders, p.order_id) || {};
    return '<tr>' +
      '<td>' + esc(p.paid_at || localDate(p.created_at)) + '</td>' +
      '<td>' + esc(o.code || '') + '　' + esc(p.kind || '') + (p.method ? '　' + esc(p.method) : '') + '</td>' +
      '<td class="num">' + fmt(Number(p.amount || 0)) + '</td>' +
      '</tr>';
  }).join('') : '';

  const html =
    '<div class="sheet">' +
      '<div class="sh-head">' +
        '<div class="sh-brand">' +
          (sh.logo ? '<img class="sh-logo" src="' + esc(sh.logo) + '" alt="">' : '') +
          '<div><div class="sh-name">' + esc(sh.name) + '</div>' +
          '<div class="sh-slogan">' + esc(sh.slogan || '') + '</div></div>' +
        '</div>' +
        '<div class="sh-title">对账单</div>' +
      '</div>' +
      '<div class="sh-meta">' +
        '<div>' + [sh.contact, sh.phone, sh.wechat && ('微信 ' + sh.wechat)].filter(Boolean).map(esc).join('　·　') + '</div>' +
        '<div>制单日期：' + todayCn() + '</div>' +
      '</div>' +

      '<div class="sh-client">' +
        (c.logo_url ? '<img class="cl-logo" src="' + esc(c.logo_url) + '" alt="">' : '') +
        '<div class="cl-body">' +
          '<div class="cl-name">' + esc(c.company || '客户') + '</div>' +
          '<div class="cl-sub">' +
            [c.contact && ('联系人：' + c.contact), c.phone && ('电话：' + c.phone),
             c.city && ('城市：' + c.city)].filter(Boolean).map(esc).join('　　') +
            '　　对账区间：' + esc(label) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<table class="sh-table"><thead><tr>' +
        '<th style="width:92px">日期</th><th>单号 / 内容</th>' +
        '<th class="num" style="width:96px">订单额</th>' +
        '<th class="num" style="width:96px">已收</th>' +
        '<th class="num" style="width:96px">待收</th>' +
      '</tr></thead><tbody>' +
        orderRows +
        '<tr class="total-row">' +
          '<td colspan="2">本期合计（' + orders.length + ' 单）</td>' +
          '<td class="num">' + fmt(totalOrders) + '</td>' +
          '<td class="num">' + fmt(totalPaidPeriod) + '</td>' +
          '<td class="num">' + fmt(duePeriod) + '</td>' +
        '</tr>' +
      '</tbody></table>' +

      (opts.withPay ? (
        '<div class="stmt-sec"><h3>收款明细</h3>' +
        '<table class="sh-table"><thead><tr><th style="width:92px">日期</th><th>对应订单 / 方式</th>' +
        '<th class="num" style="width:96px">金额</th></tr></thead><tbody>' +
        (payRows || '<tr><td colspan="3" class="empty">这段时间没有收款记录</td></tr>') +
        '</tbody></table></div>'
      ) : '') +

      '<div class="stmt-total">' +
        '<div class="st-left">' +
          '<div class="st-upper">本期应收合计（大写）：' + esc(rmbUpper(totalOrders)) + '</div>' +
          '<div class="st-upper small">截至今日，' + esc(c.company || '该客户') + ' 累计未结：' +
            '<b>' + fmt(dueAll) + '</b></div>' +
        '</div>' +
        '<div class="st-right"><span>本期待收</span><b>¥ ' + fmt(duePeriod) + '</b></div>' +
      '</div>' +

      (opts.memo ? '<div class="stmt-memo">' + esc(opts.memo) + '</div>' : '') +

      '<div class="sh-terms">' +
        '<div>1. 本对账单仅计算未取消的订单，金额含运费（如有）。</div>' +
        '<div>2. 「待收」= 订单额 − 已收；如与您那边的记录有出入，请及时对一下。</div>' +
        '<div>3. 对账无误后，请把未结部分安排到以下账户，收到即安排发货或结案。</div>' +
      '</div>' +

      '<div class="sh-foot">' +
        (sh.addr ? esc(sh.addr) + '　' : '') + esc(sh.name) +
        (sh.phone ? '　' + esc(sh.phone) : '') +
      '</div>' +
    '</div>' +
    '<div class="print-bar no-print">' +
      '<button class="btn" data-act="leave-print">← 返回</button>' +
      '<button class="btn primary" data-act="do-print">打印 / 存 PDF</button>' +
      '<span class="small muted">Chrome：打印目标选「另存为 PDF」，边距选「默认」</span>' +
    '</div>';

  S.view = 'print';
  if (typeof closeDrawer === 'function') closeDrawer();
  enterPrint();
  document.querySelectorAll('.nav-btn').forEach((x) => x.classList.remove('active'));
  $('#topActions').innerHTML = '';
  $('#view').innerHTML = html;
}

window.showStatement = showStatement;
window.openStatementForm = openStatementForm;
