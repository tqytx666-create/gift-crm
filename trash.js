/* 第 8 期：回收站 + 数据体检 */

window.DATA = { tab: 'guide' };

const TRASH_TABLES = [
  ['customers', '客户', 'company'],
  ['orders', '订单', 'code'],
  ['quotes', '报价单', 'title'],
  ['pools', '拼单', 'title'],
  ['samples', '打样', 'product_name'],
  ['products', '产品', 'name'],
  ['skus', '规格', 'spec'],
  ['suppliers', '厂家', 'name'],
];

/* ---------------- 数据体检 ---------------- */

function healthIssues() {
  const out = [];
  const push = (kind, who, act, id, extra) => out.push({ kind, who, act, id, extra: extra || '' });

  (S.customers || []).forEach((c) => {
    if (!c.phone && !c.wechat) push('客户没联系方式', c.company, 'open-customer', c.id, '电话和微信都是空的，以后联系不上');
    else if (!c.phone) push('客户没电话', c.company, 'open-customer', c.id, '只有微信，打电话的时候会卡住');
    if (!c.brand) push('客户没填品牌', c.company, 'open-customer', c.id, '拼单靠品牌找人，空着就拼不了');
  });

  (S.skus || []).forEach((s) => {
    const p = byId(S.products, s.product_id) || {};
    if (!Number(s.cost)) push('规格没成本价', (p.name || '') + (s.spec ? ' · ' + s.spec : ''), 'go-products', s.id, '没成本就算不出毛利，报价会亏');
    if (!Number(s.moq)) push('规格没起订量', (p.name || '') + (s.spec ? ' · ' + s.spec : ''), 'go-products', s.id, '拼单判断够不够起印要用它');
  });

  (S.suppliers || []).forEach((s) => {
    if (!Number(s.lead_days)) push('厂家没填交期', s.name, 'go-suppliers', s.id, '交期达成率算不出来');
  });

  (S.orders || []).forEach((o) => {
    if ((o.status === 'shipped' || o.status === 'done') && !o.tracking_no) {
      push('发货了但没物流单号', custName(o.customer_id, o.customer_name) + ' · ' + (o.code || ''), 'open-order', o.id, '客户问货到哪了，你查不到');
    }
    if (!o.expected_ship && o.status !== 'done') {
      push('订单没填预计发货日', (o.code || '') + ' ' + custName(o.customer_id, o.customer_name), 'open-order', o.id, '不填就没法提前提醒客户');
    }
  });

  (S.quotes || []).forEach((q) => {
    if (q.status === 'sent' && q.valid_until && q.valid_until < todayStr()) {
      push('报价过期了还没跟进', custName(q.customer_id, q.customer_name), 'open-quote', q.id, '要么重新报，要么标记丢单');
    }
  });

  (S.pools || []).forEach((p) => {
    if (p.status === 'open' && p.deadline && p.deadline < todayStr()) {
      const st = poolStat(p);
      push('拼单过期了还没动', p.title || p.sku_name, 'open-pool', p.id, '已凑 ' + st.total + ' / ' + st.target + ' 套，要么延长要么散掉');
    }
  });

  return out;
}

function renderHealth() {
  const issues = healthIssues();
  const byKind = {};
  issues.forEach((i) => { (byKind[i.kind] = byKind[i.kind] || []).push(i); });
  const kinds = Object.keys(byKind).sort((a, b) => byKind[b].length - byKind[a].length);

  const cards = '<div class="cards" style="grid-template-columns:repeat(3,1fr)">' +
    '<div class="stat ' + (issues.length ? 'warn' : 'ok') + '"><b>' + issues.length + '</b><span>待处理的问题</span></div>' +
    '<div class="stat"><b>' + kinds.length + '</b><span>问题类型</span></div>' +
    '<div class="stat ' + (issues.length ? '' : 'ok') + '"><b>' + (issues.length ? '要看' : '干净') + '</b><span>状态</span></div>' +
    '</div>';

  if (!issues.length) {
    return cards + '<div class="table-wrap"><div class="empty">数据挺干净的，没发现问题。</div></div>';
  }

  const groups = kinds.map((k) => {
    const list = byKind[k];
    return '<div class="panel" style="margin-bottom:12px">' +
      '<div class="hd-head"><b>' + esc(k) + '</b><span class="tag warn">' + list.length + '</span></div>' +
      '<div class="hd-list">' + list.slice(0, 30).map((i) =>
        '<div class="hd-item" data-act="' + i.act + '" data-id="' + i.id + '">' +
        '<span class="hd-who">' + esc(i.who || '') + '</span>' +
        '<span class="hd-why">' + esc(i.extra) + '</span>' +
        '<span class="hd-go">去处理 →</span>' +
        '</div>').join('') +
      (list.length > 30 ? '<div class="muted small" style="padding:8px 0">还有 ' + (list.length - 30) + ' 条没列出来</div>' : '') +
      '</div></div>';
  }).join('');

  return cards + groups;
}

