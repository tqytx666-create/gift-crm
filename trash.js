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
    if (!(o.status === 'done' || o.status === 'cancelled') && o.tracking_no && o.shipped_at) {
      const d = (typeof daysSinceShipped === 'function') ? daysSinceShipped(o) : null;
      if (d !== null && d >= 12) {
        push('发货超 12 天没签收', custName(o.customer_id, o.customer_name) + ' · ' + (o.code || ''),
          'open-order', o.id, '已经 ' + d + ' 天了，打物流电话问货在哪');
      }
    }
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
  const items = [['guide', '使用说明'], ['health', '数据体检'], ['selfcheck', '系统自检'], ['import', '导入'], ['trash', '回收站']];
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

/* ---------------- 使用说明（像样的那种） ---------------- */
function guideHtml() {
  const sh = (typeof shop === 'function') ? shop() : {};
  const shopReady = !!(S.settings || {}).shop_name;
  const imgReady = (S.products || []).some((p) => p.image);
  const custReady = (S.customers || []).length > 0;

  const step = (ok, title, body, act, action) =>
    '<div class="g-step ' + (ok ? 'done' : '') + '">' +
      '<div class="gs-mark">' + (ok ? '✓' : '○') + '</div>' +
      '<div class="gs-body"><div class="gs-title">' + title + '</div>' +
      '<div class="gs-text">' + body + '</div></div>' +
      (act ? '<button class="btn sm" data-act="' + act + '">' + action + '</button>' : '') +
    '</div>';

  return '' +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>开工前先做这三件事</h4>' +
      step(shopReady, '填店铺信息',
        '名字、电话、地址、logo。填一次，以后每张报价单和方案都会自动带上。',
        'edit-shop', '去填') +
      step(imgReady, '给常卖的品传图',
        '产品库里点一行，找到「产品图」选图。报价单上就会显示产品照片。',
        'go-products', '去传') +
      step(custReady, '把老客户录进来',
        '公司名写「城市 + 店名 + 品牌」。品牌这一列最关键，拼单全靠它。',
        'go-customers', '去录') +
    '</div>' +

    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>每天怎么用（10 分钟）</h4>' +
      '<ol class="g-ol">' +
        '<li><b>打开「待办」</b>，从第一条开始往下打。系统按「钱 → 报价 → 流失 → 复购 → 活动」排好了。</li>' +
        '<li>点进客户，看一眼上次聊到哪，<b>聊完立刻点「记跟进」</b>写一句。</li>' +
        '<li>客户要东西：先点<b>「做提案」</b>给方案，再点<b>「做报价」</b>出价格。</li>' +
        '<li>报价单存下来会在「订单」里，谈成了就<b>转成订单</b>，收到钱就<b>记一笔收款</b>。</li>' +
      '</ol>' +
    '</div>' +

    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>三张纸怎么发出去</h4>' +
      '<table class="g-table"><tbody>' +
        '<tr><td><b>报价单</b></td><td>订单 → 报价单 → 点「打印 / 存 PDF」→ 浏览器打印目标选「另存为 PDF」</td></tr>' +
        '<tr><td><b>活动方案</b></td><td>客户详情 → 「做提案」→ 填五格 → 打印 / 存 PDF</td></tr>' +
        '<tr><td><b>效果图</b></td><td>方案第三段留了位置，图做好贴进去再发</td></tr>' +
      '</tbody></table>' +
      '<div class="hint">打印出来的都是 A4，可以直接微信发给客户，也可以打印带在身上。</div>' +
    '</div>' +

    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>四个容易被忽略的功能</h4>' +
      '<table class="g-table"><tbody>' +
        '<tr><td><b>拼单</b></td><td>工厂 300 套起印、客户只要 100 套时，建个拼单把同品牌的几家拉进来，凑够自动降价</td></tr>' +
        '<tr><td><b>打样</b></td><td>logo 文件、印字位置、色号、谁确认的，一张卡钉死，避免整批返工</td></tr>' +
        '<tr><td><b>比价</b></td><td>产品库 → 同品比价，同一个品不同厂的报价并排看</td></tr>' +
        '<tr><td><b>体检</b></td><td>数据 → 数据体检，哪条缺电话/缺成本价，点一下直接去补</td></tr>' +
      '</tbody></table>' +
    '</div>' +

    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>手机怎么装成 App</h4>' +
      '<p class="g-p"><b>iPhone</b>：Safari 打开 → 分享 → 添加到主屏幕。<br>' +
      '<b>安卓</b>：Chrome 打开 → 右上角三个点 → 添加到主屏幕。</p>' +
      '<p class="g-p">装好后全屏、有自己的图标，<b>断网也能打开看客户</b>（联网时自动存一份到手机上）。断网时只能看不能改。</p>' +
    '</div>' +

    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>备份与导出</h4>' +
      '<p class="g-p">数据在云端，手机和电脑打开是同一份。但还是<b>每个月备份一次</b>，下载下来丢网盘或发自己微信收藏。</p>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:10px">' +
        '<button class="btn primary" data-act="backup">下载数据库备份</button>' +
        '<button class="btn" data-act="csv">导出客户名单（CSV）</button>' +
        '<button class="btn danger" data-act="wipe">清空示例数据</button>' +
      '</div>' +
    '</div>' +

    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>新手引导</h4>' +
      '<p class="g-p">第一次用、或者想复习一遍操作流程，可以把「开工清单」调回来。</p>' +
      '<button class="btn" data-act="show-onboard" style="margin-top:6px">重看开工清单</button>' +
    '</div>' +
    '<div class="panel">' +
      '<h4>谁能看到</h4>' +
      '<p class="g-p">现在不设密码，<b>谁拿到网址谁就能进</b>。所以别把网址发到群里、朋友圈，也别做成公开二维码。' +
      '以后要加密码、或给员工单独开号，说一声就行。</p>' +
    '</div>';
}

window.guideHtml = guideHtml;
