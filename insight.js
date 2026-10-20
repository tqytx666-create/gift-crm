/* 第 4 期：客户经营 —— 今天该联系谁、谁快跑了、谁该复购了 */

const IS = { filter: 'all' };

const EVENTS = [
  { name: '双十一', m: 11, d: 11, lead: 35, tip: '进店礼、抽奖、定金膨胀都是这个节点的大头' },
  { name: '618 大促', m: 6, d: 18, lead: 30, tip: '提前定礼品，工厂排期会紧张' },
  { name: '中秋', m: 9, d: 20, lead: 30, tip: '企业客户的中秋福利订单，要提前一个月定' },
  { name: '年底福利采购', m: 12, d: 15, lead: 40, tip: '公司年会、员工福利，量大单价低的品最吃香' },
  { name: '春节', m: 2, d: 5, lead: 35, tip: '春节前物流会停，一定要提前下单' },
  { name: '开业旺季', m: 3, d: 1, lead: 25, tip: '建材家居的开店季，签到礼和开业礼盒备起来' },
  { name: '金九银十家装季', m: 9, d: 1, lead: 25, tip: '家装旺季，活动物料和礼品都要提前备' },
];

function dnum(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayDiff(a, b) {
  if (a === null || b === null) return null;
  return Math.round((a - b) / 86400000);
}

function upcomingEvent() {
  const now = new Date();
  const t0 = dnum(todayStr());
  let best = null;
  EVENTS.forEach((e) => {
    for (let y = now.getFullYear(); y <= now.getFullYear() + 1; y++) {
      const d = new Date(y, e.m - 1, e.d);
      const t = d.getTime();
      const days = Math.round((t - t0) / 86400000);
      if (days < 0) continue;
      if (!best || days < best.days) best = { name: e.name, days, tip: e.tip, lead: e.lead, date: d };
      break;
    }
  });
  return best;
}

/* ---------------- 客户画像 ---------------- */
function custStats(cid) {
  const orders = (S.orders || []).filter(
    (o) => Number(o.customer_id) === Number(cid) && o.status !== 'cancelled');
  const won = orders.reduce((a, o) => a + Number(o.total_price || 0), 0);
  const due = orders.reduce((a, o) => a + Math.max(0, dueOf(o)), 0);
  const orderDates = orders.map((o) => o.created_at).filter(Boolean).sort();
  const lastOrder = orderDates.length ? orderDates[orderDates.length - 1] : '';

  const quotes = (S.quotes || []).filter((q) => Number(q.customer_id) === Number(cid));
  const sent = quotes.filter((q) => q.status === 'sent');
  const fus = (S.followups || []).filter((f) => Number(f.customer_id) === Number(cid));
  const lastFollowUp = fus.map((f) => f.date).filter(Boolean).sort().pop() || '';

  // 常买品类
  const catCount = {};
  orders.forEach((o) => {
    const items = normalizeItems(o.items_json);
    items.forEach((it) => {
      const sku = it.sku_id ? byId(S.skus, it.sku_id) : null;
      let prod = sku ? byId(S.products, sku.product_id) : null;
      if (!prod && it.name) prod = S.products.find((p) => p.name === it.name) || null;
      const cat = prod ? (prod.category || '其他') : '其他';
      catCount[cat] = (catCount[cat] || 0) + Number(it.qty || 0);
    });
  });
  const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);

  const st = {
    won: Math.round(won),
    due: Math.round(due * 100) / 100,
    orderCount: orders.length,
    avgOrder: orders.length ? Math.round(won / orders.length) : 0,
    lastOrder,
    lastFollowUp,
    quotes: quotes.length,
    sentQuotes: sent,
    topCats,
    followups: fus.length,
  };
  st.grade = st.won >= 20000 || st.orderCount >= 3 ? 'A'
    : (st.won >= 5000 || st.orderCount >= 1 ? 'B' : 'C');
  return st;
}

