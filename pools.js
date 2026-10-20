/* 第 2 期：拼单池 —— 把「工厂 300 套起印」这个死结解开 */

const PS = { tab: 'open' };

const POOL_STATUS = { open: '进行中', full: '已凑满', ordered: '已下单', cancelled: '已取消' };
const ITEM_STATUS = { invited: '待确认', confirmed: '已确认', paid: '已付定金' };

function poolItems(pid) {
  return (S.poolItems || []).filter((i) => Number(i.pool_id) === Number(pid));
}

function poolSku(p) {
  return byId(S.skus, p.sku_id) || null;
}

// 按「凑到的总数量」取工厂阶梯价
function tierOf(sku, qty) {
  if (!sku) return { cost: 0, label: '—' };
  const c = Number(sku.cost || 0);
  const p300 = Number(sku.price300 || 0);
  const p1000 = Number(sku.price1000 || 0);
  if (qty >= 1000 && p1000 > 0) return { cost: p1000, label: '1000 套价' };
  if (qty >= 300 && p300 > 0) return { cost: p300, label: '300 套价' };
  return { cost: c, label: '单件价（还没到起订量）' };
}

function poolStat(p) {
  const items = poolItems(p.id);
  const total = items.reduce((a, i) => a + Number(i.qty || 0), 0);
  const confirmed = items.filter((i) => i.status !== 'invited')
    .reduce((a, i) => a + Number(i.qty || 0), 0);
  const target = Number(p.target_qty || 0);
  const gap = Math.max(0, target - total);
  const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
  const sku = poolSku(p);
  const now = tierOf(sku, total);
  const ifFull = tierOf(sku, Math.max(total, target));
  return {
    items, total, confirmed, target, gap, pct, sku,
    unitCost: now.cost, unitLabel: now.label,
    fullCost: ifFull.cost,
    people: items.length,
  };
}

function money2(v) { return '¥' + fmt(v); }

/* ---------------- 主视图 ---------------- */
function renderPools() {
  const pools = (S.pools || []).slice().sort((a, b) => {
    const rank = { open: 0, full: 1, ordered: 2, cancelled: 3 };
    const r = (rank[a.status] || 0) - (rank[b.status] || 0);
    return r !== 0 ? r : Number(b.id) - Number(a.id);
  });

  const open = pools.filter((p) => p.status === 'open');
  const openQty = open.reduce((a, p) => a + poolStat(p).total, 0);

  const tabs = [
    ['open', '进行中', open.length],
    ['full', '已凑满', pools.filter((p) => p.status === 'full').length],
    ['all', '全部', pools.length],
  ];

  let list = pools;
  if (PS.tab === 'open') list = open;
  else if (PS.tab === 'full') list = pools.filter((p) => p.status === 'full');

  const q = S.q;
  if (q) {
    list = list.filter((p) => [p.title, p.brand, p.sku_name, p.spec]
      .join(' ').toLowerCase().includes(q));
  }

  const segHtml = '<div class="seg">' + tabs.map((t) =>
    '<button data-ptab="' + t[0] + '" class="' + (PS.tab === t[0] ? 'on' : '') + '">' + t[1] +
    '<em>' + t[2] + '</em></button>').join('') + '</div>';

  const cards = list.map(poolCard).join('');

  $('#view').innerHTML =
    '<div class="cards">' +
      '<div class="stat"><b>' + open.length + '</b><span>正在拼的单</span></div>' +
      '<div class="stat"><b>' + openQty + '</b><span>筹码总量（套）</span></div>' +
      '<div class="stat"><b>' + pools.filter((p) => p.status === 'full').length + '</b><span>已凑满</span></div>' +
      '<div class="stat"><b>' + (S.poolItems || []).length + '</b><span>拉进来的客户</span></div>' +
    '</div>' + segHtml +
    (cards ? '<div class="pool-cards">' + cards + '</div>'
      : '<div class="table-wrap"><div class="empty">还没有拼单。<br>' +
        '<span class="small muted">点右上角「+ 建一个拼单」，选个品，定目标数量和截止日。</span></div></div>');

  document.querySelectorAll('[data-ptab]').forEach((b) => {
    b.onclick = () => { PS.tab = b.dataset.ptab; renderPools(); };
  });
}