/* ---------------- 回收站 ---------------- */

function renderTrash() {
  const all = window.TRASH || {};
  let total = 0;
  const sections = TRASH_TABLES.map(([t, label, nameKey]) => {
    const list = all[t] || [];
    if (!list.length) return '';
    total += list.length;
    const rows = list.map((r) =>
      '<div class="tr-item">' +
        '<span class="tr-name">' + esc(r[nameKey] || r.customer_name || r.product_name || ('#' + r.id)) + '</span>' +
        '<span class="tr-when">' + esc(localDate(r.deleted_at)) + ' 删的</span>' +
        '<span class="tr-btns">' +
          '<button class="btn sm" data-act="trash-restore" data-table="' + t + '" data-id="' + r.id + '">恢复</button>' +
          '<button class="btn sm danger" data-act="trash-purge" data-table="' + t + '" data-id="' + r.id + '">彻底删</button>' +
        '</span>' +
      '</div>').join('');
    return '<div class="panel" style="margin-bottom:12px">' +
      '<div class="hd-head"><b>' + label + '</b><span class="tag">' + list.length + '</span></div>' +
      '<div class="tr-list">' + rows + '</div></div>';
  }).filter(Boolean).join('');

  if (!total) {
    return '<div class="table-wrap"><div class="empty">回收站是空的。<br>' +
      '<span class="small muted">删掉的客户、订单、报价单、拼单、产品、厂家都会先放这里，30 天内能捞回来。</span></div></div>';
  }

  return '<div class="hint" style="margin-bottom:12px">这里的东西已经从各个页面消失了，但还没真删。' +
    '「恢复」就回到原来的地方，「彻底删」才是真的没了（连带它的明细一起删）。</div>' + sections;
}

function trashTabsHtml() {
  const t = (window.DATA || {}).tab || 'guide';
  const items = [['guide', '使用说明'], ['health', '数据体检'], ['trash', '回收站']];
  return '<div class="seg">' + items.map(([k, label]) =>
    '<button data-dtab="' + k + '" class="' + (t === k ? 'on' : '') + '">' + label + '</button>').join('') + '</div>';
}

async function restoreOne(table, id) {
  await rest(table, '?id=eq.' + id, { method: 'PATCH', body: { deleted_at: null } });
  await loadAll();
  render();
  toast('已恢复');
}

async function purgeOne(table, id, name) {
  if (!confirm('彻底删除「' + (name || '这条') + '」？删了就真没了，连带它的明细。')) return;
  await rest(table, '?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' });
  await loadAll();
  render();
  toast('已彻底删除');
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-dtab]');
  if (tab) {
    window.DATA.tab = tab.dataset.dtab;
    if (S.view !== 'data') { location.hash = '#data'; return; }
    render();
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'go-products') { location.hash = '#products'; return; }
  if (act === 'go-suppliers') { location.hash = '#suppliers'; return; }
  if (act === 'trash-restore') {
    el.disabled = true;
    await restoreOne(el.dataset.table, el.dataset.id);
    return;
  }
  if (act === 'trash-purge') {
    await purgeOne(el.dataset.table, el.dataset.id, el.closest('.tr-item') ? el.closest('.tr-item').querySelector('.tr-name').textContent : '');
    return;
  }
});

window.renderHealth = renderHealth;
window.renderTrash = renderTrash;
window.trashTabsHtml = trashTabsHtml;
window.healthIssues = healthIssues;
