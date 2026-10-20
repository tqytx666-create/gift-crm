/* 第 1 期：报价单 → 订单 → 收款 */

const OS = { tab: 'quotes' };

const QSTAGE = { draft: '草稿', sent: '已发出', won: '已成交', lost: '已丢单' };
const OSTAGE = {
  pending: '待确认', confirmed: '已确认', producing: '生产中',
  shipped: '已发货', done: '已完成', cancelled: '已取消',
};
const OSDONE = { done: 1, cancelled: 1 };

function money(v) { return '¥' + fmt(v); }

function custName(cid, fallback) {
  const c = byId(S.customers, cid);
  return (c && c.company) || fallback || '未选客户';
}

function orderFreight(o) { return Number(o.freight || 0); }
function orderTotal(o) { return Math.round((Number(o.total_price || 0) + orderFreight(o)) * 100) / 100; }
function paidOf(oid) {
  return Math.round(S.payments
    .filter((p) => Number(p.order_id) === Number(oid))
    .reduce((a, p) => a + Number(p.amount || 0), 0) * 100) / 100;
}
function dueOf(o) { return Math.round((orderTotal(o) - paidOf(o.id)) * 100) / 100; }

function localDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s).slice(0, 10);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function thisMonth(s) {
  if (!s) return false;
  const d = new Date(s);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function qTag(st) {
  const cls = st === 'won' ? 'ok' : st === 'lost' ? 'warn' : st === 'sent' ? 'blue' : '';
  return '<span class="tag ' + cls + '">' + (QSTAGE[st] || '草稿') + '</span>';
}
function oTag(st) {
  const cls = st === 'done' ? 'ok' : st === 'cancelled' ? 'warn' : st === 'shipped' ? 'blue' : '';
  return '<span class="tag ' + cls + '">' + (OSTAGE[st] || st) + '</span>';
}

/* ---------------- 主视图 ---------------- */
function renderOrders() {
  const tab = OS.tab;
  const quotes = S.quotes || [];
  const orders = S.orders || [];

  const monthQuotes = quotes.filter((q) => thisMonth(q.created_at)).length;
  const WON_STATUS = { confirmed: 1, producing: 1, shipped: 1, done: 1 };
  const monthWon = orders
    .filter((o) => thisMonth(o.created_at) && WON_STATUS[o.status])
    .reduce((a, o) => a + Number(o.total_price || 0), 0);
  const totalDue = orders
    .filter((o) => !OSDONE[o.status])
    .reduce((a, o) => a + Math.max(0, dueOf(o)), 0);

  const shipList = shippingList();
  const tabs = [
    ['quotes', '报价单', quotes.length],
    ['orders', '订单', orders.length],
    ['pay', '收款', ''],
    ['ship', '物流', shipList.length],
  ];
  const segHtml = '<div class="seg">' + tabs.map((t) =>
    '<button data-otab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] +
    (t[2] !== '' ? '<em>' + t[2] + '</em>' : '') + '</button>').join('') + '</div>';

  let body = '';
  if (tab === 'quotes') body = quotesPanel(quotes);
  else if (tab === 'orders') body = ordersPanel(orders);
  else if (tab === 'ship') body = shipPanel(orders);
  else body = payPanel(orders);

  $('#view').innerHTML =
    '<div class="cards">' +
      '<div class="stat"><b>' + monthQuotes + '</b><span>本月报价</span></div>' +
      '<div class="stat ok"><b>' + money(monthWon) + '</b><span>本月成交额</span></div>' +
      '<div class="stat ' + (totalDue > 0 ? 'warn' : '') + '"><b>' + money(totalDue) + '</b><span>待收款</span></div>' +
      '<div class="stat"><b>' + orders.filter((o) => o.status === 'producing').length + '</b><span>在生产</span></div>' +
    '</div>' + segHtml + body;

  document.querySelectorAll('[data-otab]').forEach((b) => {
    b.onclick = () => { OS.tab = b.dataset.otab; renderOrders(); };
  });
}

function quotesPanel(quotes) {
  const q = S.q;
  let list = quotes.slice();
  if (q) {
    list = list.filter((x) => [custName(x.customer_id, x.customer_name), x.title, String(x.total_price)]
      .join(' ').toLowerCase().includes(q));
  }
  if (!list.length) {
    return '<div class="table-wrap"><div class="empty">还没有报价单。<br>' +
      '<span class="small muted">去「报价」算完价，点「存成报价单」，这里就有了。</span></div></div>';
  }
  const rows = list.map((x) => {
    const cust = custName(x.customer_id, x.customer_name);
    const overdue = x.valid_until && x.status === 'sent' && x.valid_until < todayStr();
    return '<tr data-act="open-quote" data-id="' + x.id + '">' +
      '<td><div class="rowtitle">' + esc(cust) + '</div>' +
      '<div class="rowsub">' + esc(x.title || '') + '</div></td>' +
      '<td class="num">' + money(Number(x.total_price || 0)) + '</td>' +
      '<td>' + qTag(x.status) + (overdue ? ' <span class="tag warn">过有效期</span>' : '') + '</td>' +
      '<td class="muted small">' + esc(localDate(x.created_at)) + '</td>' +
      '</tr>';
  }).join('');
  return '<div class="table-wrap quote-list"><table><thead><tr>' +
    '<th>客户</th><th class="num">报价</th><th>状态</th><th>日期</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function ordersPanel(orders) {
  const q = S.q;
  let list = orders.slice();
  if (q) {
    list = list.filter((x) => [x.code, custName(x.customer_id, x.customer_name), x.title]
      .join(' ').toLowerCase().includes(q));
  }
  if (!list.length) {
    return '<div class="table-wrap"><div class="empty">还没有订单。<br>' +
      '<span class="small muted">在「报价单」里点一份，选「转成订单」。</span></div></div>';
  }
  const rows = list.map((o) => {
    const due = dueOf(o);
    const paidCls = due <= 0 ? 'ok' : (paidOf(o.id) > 0 ? 'warn' : '');
    return '<tr data-act="open-order" data-id="' + o.id + '">' +
      '<td><div class="rowtitle">' + esc(custName(o.customer_id, o.customer_name)) + '</div>' +
      '<div class="rowsub">' + esc(o.code || '') + (o.title ? ' · ' + esc(o.title) : '') + '</div></td>' +
      '<td class="num">' + money(orderTotal(o)) + '</td>' +
      '<td class="num ' + (paidCls ? 'paid-' + paidCls : '') + '">' +
      (due <= 0 ? '<span class="tag ok">已结清</span>' : money(due)) + '</td>' +
      '<td>' + oTag(o.status) + '</td>' +
      '<td class="muted small">' + esc(localDate(o.created_at)) + '</td>' +
      '</tr>';
  }).join('');
  return '<div class="table-wrap order-list"><table><thead><tr>' +
    '<th>客户 / 单号</th><th class="num">金额</th><th class="num">待收</th><th>状态</th><th>日期</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

/* ---------------- 物流 ---------------- */
const SHIP_warn = 7;    // 发货超过这么多天还没签收就该问了
const SHIP_late = 12;   // 超过这么多天算异常

function daysSinceShipped(o) {
  const start = o.shipped_at || localDate(o.created_at);
  const a = dnum(start);
  if (a === null) return null;
  return Math.max(0, Math.round((dnum(todayStr()) - a) / 86400000));
}

// 发了货、还没签收、也没标完成的
function shippingList() {
  return (S.orders || [])
    .filter((o) => !OSDONE[o.status] && o.status !== 'pending' && (o.shipped_at || o.status === 'shipped'))
    .map((o) => Object.assign({}, o, { _days: daysSinceShipped(o) }))
    .sort((a, b) => (b._days || 0) - (a._days || 0));
}

function shipLevel(o) {
  const d = o._days || 0;
  if (d >= SHIP_late) return { cls: 'bad', text: '超 ' + d + ' 天', tip: '该打电话问物流了' };
  if (d >= SHIP_warn) return { cls: 'warn', text: d + ' 天', tip: '还没签收，问一下' };
  return { cls: '', text: d + ' 天', tip: '在途' };
}

function shipPanel(orders) {
  const list = shippingList();
  const late = list.filter((o) => (o._days || 0) >= SHIP_late);
  const warn = list.filter((o) => (o._days || 0) >= SHIP_warn && (o._days || 0) < SHIP_late);

  const rows = list.length ? list.map((o) => {
    const lv = shipLevel(o);
    return '<div class="ship-card ' + lv.cls + '">' +
      '<div class="sp-head"><b>' + esc(custName(o.customer_id, o.customer_name)) + '</b>' +
        '<span class="tag ' + (lv.cls || 'blue') + '">' + lv.text + '</span></div>' +
      '<div class="sp-line">' + esc(o.code || '') +
        (o.carrier ? '　' + esc(o.carrier) : '') +
        (o.tracking_no ? '　单号 ' + esc(o.tracking_no) : '　<span class="sc-over">没填物流单号</span>') + '</div>' +
      '<div class="sp-line muted">' + esc(o.shipped_at || localDate(o.created_at)) + ' 发的' +
        (o.remind_count ? '　已催 ' + o.remind_count + ' 次' + (o.last_remind ? '（最近 ' + esc(o.last_remind) + '）' : '') : '') +
        '　· ' + esc(lv.tip) + '</div>' +
      '<div class="sp-act">' +
        '<button class="btn sm" data-act="ship-remind" data-id="' + o.id + '">记一次催办</button>' +
        '<button class="btn sm primary" data-act="ship-received" data-id="' + o.id + '">标记已签收</button>' +
        '<button class="btn sm" data-act="open-order" data-id="' + o.id + '">看订单</button>' +
      '</div>' +
    '</div>';
  }).join('') : '<div class="table-wrap"><div class="empty">现在没有在途的货。<br>' +
      '<span class="small muted">订单填了物流单号、状态推进到「已发货」之后，就会出现在这里。</span></div></div>';

  return '<div class="cards" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="stat"><b>' + list.length + '</b><span>在途</span></div>' +
      '<div class="stat warn"><b>' + warn.length + '</b><span>超过 ' + SHIP_warn + ' 天没签收</span></div>' +
      '<div class="stat ' + (late.length ? 'warn' : 'ok') + '"><b>' + late.length + '</b><span>超过 ' + SHIP_late + ' 天（该打电话）</span></div>' +
    '</div>' +
    (late.length ? '<div class="hint" style="margin-bottom:12px">大件走物流，到县里没人接电话就不送了。超过 ' +
      SHIP_late + ' 天没签收的，直接打物流电话问货在哪。</div>' : '') +
    '<div class="ship-list">' + rows + '</div>';
}

function payPanel(orders) {
  const live = orders.filter((o) => !OSDONE[o.status]);
  const totalDue = live.reduce((a, o) => a + Math.max(0, dueOf(o)), 0);
  const monthPay = S.payments
    .filter((p) => thisMonth(p.paid_at || p.created_at))
    .reduce((a, p) => a + Number(p.amount || 0), 0);

  const dueList = live.filter((o) => dueOf(o) > 0)
    .sort((a, b) => dueOf(b) - dueOf(a));
  const dueHtml = dueList.length ? dueList.map((o) =>
    '<tr data-act="open-order" data-id="' + o.id + '">' +
    '<td><div class="rowtitle">' + esc(custName(o.customer_id, o.customer_name)) + '</div>' +
    '<div class="rowsub">' + esc(o.code || '') + '</div></td>' +
    '<td class="num">' + money(orderTotal(o)) + '</td>' +
    '<td class="num">' + money(paidOf(o.id)) + '</td>' +
    '<td class="num" style="color:var(--danger);font-weight:600">' + money(dueOf(o)) + '</td>' +
    '</tr>').join('')
    : '<tr><td colspan="4" class="empty">没有待收的，全结清了。</td></tr>';

  const recent = (S.payments || []).slice().sort((a, b) =>
    String(b.paid_at || b.created_at).localeCompare(String(a.paid_at || a.created_at))).slice(0, 12);
  const recHtml = recent.length ? recent.map((p) => {
    const o = byId(S.orders, p.order_id) || {};
    return '<tr><td>' + esc(custName(o.customer_id, o.customer_name)) +
      '<div class="rowsub">' + esc(p.kind || '') + (p.method ? ' · ' + esc(p.method) : '') + '</div></td>' +
      '<td class="num">' + money(Number(p.amount || 0)) + '</td>' +
      '<td class="muted small">' + esc(p.paid_at || localDate(p.created_at)) + '</td></tr>';
  }).join('') : '<tr><td colspan="3" class="empty">还没有收款记录</td></tr>';

  return '<div class="cards" style="grid-template-columns:repeat(2,1fr)">' +
      '<div class="stat warn"><b>' + money(totalDue) + '</b><span>还没收到的钱</span></div>' +
      '<div class="stat ok"><b>' + money(monthPay) + '</b><span>本月已收</span></div>' +
    '</div>' +
    '<div class="panel" style="margin-bottom:14px"><h4>待收款（按金额从大到小）</h4>' +
      '<div class="table-wrap" style="border:none"><table><thead><tr>' +
      '<th>客户</th><th class="num">订单额</th><th class="num">已收</th><th class="num">还差</th>' +
      '</tr></thead><tbody>' + dueHtml + '</tbody></table></div></div>' +
    '<div class="panel"><h4>最近的收款</h4>' +
      '<div class="table-wrap" style="border:none"><table><thead><tr>' +
      '<th>客户</th><th class="num">金额</th><th>日期</th>' +
      '</tr></thead><tbody>' + recHtml + '</tbody></table></div></div>';
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------------- 报价单详情 ---------------- */
function openQuoteDetail(id) {
  const q = byId(S.quotes, id);
  if (!q) return;
  const items = normalizeItems(q.items_json);
  const cust = custName(q.customer_id, q.customer_name);

  const itemsHtml = items.length ? items.map((it) =>
    '<div class="qline"><span>' + esc(it.name) + (it.spec ? ' · ' + esc(it.spec) : '') +
    ' × ' + it.qty + '</span><b>' + money(it.price) + '</b></div>').join('')
    : '<div class="muted small">这份报价没有明细</div>';

  const html =
    '<div class="field-grid">' +
      kv('客户', cust) + kv('状态', QSTAGE[q.status] || '草稿') +
      kv('报价总额', money(Number(q.total_price || 0))) +
      kv('成本', money(Number(q.total_cost || 0))) +
      kv('毛利率', (Number(q.total_price || 0) > 0
        ? (((Number(q.total_price) - Number(q.total_cost)) / Number(q.total_price)) * 100).toFixed(1) + '%'
        : '—')) +
      kv('有效期到', q.valid_until || '') +
      kv('创建', localDate(q.created_at)) +
      kv('加价率', (Number(q.markup || 0) * 100).toFixed(0) + '%') +
    '</div>' +
    '<div class="section-title">明细</div><div class="qbox">' + itemsHtml + '</div>' +
    '<div style="display:flex;gap:8px;margin:16px 0 4px;flex-wrap:wrap">' +
      (q.status !== 'sent' ? '<button class="btn sm" data-act="q-status" data-id="' + q.id + '" data-v="sent">标记已发出</button>' : '') +
      (q.status !== 'won' ? '<button class="btn sm" data-act="q-status" data-id="' + q.id + '" data-v="won">标记成交</button>' : '') +
      (q.status !== 'lost' ? '<button class="btn sm" data-act="q-status" data-id="' + q.id + '" data-v="lost">标记丢单</button>' : '') +
      '<button class="btn sm" data-act="print-quote" data-id="' + q.id + '">打印 / 存 PDF</button>' +
      '<button class="btn sm primary" data-act="to-order" data-id="' + q.id + '">转成订单</button>' +
      '<button class="btn sm" data-act="copy-quote" data-id="' + q.id + '">复制文字</button>' +
      '<button class="btn sm danger" data-act="del-quote" data-id="' + q.id + '">删除</button>' +
    '</div>';
  openDrawer(cust + ' · 报价单', html);
}

function normalizeItems(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
  if (!Array.isArray(v)) v = [];
  return v;
}

/* ---------------- 订单详情 ---------------- */
function openOrderDetail(id) {
  const o = byId(S.orders, id);
  if (!o) return;
  const items = normalizeItems(o.items_json);
  const paid = paidOf(o.id);
  const due = dueOf(o);
  const pays = S.payments.filter((p) => Number(p.order_id) === Number(o.id))
    .sort((a, b) => String(a.paid_at).localeCompare(String(b.paid_at)));

  const itemsHtml = items.length ? items.map((it) =>
    '<div class="qline"><span>' + esc(it.name) + (it.spec ? ' · ' + esc(it.spec) : '') +
    ' × ' + it.qty + '</span><b>' + money(it.price) + '</b></div>').join('')
    : '<div class="muted small">没有明细</div>';

  const payHtml = pays.length ? pays.map((p) =>
    '<div class="qline"><span>' + esc(p.kind || '') + '　' + esc(p.paid_at || '') +
    (p.method ? ' · ' + esc(p.method) : '') + (p.note ? ' · ' + esc(p.note) : '') + '</span>' +
    '<b>' + money(Number(p.amount || 0)) + '</b></div>').join('')
    : '<div class="muted small">还没收到钱</div>';

  const next = { pending: 'confirmed', confirmed: 'producing', producing: 'shipped', shipped: 'done' }[o.status];

  const html =
    '<div class="field-grid">' +
      kv('客户', custName(o.customer_id, o.customer_name)) +
      kv('单号', o.code) +
      kv('状态', OSTAGE[o.status] || o.status) +
      kv('订单额', money(Number(o.total_price || 0))) +
      kv('运费', money(orderFreight(o))) +
      kv('应收', money(orderTotal(o))) +
      kv('已收', money(paid)) +
      kv('待收', money(due)) +
      kv('预计发货', o.expected_ship || '') +
      kv('实际发货', o.shipped_at || '') +
      kv('承运商', o.carrier || '') +
      kv('物流单号', o.tracking_no || '') +
      kv('签收日期', o.received_at || '') +
      kv('催过几次', o.remind_count ? String(o.remind_count) + ' 次' : '') +
    '</div>' +
    '<div class="section-title">明细</div><div class="qbox">' + itemsHtml + '</div>' +
    '<div class="section-title">收款记录 <span class="muted small">' + pays.length + ' 笔</span></div>' +
    '<div class="qbox">' + payHtml + '</div>' +
    '<div style="display:flex;gap:8px;margin:16px 0 4px;flex-wrap:wrap">' +
      '<button class="btn sm primary" data-act="add-pay" data-id="' + o.id + '">记一笔收款</button>' +
      (next ? '<button class="btn sm" data-act="o-status" data-id="' + o.id + '" data-v="' + next + '">推进到「' + OSTAGE[next] + '」</button>' : '') +
      '<button class="btn sm" data-act="o-ship" data-id="' + o.id + '">填物流单号</button>' +
      '<button class="btn sm" data-act="o-del" data-id="' + o.id + '">删除订单</button>' +
    '</div>';
  openDrawer(custName(o.customer_id, o.customer_name) + ' · 订单 ' + (o.code || ''), html);
}

/* ---------------- 动作 ---------------- */
async function setQuoteStatus(id, status) {
  await save('quotes', id, { status: status, sent_at: status === 'sent' ? new Date().toISOString() : undefined });
  const q = byId(S.quotes, id);
  if (q) openQuoteDetail(id);
  toast('状态已更新');
}

async function quoteToOrder(id) {
  const q = byId(S.quotes, id);
  if (!q) return;
  if (!confirm('把这份报价转成订单？')) return;
  const d = new Date();
  const seq = String((S.orders || []).filter((o) => String(o.code).startsWith('G' + d.getFullYear())).length + 1).padStart(3, '0');
  const code = 'G' + d.getFullYear() + '-' + seq;
  await save('orders', 0, {
    code: code,
    quote_id: q.id,
    customer_id: q.customer_id || null,
    customer_name: custName(q.customer_id, q.customer_name),
    title: q.title || '',
    status: 'pending',
    items_json: normalizeItems(q.items_json),
    total_cost: Number(q.total_cost || 0),
    total_price: Number(q.total_price || 0),
    freight: 0,
  });
  await save('quotes', q.id, { status: 'won', sent_at: q.sent_at || new Date().toISOString() });
  closeDrawer();
  OS.tab = 'orders';
  renderOrders();
  toast('已生成订单 ' + code);
}

async function addPayment(orderId) {
  const o = byId(S.orders, orderId);
  if (!o) return;
  const due = Math.max(0, dueOf(o));
  openForm('记一笔收款 · ' + custName(o.customer_id, o.customer_name), [
    { key: 'amount', label: '金额（元）', type: 'number', def: due || '' },
    { key: 'kind', label: '这笔是什么', type: 'select', options: ['定金', '尾款', '运费', '其他'] },
    { key: 'paid_at', label: '到账日期', def: todayStr() },
    { key: 'method', label: '收款方式', type: 'select', options: ['微信', '支付宝', '银行转账', '公户', '现金'] },
    { key: 'note', label: '备注', full: true },
  ], {}, async (b) => {
    await save('payments', 0, {
      order_id: orderId,
      amount: Number(b.amount || 0),
      kind: b.kind,
      paid_at: b.paid_at,
      method: b.method,
      note: b.note,
    });
    openOrderDetail(orderId);
    toast('收款已记录');
  });
}

/* ---------------- 保存报价单（从报价页调） ---------------- */
async function saveQuoteAsRecord(detail, cust, markup) {
  const q = detail;
  await save('quotes', 0, {
    customer_id: VS.quote.customerId || null,
    customer_name: cust ? cust.company : '',
    title: (cust ? cust.company : '未选客户') + ' · ' + todayStr(),
    status: 'draft',
    valid_until: plusDays(7),
    markup: markup,
    items_json: q.detail,
    total_cost: q.total_cost,
    total_price: q.total_price,
  });
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'open-quote') return openQuoteDetail(id);
  if (act === 'open-order') return openOrderDetail(id);
  if (act === 'q-status') return setQuoteStatus(id, el.dataset.v);
  if (act === 'to-order') return quoteToOrder(id);
  if (act === 'add-pay') return addPayment(id);
  if (act === 'o-status') {
    await save('orders', id, { status: el.dataset.v });
    openOrderDetail(id);
    toast('状态已更新');
    return;
  }
  if (act === 'o-ship') {
    const o = byId(S.orders, id);
    openForm('物流信息 · ' + (o && o.code ? o.code : ''), [
      { key: 'carrier', label: '哪家物流 / 承运商', ph: '德邦 / 中通快运 / 专线' },
      { key: 'tracking_no', label: '物流单号' },
      { key: 'expected_ship', label: '预计发货日' },
      { key: 'shipped_at', label: '实际发货日', def: todayStr() },
      { key: 'note2', label: '物流备注', type: 'textarea', full: true, ph: '到县城自提，客户电话 138...' },
    ], o, async (b) => {
      await save('orders', id, {
        carrier: b.carrier || '', tracking_no: b.tracking_no,
        expected_ship: b.expected_ship || null, shipped_at: b.shipped_at || null,
      });
      if (o && o.status === 'producing') await save('orders', id, { status: 'shipped' });
      openOrderDetail(id);
    });
    return;
  }
  if (act === 'ship-remind') {
    const o = byId(S.orders, id);
    if (!o) return;
    await save('orders', id, {
      remind_count: (Number(o.remind_count) || 0) + 1,
      last_remind: todayStr(),
    });
    toast('已记一笔催办');
    return;
  }
  if (act === 'ship-received') {
    const o = byId(S.orders, id);
    if (!o) return;
    await save('orders', id, {
      received_at: todayStr(),
      status: o.status === 'shipped' ? 'done' : o.status,
    });
    toast('已签收，这单从在途里移走了');
    return;
  }
  if (act === 'o-del') {
    const o = byId(S.orders, id);
    if (!confirm('删除订单 ' + (o && o.code ? o.code : '') + '？收过的钱也会一起删。')) return;
    await del('orders', id, o && o.code);
    renderOrders();
    return;
  }
  if (act === 'del-quote') {
    if (!confirm('删除这份报价单？')) return;
    await del('quotes', id, '这份报价');
    closeDrawer();
    renderOrders();
    return;
  }
  if (act === 'copy-quote') {
    const q = byId(S.quotes, id);
    if (!q) return;
    const items = normalizeItems(q.items_json);
    const lines = ['【' + custName(q.customer_id, q.customer_name) + ' · 礼品报价】'];
    items.forEach((d) => {
      lines.push('· ' + d.name + (d.spec ? '（' + d.spec + '）' : '') + ' × ' + d.qty +
        ' = ¥' + fmt(d.price) + '（单价 ¥' + fmt(d.unit_price) + '）');
    });
    lines.push('');
    lines.push('合计：¥' + fmt(q.total_price));
    lines.push('报价有效期至：' + (q.valid_until || '一周内'));
    lines.push('运费：物流到付，另算');
    copyText(lines.join('\n'));
    return;
  }
});

window.renderOrders = renderOrders;