function poolCard(p) {
  const st = poolStat(p);
  const full = st.pct >= 100;
  const overdue = p.deadline && p.deadline < todayStr() && p.status === 'open';
  const saved = st.sku && st.fullCost && st.unitCost > st.fullCost
    ? (st.unitCost - st.fullCost) : 0;

  return '<div class="pool-card" data-act="open-pool" data-id="' + p.id + '">' +
    '<div class="pc-top">' +
      '<div class="pc-title">' + esc(p.title || p.sku_name || '未命名拼单') + '</div>' +
      '<span class="tag ' + (p.status === 'full' ? 'ok' : p.status === 'cancelled' ? 'warn' : 'blue') + '">' +
        (POOL_STATUS[p.status] || p.status) + '</span>' +
    '</div>' +
    '<div class="pc-sub">' + esc(p.sku_name || '') + (p.spec ? ' · ' + esc(p.spec) : '') +
      (p.brand ? '　<span class="tag">' + esc(p.brand) + '</span>' : '') + '</div>' +
    '<div class="pc-bar"><i style="width:' + st.pct + '%"></i></div>' +
    '<div class="pc-nums">' +
      '<span><b>' + st.total + '</b> / ' + st.target + ' 套</span>' +
      '<span class="' + (full ? 'ok' : 'warn') + '">' + (full ? '已凑满' : '还差 ' + st.gap + ' 套') + '</span>' +
    '</div>' +
    '<div class="pc-foot">' +
      '<span>' + st.people + ' 个客户' + (p.deadline ? '　·　截止 ' + esc(p.deadline) : '') +
        (overdue ? ' <span class="tag warn">已过期</span>' : '') + '</span>' +
      '<span class="pc-price">单价 ' + money2(st.unitCost) +
        (saved > 0 ? '<i>还能再降 ' + money2(saved) + '</i>' : '') + '</span>' +
    '</div>' +
  '</div>';
}

/* ---------------- 新建拼单 ---------------- */
function createPool() {
  if (!S.skus.length) return toast('先去产品库建几个品');
  const skuOptions = S.skus.map((s) => {
    const p = byId(S.products, s.product_id) || {};
    return { v: s.id, t: (p.name || '') + (s.spec ? ' · ' + s.spec : '') + '　成本 ' + fmt(s.cost) };
  });
  openForm('建一个拼单', [
    { key: 'sku_id', label: '拼哪个品', type: 'select', full: true, options: skuOptions },
    { key: 'title', label: '起个名（客户看得懂）', full: true, ph: '欧派 11 月保温杯拼单' },
    { key: 'brand', label: '限定同品牌（可空）', hint: '填了只提示这个品牌的客户' },
    { key: 'target_qty', label: '工厂起订量（套）', type: 'number', def: 300 },
    { key: 'deadline', label: '截止日期', def: plusDays(3) },
    { key: 'note', label: '备注', type: 'textarea', full: true },
  ], {}, async (b) => {
    const sku = byId(S.skus, b.sku_id);
    const prod = sku ? (byId(S.products, sku.product_id) || {}) : {};
    await save('pools', 0, sanitize({
      title: b.title || (prod.name || '拼单'),
      brand: b.brand || '',
      sku_id: sku ? sku.id : null,
      sku_name: prod.name || '',
      spec: sku ? sku.spec : '',
      target_qty: Number(b.target_qty || 300),
      deadline: b.deadline || null,
      status: 'open',
      note: b.note || '',
    }));
    PS.tab = 'open';
    renderPools();
    toast('拼单建好了，把人拉进来');
  });
}