function gradeTag(g) {
  const cls = g === 'A' ? 'ga' : g === 'B' ? 'gb' : 'gc';
  return '<span class="grade ' + cls + '">' + g + '</span>';
}

/* ---------------- 生成待办 ---------------- */
function buildTasks() {
  const now = dnum(todayStr());
  const ev = upcomingEvent();
  const out = [];

  (S.customers || []).forEach((c) => {
    const st = custStats(c.id);
    const stamps = [c.last_contact, st.lastFollowUp, st.lastOrder]
      .map(dnum).filter((x) => x !== null);
    const last = stamps.length ? Math.max.apply(null, stamps) : null;
    const idle = last ? Math.round((now - last) / 86400000) : null;

    const base = { c, st, idle, grade: st.grade };

    // 1. 钱没收到
    if (st.due > 0) {
      out.push(Object.assign({}, base, {
        kind: 'money', p: 0,
        reason: '还差 ¥' + fmt(st.due) + ' 没收到',
        action: '去核一下到账，该催就催',
      }));
      return;
    }

    // 1.5 货发出去很久没签收
    const shipped = (S.orders || []).filter((o) => Number(o.customer_id) === Number(c.id)
      && !(o.status === 'done' || o.status === 'cancelled')
      && (o.shipped_at || o.status === 'shipped'));
    const stuckShip = shipped.filter((o) => {
      const d = (typeof daysSinceShipped === 'function') ? daysSinceShipped(o) : 0;
      return d !== null && d >= 7;
    });
    if (stuckShip.length) {
      const worst = stuckShip.sort((a, b) => daysSinceShipped(b) - daysSinceShipped(a))[0];
      const d = daysSinceShipped(worst);
      out.push(Object.assign({}, base, {
        kind: 'logistics', p: 1,
        reason: (worst.code || '订单') + ' 发出去 ' + d + ' 天了还没签收',
        action: '打物流电话问货在哪，别等客户来问',
      }));
      return;
    }

    // 2. 报价发出去了没回音
    const stuck = st.sentQuotes.filter((q) => {
      const d = dnum(q.created_at);
      return d !== null && (now - d) / 86400000 >= 3;
    });
    if (stuck.length) {
      const q = stuck[stuck.length - 1];
      const days = Math.round((now - dnum(q.created_at)) / 86400000);
      out.push(Object.assign({}, base, {
        kind: 'quote', p: 2,
        reason: '报价发出去 ' + days + ' 天了还没回音（¥' + fmt(q.total_price) + '）',
        action: '一句话跟进：方案哪里不满意？',
      }));
      return;
    }

    // 3. 快流失
    if (idle !== null && ((st.grade === 'A' && idle >= 45) || (st.grade === 'B' && idle >= 75))) {
      out.push(Object.assign({}, base, {
        kind: 'churn', p: 3,
        reason: idle + ' 天没联系了（' + (st.grade === 'A' ? 'A 类大客户' : 'B 类客户') + '）',
        action: '别直接问要不要货，先发个新品/案例',
      }));
      return;
    }

    // 4. 该复购
    if (st.orderCount > 0 && idle !== null && idle >= 90) {
      out.push(Object.assign({}, base, {
        kind: 'repeat', p: 4,
        reason: '上次成交是 ' + idle + ' 天前（累计 ¥' + fmt(st.won) + '）',
        action: '该问问下次活动什么时候',
      }));
      return;
    }

    // 5. 活动临近
    if (ev && ev.days <= ev.lead && idle !== null && idle >= 10) {
      out.push(Object.assign({}, base, {
        kind: 'event', p: 5,
        reason: '距离「' + ev.name + '」还有 ' + ev.days + ' 天',
        action: '提前把方案和效果图给他',
      }));
      return;
    }

    // 6. 卡在跟进阶段
    if ((c.stage === '待报价' || c.stage === '待发方案') && idle !== null && idle >= 7) {
      out.push(Object.assign({}, base, {
        kind: 'stage', p: 6,
        reason: '卡在「' + c.stage + '」' + idle + ' 天了',
        action: '把方案/报价推过去',
      }));
    }
  });

  return out.sort((a, b) => a.p - b.p || (b.idle || 0) - (a.idle || 0));
}

