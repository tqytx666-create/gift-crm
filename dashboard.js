/* 第 6 期：经营看板 —— 这个月赚没赚、靠什么赚的 */

window.DASH = { range: 'month' };

const RANGES = [
  { k: 'month', label: '本月' },
  { k: 'last', label: '上月' },
  { k: 'quarter', label: '近 90 天' },
  { k: 'year', label: '今年' },
  { k: 'all', label: '全部' },
];

function rangeBounds(k) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = (yy, mm) => new Date(yy, mm, 1).getTime();
  if (k === 'month') return [start(y, m), null];
  if (k === 'last') return [start(y, m - 1), start(y, m)];
  if (k === 'quarter') {
    const d = new Date(y, m, now.getDate() - 89);
    return [new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), null];
  }
  if (k === 'year') return [start(y, 0), null];
  return [null, null];
}

function inRange(dateStr, range) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const [from, to] = rangeBounds(range);
  const t = d.getTime();
  if (from !== null && t < from) return false;
  if (to !== null && t >= to) return false;
  return true;
}

function liveOrders(range) {
  return (S.orders || []).filter((o) =>
    o.status !== 'cancelled' && inRange(o.created_at, range));
}

function dashStats(range) {
  const orders = liveOrders(range);
  const revenue = orders.reduce((a, o) => a + Number(o.total_price || 0), 0);
  const cost = orders.reduce((a, o) => a + Number(o.total_cost || 0), 0);
  const gross = revenue - cost;
  const due = orders.reduce((a, o) => a + Math.max(0, dueOf(o)), 0);

  // 品类结构
  const cat = {};
  orders.forEach((o) => {
    const items = normalizeItems(o.items_json);
    const sumPrice = items.reduce((a, it) => a + Number(it.price || 0), 0) || 1;
    items.forEach((it) => {
      let name = '其他';
      let sku = it.sku_id ? byId(S.skus, it.sku_id) : null;
      let prod = sku ? byId(S.products, sku.product_id) : null;
      if (!prod && it.name) prod = S.products.find((p) => p.name === it.name);
      if (prod && prod.category) name = prod.category;
      // 按这一单里的占比把整单金额摊到品类上
      const share = Number(it.price || 0) / sumPrice;
      cat[name] = (cat[name] || 0) + Number(o.total_price || 0) * share;
    });
  });

  // 客户贡献
  const byCust = {};
  orders.forEach((o) => {
    const key = o.customer_id || ('n' + (o.customer_name || ''));
    if (!byCust[key]) {
      byCust[key] = {
        name: o.customer_name || custName(o.customer_id),
        id: o.customer_id, amount: 0, count: 0,
      };
    }
    byCust[key].amount += Number(o.total_price || 0);
    byCust[key].count += 1;
  });
  const customers = Object.values(byCust).sort((a, b) => b.amount - a.amount);
  const top20 = Math.max(1, Math.ceil(customers.length * 0.2));
  const top20Amount = customers.slice(0, top20).reduce((a, c) => a + c.amount, 0);

  const repeat = customers.filter((c) => c.count >= 2).length;

  return {
    orders,
    revenue, cost, gross,
    margin: revenue ? gross / revenue : 0,
    avgOrder: orders.length ? revenue / orders.length : 0,
    due,
    cat: Object.entries(cat).sort((a, b) => b[1] - a[1]),
    customers,
    top20Amount,
    top20Count: top20,
    repeat,
    repeatRate: customers.length ? repeat / customers.length : 0,
  };
}

function trendMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const orders = (S.orders || []).filter((o) => {
      if (o.status === 'cancelled') return false;
      const t = new Date(o.created_at).getTime();
      return !isNaN(t) && t >= d.getTime() && t < next.getTime();
    });
    out.push({
      label: (d.getMonth() + 1) + '月',
      revenue: orders.reduce((a, o) => a + Number(o.total_price || 0), 0),
      gross: orders.reduce((a, o) => a + Number(o.total_price || 0) - Number(o.total_cost || 0), 0),
      count: orders.length,
    });
  }
  return out;
}

function pct(v) { return (v * 100).toFixed(1) + '%'; }
function money0(v) { return '¥' + fmt0(Math.round(v || 0)); }