/* ---------------- 拼单详情 ---------------- */
function openPoolDetail(id) {
  const p = byId(S.pools, id);
  if (!p) return;
  const st = poolStat(p);
  const full = st.pct >= 100;

  const rows = st.items.length ? st.items.map((i) =>
    '<div class="pi-row">' +
      '<div class="pi-name">' + esc(i.customer_name || custName(i.customer_id)) +
        '<span class="tag ' + (i.status === 'paid' ? 'ok' : i.status === 'confirmed' ? 'blue' : '') + '">' +
        (ITEM_STATUS[i.status] || '待确认') + '</span></div>' +
      '<div class="pi-qty">' + Number(i.qty || 0) + ' 套</div>' +
      '<button class="icon-btn" data-act="del-pool-item" data-id="' + i.id + '" title="移除">×</button>' +
    '</div>').join('')
    : '<div class="muted small">还没有人进来。点下面的「拉客户进来」。</div>';

  const candidates = S.customers.filter((c) => {
    if (st.items.some((i) => Number(i.customer_id) === Number(c.id))) return false;
    if (p.brand && c.brand && c.brand !== p.brand) return false;
    return true;
  });
  const brandHits = candidates.filter((c) => p.brand && c.brand === p.brand);

  const html =
    '<div class="pool-hero">' +
      '<div class="pc-bar big"><i style="width:' + st.pct + '%"></i></div>' +
      '<div class="ph-nums"><b>' + st.total + '</b> / ' + st.target + ' 套' +
        '<span class="' + (full ? 'ok' : 'warn') + '">' + (full ? '已凑满，可以下单了' : '还差 ' + st.gap + ' 套') + '</span></div>' +
      '<div class="ph-price">现在单价 <b>' + money2(st.unitCost) + '</b>' +
        '<span class="muted">（' + st.unitLabel + '）</span>' +
        (full ? '' : '<br><span class="small muted">凑满 ' + st.target + ' 套后：' + money2(st.fullCost) + '</span>') +
      '</div>' +
    '</div>' +
    (p.note ? '<div class="kv" style="margin:12px 0"><i>备注</i><b>' + esc(p.note) + '</b></div>' : '') +
    '<div class="section-title">参与的客户 <span class="muted small">' + st.people + ' 家</span></div>' +
    '<div class="pitems">' + rows + '</div>' +
    '<div style="display:flex;gap:8px;margin:14px 0 4px;flex-wrap:wrap">' +
      '<button class="btn sm primary" data-act="add-pool-item" data-id="' + p.id + '">拉客户进来</button>' +
      '<button class="btn sm" data-act="pool-message" data-id="' + p.id + '">复制群发话术</button>' +
      '<button class="btn sm" data-act="pool-status" data-id="' + p.id + '" data-v="full">标记凑满</button>' +
      '<button class="btn sm" data-act="pool-status" data-id="' + p.id + '" data-v="ordered">标记已下单</button>' +
      '<button class="btn sm danger" data-act="del-pool" data-id="' + p.id + '">删除拼单</button>' +
    '</div>' +
    (brandHits.length
      ? '<div class="section-title">同品牌还没拉进来的 <span class="muted small">' + brandHits.length + ' 家</span></div>' +
        '<div class="flist">' + brandHits.slice(0, 8).map((c) =>
          '<div class="fitem" style="cursor:pointer" data-act="quick-add-pool" data-pool="' + p.id + '" data-cid="' + c.id + '">' +
          '<div class="rowtitle">' + esc(c.company) + '</div>' +
          '<div class="rowsub">' + esc(c.city || '') + ' · ' + esc(c.size || '') + ' · ' + esc(c.stage || '') +
          '　<span class="tag ok">点一下加进来</span></div></div>').join('') + '</div>'
      : '');

  openDrawer(p.title || p.sku_name || '拼单', html);
}

function addPoolItem(poolId) {
  const p = byId(S.pools, poolId);
  if (!p) return;
  const taken = poolItems(poolId).map((i) => Number(i.customer_id));
  const opts = S.customers
    .filter((c) => taken.indexOf(Number(c.id)) < 0)
    .map((c) => ({ v: c.id, t: c.company + (c.brand ? '（' + c.brand + '）' : '') }));
  if (!opts.length) return toast('客户都已经拉进来了');

  openForm('拉客户进拼单', [
    { key: 'customer_id', label: '哪个客户', type: 'select', full: true, options: opts },
    { key: 'qty', label: '要多少套', type: 'number', def: 100 },
    { key: 'status', label: '谈到哪一步', type: 'select', options: [
      { v: 'invited', t: '待确认' }, { v: 'confirmed', t: '已确认' }, { v: 'paid', t: '已付定金' }] },
    { key: 'note', label: '备注', type: 'textarea', full: true },
  ], {}, async (b) => {
    const c = byId(S.customers, b.customer_id);
    if (poolItems(poolId).some((i) => Number(i.customer_id) === Number(b.customer_id))) {
      toast('这个客户已经在拼单里了');
      return;
    }
    await save('poolItems', 0, sanitize({
      pool_id: poolId,
      customer_id: Number(b.customer_id),
      customer_name: c ? c.company : '',
      qty: Number(b.qty || 0),
      status: b.status || 'invited',
      note: b.note || '',
    }));
    refreshPoolIfOpen(poolId);
    toast('加进来了');
  });
}