const TASK_LABEL = {
  money: '收款', logistics: '物流', quote: '报价跟进', churn: '快流失',
  repeat: '该复购', event: '活动临近', stage: '推进',
};

/* ---------------- 页面 ---------------- */
function renderInbox() {
  const tasks = buildTasks();
  const ev = upcomingEvent();
  const counts = { all: tasks.length };
  Object.keys(TASK_LABEL).forEach((k) => { counts[k] = tasks.filter((t) => t.kind === k).length; });

  let list = tasks;
  if (IS.filter !== 'all') list = tasks.filter((t) => t.kind === IS.filter);

  const evCard = ev && ev.days <= 60
    ? '<div class="ev-card ' + (ev.days <= ev.lead ? 'hot' : '') + '">' +
        '<div class="ev-left"><div class="ev-name">' + esc(ev.name) + '</div>' +
        '<div class="ev-tip">' + esc(ev.tip) + '</div></div>' +
        '<div class="ev-days"><b>' + ev.days + '</b><span>天后</span></div>' +
      '</div>'
    : '';

  const chips = [['all', '全部', counts.all]]
    .concat(Object.keys(TASK_LABEL).map((k) => [k, TASK_LABEL[k], counts[k]]))
    .filter((x) => x[2] > 0 || x[0] === 'all');

  const chipHtml = '<div class="chips" id="taskChips">' + chips.map(([k, label, n]) =>
    '<button class="chip ' + (IS.filter === k ? 'on' : '') + '" data-ifilter="' + k + '">' +
    label + (k === 'all' ? '' : ' ' + n) + '</button>').join('') + '</div>';

  const cards = list.map((t) => {
    const c = t.c;
    return '<div class="task-card ' + t.kind + '">' +
      '<div class="tc-top">' +
        '<div class="tc-name">' + gradeTag(t.grade) + esc(c.company || '未命名') + '</div>' +
        '<span class="tag">' + TASK_LABEL[t.kind] + '</span>' +
      '</div>' +
      '<div class="tc-reason">' + esc(t.reason) + '</div>' +
      '<div class="tc-action">' + esc(t.action) + '</div>' +
      '<div class="tc-foot">' +
        '<span class="tc-meta">' +
          (t.st.won > 0 ? '累计 ¥' + fmt(t.st.won) + '　' : '') +
          (c.brand ? esc(c.brand) + '　' : '') +
          (c.city ? esc(c.city) : '') +
        '</span>' +
        '<span class="tc-btns">' +
          '<button class="btn sm" data-act="open-scripts" data-id="' + c.id + '">话术</button>' +
          '<button class="btn sm" data-act="followup" data-id="' + c.id + '">记跟进</button>' +
          '<button class="btn sm" data-act="quote-for" data-id="' + c.id + '">做报价</button>' +
          '<button class="btn sm" data-act="open-customer" data-id="' + c.id + '">看客户</button>' +
        '</span>' +
      '</div>' +
    '</div>';
  }).join('');

  $('#view').innerHTML =
    evCard +
    '<div class="inbox-head">' +
      '<div class="ih-title">今天该联系 <b>' + tasks.length + '</b> 个人</div>' +
      '<div class="ih-sub">按「钱 → 报价 → 流失 → 复购 → 活动」排的，从上往下打就行</div>' +
    '</div>' +
    chipHtml +
    (cards ? '<div class="task-list">' + cards + '</div>'
      : '<div class="table-wrap"><div class="empty">暂时没有要跟进的。<br>' +
        '<span class="small muted">攒够客户和订单之后，这里会每天给你排好该找谁。</span></div></div>');

  document.querySelectorAll('[data-ifilter]').forEach((b) => {
    b.onclick = () => { IS.filter = b.dataset.ifilter; renderInbox(); };
  });
}

window.renderInbox = renderInbox;