function renderDashboard() {
  const range = (window.DASH || {}).range || 'month';
  const st = dashStats(range);
  const trend = trendMonths(6);
  const maxTrend = Math.max.apply(null, trend.map((t) => t.revenue).concat([1]));
  const maxCat = Math.max.apply(null, st.cat.map((c) => c[1]).concat([1]));

  const rangeHtml = '<div class="seg">' + RANGES.map((r) =>
    '<button data-drange="' + r.k + '" class="' + (range === r.k ? 'on' : '') + '">' + r.label + '</button>').join('') +
    '</div>';

  const trendHtml = '<div class="panel"><h4>近 6 个月</h4>' +
    '<div class="trend">' + trend.map((t) => {
      const h = Math.round((t.revenue / maxTrend) * 100);
      return '<div class="t-col" title="' + esc(t.label) + '：' + money0(t.revenue) + '">' +
        '<div class="t-bars">' +
          '<i class="t-bar" style="height:' + Math.max(h, 2) + '%"></i>' +
        '</div>' +
        '<span class="t-label">' + esc(t.label) + '</span>' +
        '<span class="t-amt">' + (t.revenue ? money0(t.revenue) : '—') + '</span>' +
        '</div>';
    }).join('') + '</div>' +
    '<div class="hint">柱子是成交额。鼠标放上去看具体数。</div>' +
    '</div>';

  const catHtml = st.cat.length
    ? '<div class="panel"><h4>钱从哪类品赚的</h4><div class="bars">' +
      st.cat.slice(0, 8).map(([name, amt]) => {
        const w = Math.round((amt / maxCat) * 100);
        const share = st.revenue ? Math.round((amt / st.revenue) * 100) : 0;
        return '<div class="bar-row">' +
          '<span class="bar-label">' + esc(name) + '</span>' +
          '<div class="bar-track"><i style="width:' + Math.max(w, 2) + '%"></i></div>' +
          '<span class="bar-val">' + money0(amt) + ' <em>' + share + '%</em></span>' +
          '</div>';
      }).join('') + '</div></div>'
    : '';

  const topHtml = st.customers.length
    ? '<div class="panel"><h4>客户贡献</h4>' +
      '<div class="dash-note">前 ' + st.top20Count + ' 个客户（前 20%）贡献了 <b>' +
        money0(st.top20Amount) + '</b>，占 <b>' + (st.revenue ? Math.round((st.top20Amount / st.revenue) * 100) : 0) + '%</b>' +
        '　·　复购客户 ' + st.repeat + ' / ' + st.customers.length + ' 家（' + pct(st.repeatRate) + '）</div>' +
      '<div class="bars">' + st.customers.slice(0, 6).map((c, i) => {
        const w = Math.round((c.amount / st.customers[0].amount) * 100);
        return '<div class="bar-row">' +
          '<span class="bar-label">' + (i + 1) + '. ' + esc(c.name || '') + '</span>' +
          '<div class="bar-track"><i style="width:' + Math.max(w, 2) + '%"></i></div>' +
          '<span class="bar-val">' + money0(c.amount) + ' <em>' + c.count + ' 单</em></span>' +
          '</div>';
      }).join('') + '</div></div>'
    : '';

  const poolStat = (function () {
    const ps = (S.pools || []).filter((p) => p.status !== 'cancelled');
    const ok = ps.filter((p) => p.status === 'full' || p.status === 'ordered').length;
    return { total: ps.length, ok, rate: ps.length ? ok / ps.length : 0 };
  })();

  const empty = !st.orders.length
    ? '<div class="table-wrap" style="margin-top:14px"><div class="empty">' +
      '这个时间段还没有成交。<br><span class="small muted">换个时间段看看，或者去「订单」里把报价转成订单。</span></div></div>'
    : '';

  $('#view').innerHTML =
    '<div class="dash-head"><div class="dh-title">经营看板</div>' +
      '<div class="dh-sub">只算不是「已取消」的订单；毛利 = 报价 − 成本（成本按当时报价里记的算）</div></div>' +
    rangeHtml +
    '<div class="cards">' +
      '<div class="stat"><b>' + money0(st.revenue) + '</b><span>成交额</span></div>' +
      '<div class="stat ok"><b>' + money0(st.gross) + '</b><span>毛利</span></div>' +
      '<div class="stat"><b>' + pct(st.margin) + '</b><span>毛利率</span></div>' +
      '<div class="stat"><b>' + st.orders.length + '</b><span>订单数</span></div>' +
    '</div>' +
    '<div class="cards" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="stat"><b>' + money0(st.avgOrder) + '</b><span>客单价（每单平均）</span></div>' +
      '<div class="stat ' + (st.due > 0 ? 'warn' : '') + '"><b>' + money0(st.due) + '</b><span>还没收回来</span></div>' +
      '<div class="stat"><b>' + (poolStat.total ? Math.round(poolStat.rate * 100) + '%' : '—') + '</b>' +
        '<span>拼单成功率（' + poolStat.ok + '/' + poolStat.total + '）</span></div>' +
    '</div>' +
    empty + trendHtml + catHtml + topHtml;

  document.querySelectorAll('[data-drange]').forEach((b) => {
    b.onclick = () => { window.DASH.range = b.dataset.drange; renderDashboard(); };
  });
}

window.renderDashboard = renderDashboard;