function quickAddPool(poolId, cid) {
  const c = byId(S.customers, cid);
  if (!c) return;
  openForm('拉「' + c.company + '」进拼单', [
    { key: 'qty', label: '要多少套', type: 'number', def: 100 },
    { key: 'status', label: '谈到哪一步', type: 'select', options: [
      { v: 'invited', t: '待确认' }, { v: 'confirmed', t: '已确认' }, { v: 'paid', t: '已付定金' }] },
  ], {}, async (b) => {
    if (poolItems(poolId).some((i) => Number(i.customer_id) === Number(cid))) {
      toast('这个客户已经在拼单里了');
      return;
    }
    await save('poolItems', 0, sanitize({
      pool_id: poolId,
      customer_id: Number(cid),
      customer_name: c.company,
      qty: Number(b.qty || 0),
      status: b.status || 'invited',
    }));
    refreshPoolIfOpen(poolId);
  });
}

function refreshPoolIfOpen(poolId) {
  if ($('#drawer').classList.contains('on')) openPoolDetail(poolId);
  renderPools();
}

/* ---------------- 群发话术 ---------------- */
function poolMessage(id) {
  const p = byId(S.pools, id);
  if (!p) return;
  const st = poolStat(p);
  const gapTxt = st.gap > 0 ? '现在还差 ' + st.gap + ' 套凑满 ' + st.target + ' 套，' : '已经凑满 ' + st.target + ' 套，';
  const priceTxt = st.fullCost < st.unitCost
    ? '单价能从 ' + fmt(st.unitCost) + ' 降到 ' + fmt(st.fullCost) + '，'
    : '凑满后单价 ' + fmt(st.fullCost) + '，';
  const lines = [
    '【拼单】' + (p.title || p.sku_name),
    (p.sku_name || '') + (p.spec ? '（' + p.spec + '）' : ''),
    '现在已凑 ' + st.total + ' 套，' + gapTxt + '工厂才肯起印。',
    (p.brand ? '都是做' + p.brand + '的店，' : '') + '一起拼就能' + priceTxt + '还印同一个版。',
    (p.deadline ? '截止 ' + p.deadline + '，' : '') + '要的话回我一句数量，我一起下单。',
  ];
  copyText(lines.join('\n'));
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'add-pool') return createPool();
  if (act === 'open-pool') return openPoolDetail(id);
  if (act === 'add-pool-item') return addPoolItem(id);
  if (act === 'quick-add-pool') return quickAddPool(el.dataset.pool, el.dataset.cid);
  if (act === 'pool-message') return poolMessage(id);
  if (act === 'pool-status') {
    await save('pools', id, { status: el.dataset.v });
    openPoolDetail(id);
    toast('状态已更新');
    return;
  }
  if (act === 'del-pool-item') {
    const it = byId(S.poolItems, id);
    if (!it) return;
    if (!confirm('把「' + (it.customer_name || '这个客户') + '」从拼单里移除？')) return;
    await del('poolItems', id, it.customer_name);
    refreshPoolIfOpen(it.pool_id);
    return;
  }
  if (act === 'del-pool') {
    const p = byId(S.pools, id);
    if (!confirm('删除拼单「' + (p && p.title ? p.title : '') + '」？里面拉进来的客户也会一起删。')) return;
    await del('pools', id, p && p.title);
    closeDrawer();
    renderPools();
    return;
  }
});

window.renderPools = renderPools;
