/* 提案：从客户一键生成一份能发出去的「礼品方案」 */

const PROP_INDUSTRY = {
  '建材家居': {
    hooks: [
      '定金膨胀：客户先交 100 元定金换一张 1000 元券，满 3000 可抵。定金当场送一件进店礼，人拿了东西就跑不掉。',
      '砸金蛋 / 抽奖：下单满额砸一次，头奖放大件，二等放成交款。成本可控，现场热闹，客户会自己发朋友圈。',
      '签到礼：进店不看订单先送引流款。先把人拉进店，成交发生在店里。',
    ],
  },
  '汽车4S': {
    hooks: [
      '到店礼：到店就领（停车牌、纸巾盒），不看买不买，先把人拉进店。',
      '试驾礼：试驾送成交款礼品，把「看一眼」变成「开一圈」。',
      '订车抽奖：订车砸金蛋，头奖放洗车机或车载冰箱，专门为拍视频发朋友圈准备。',
    ],
  },
  '餐饮': {
    hooks: [
      '满减券：满 100 减 30，券绑定下次到店，把一次性客人变成回头客。',
      '充值赠送：充 500 送 100，再加一份成交款礼品，用礼品把充值变划算。',
      '集赞送菜：朋友圈集 38 个赞送招牌菜，成本低、传播快，比投广告划算。',
    ],
  },
  '美业': {
    hooks: [
      '9.9 体验券：低价把人拉进店，靠到店后的服务转化办卡。',
      '办卡赠礼：办卡即送成交款礼品，礼品要有「值钱感」，别送得像个赠品。',
      '闺蜜同行：带一个人来，两人各送一份引流款，做裂变最便宜的方式。',
    ],
  },
  '教培': {
    hooks: [
      '9.9 试听课 + 到店礼：试听就送引流款，先把家长拉到现场。',
      '报名赠礼：报名送成交款（书包、台灯），家长对「送东西」非常敏感。',
      '老带新：老学员推荐一个新学员，两边各得一份礼品，转介绍成本最低。',
    ],
  },
  其他: {
    hooks: [
      '到店礼：进店就送引流款，先把人拉进店。',
      '满额赠：满一定金额送成交款，把客单价往上抬。',
      '抽奖 / 砸金蛋：头奖放大单款，制造现场气氛和朋友圈素材。',
    ],
  },
};

const PROP_GOAL = {
  '把人拉进店': '核心是把人拉进店——所以引流款和签到礼要加重，成交款往后再放。',
  '当场促成交': '核心是把「再想想」变成「今天就定」——钩子必须限时限量，过期作废。',
  '回馈老客户': '核心是让老客觉得被记得——礼品走「实用 + 定制感」，别走低价路线。',
  '清库存': '核心是把库存变成客流——大单款可以直接拿自家库存顶，成本更低。',
};

const PROP_ACTS = ['双十一 / 大促', '开业', '店庆 / 周年', '行业节（如家装节）', '会员回馈', '日常引流'];

function priceBands(budget) {
  const b = Math.max(1, Number(budget) || 5);
  return {
    t1: b,                          // 引流款上限
    t2a: Math.round(b * 3),         // 成交款下限
    t2b: Math.round(b * 8),         // 成交款上限
    t3: Math.round(b * 15),         // 大单款门槛
  };
}

function sellPrice(cost) { return Math.round(Number(cost) * 1.25 * 100) / 100; }

function pickTier(minP, maxP, n) {
  const rows = S.skus.map((s) => {
    const p = byId(S.products, s.product_id) || {};
    return { s, p, price: sellPrice(s.cost) };
  }).filter((x) => x.price >= minP && x.price <= maxP && x.p.name);
  rows.sort((a, b) => a.price - b.price);
  return rows.slice(0, n || 3);
}

function pickBig(minP, n) {
  const rows = S.skus.map((s) => {
    const p = byId(S.products, s.product_id) || {};
    return { s, p, price: sellPrice(s.cost) };
  }).filter((x) => x.price >= minP && x.p.name);
  rows.sort((a, b) => b.price - a.price);
  return rows.slice(0, n || 3);
}

function openProposalForm(customerId) {
  const c = byId(S.customers, customerId) || {};
  openForm('给「' + (c.company || '客户') + '」出一份方案', [
    { key: 'act', label: '什么活动', type: 'select', full: true, options: PROP_ACTS },
    { key: 'when', label: '什么时候', def: upcomingEventName() },
    { key: 'goal', label: '这次最想要什么', type: 'select',
      options: Object.keys(PROP_GOAL) },
    { key: 'budget', label: '进店礼预算（元/件）', type: 'number', def: c.budget || 5 },
    { key: 'qty', label: '预计数量（套）', type: 'number', def: 300 },
  ], {}, async (b) => {
    showProposal(customerId, b);
  });
}

function upcomingEventName() {
  const ev = (typeof upcomingEvent === 'function') ? upcomingEvent() : null;
  const d = new Date();
  const md = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  if (ev && ev.days <= 60) return ev.name + '（' + (ev.date.getMonth() + 1) + ' 月 ' + ev.date.getDate() + ' 日）';
  return md + ' 起';
}

function showProposal(customerId, opts) {
  const c = byId(S.customers, customerId) || {};
  const sh = shop();
  const ind = PROP_INDUSTRY[c.industry] || PROP_INDUSTRY['其他'];
  const goal = PROP_GOAL[opts.goal] || '';
  const bands = priceBands(opts.budget);
  const qty = Number(opts.qty) || 300;

  const t1 = pickTier(0.01, bands.t1, 3);
  const t2 = pickTier(bands.t2a, bands.t2b, 3);
  const t3 = pickBig(bands.t3, 2);

  const tierRow = (label, use, rows, minP, maxP) => {
    if (!rows.length) {
      return '<tr><td><b>' + label + '</b><div class="ps">' + use + '</div></td>' +
        '<td>' + minP + '~' + maxP + ' 元</td>' +
        '<td colspan="3" class="muted">产品库里这个价位还没有品，需要补几个</td></tr>';
    }
    const names = rows.map((r) =>
      esc(r.p.name) + (r.s.spec ? '（' + esc(r.s.spec) + '）' : '') +
      ' <span class="ps">¥' + fmt(r.price) + ' / 起订 ' + (r.s.moq || 0) + '</span>').join('<br>');
    const low = Math.min.apply(null, rows.map((r) => r.price));
    const high = Math.max.apply(null, rows.map((r) => r.price));
    return '<tr><td><b>' + label + '</b><div class="ps">' + use + '</div></td>' +
      '<td>' + (low === high ? '¥' + fmt(low) : '¥' + fmt(low) + '~' + fmt(high)) + '</td>' +
      '<td>' + names + '</td></tr>';
  };

  const moq = t1.length ? Math.max.apply(null, t1.map((r) => r.s.moq || 0)) : 0;
  const poolHint = moq && qty < moq
    ? '<div class="prop-note">你这次要 ' + qty + ' 套，这个品的起订量是 ' + moq + ' 套。' +
      '我可以把做' + (c.brand || '同品牌') + '的其他店一起拼版，单价能摊下来，不用你多订。</div>'
    : '';

  const html =
    '<div class="sheet prop-sheet">' +
      '<div class="sh-head">' +
        '<div class="sh-brand">' +
          (sh.logo ? '<img class="sh-logo" src="' + esc(sh.logo) + '" alt="">' : '') +
          '<div><div class="sh-name">' + esc(sh.name) + '</div>' +
          '<div class="sh-slogan">' + esc(sh.slogan || '') + '</div></div>' +
        '</div>' +
        '<div class="sh-title">礼品活动方案</div>' +
      '</div>' +
      '<div class="sh-meta">' +
        '<div>' + [sh.contact, sh.phone, sh.wechat && ('微信 ' + sh.wechat)].filter(Boolean).map(esc).join('　·　') + '</div>' +
        '<div>日期：' + todayCn() + '</div>' +
      '</div>' +

      '<div class="sh-client">' +
        (c.logo_url ? '<img class="cl-logo" src="' + esc(c.logo_url) + '" alt="">' : '') +
        '<div class="cl-body">' +
          '<div class="cl-name">' + esc(c.company || '客户') + '　·　' + esc(opts.act) + '</div>' +
          '<div class="cl-sub">' +
            [c.contact && ('联系人：' + c.contact), opts.when && ('时间：' + opts.when),
             c.city && ('城市：' + c.city)].filter(Boolean).map(esc).join('　　') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="prop-sec">' +
        '<h3>一、你的场景</h3>' +
        '<p>' + esc(c.company || '') + ' 准备在 ' + esc(opts.when || '近期') + ' 做一场「' + esc(opts.act) + '」，' +
        '这次最想要的是「' + esc(opts.goal) + '」。进店礼预算 ' + esc(opts.budget) + ' 元以内，预计 ' +
        esc(qty) + ' 套。下面这套方案就是照这个预算和目标配的。</p>' +
        (goal ? '<div class="prop-note">' + esc(goal) + '</div>' : '') +
      '</div>' +

      '<div class="prop-sec">' +
        '<h3>二、活动怎么设计（三个钩子）</h3>' +
        '<ol class="prop-ol">' + ind.hooks.map((h) => '<li>' + esc(h) + '</li>').join('') + '</ol>' +
      '</div>' +

      '<div class="prop-sec">' +
        '<h3>三、礼品三档</h3>' +
        '<table class="sh-table"><thead><tr>' +
          '<th style="width:150px">档位</th><th style="width:110px">建议单价</th><th>建议品类（价格含 logo 印制）</th>' +
        '</tr></thead><tbody>' +
          tierRow('引流款', '进店就送 / 签到礼', t1, 0, bands.t1) +
          tierRow('成交款', '下单满额赠 / 试用礼', t2, bands.t2a, bands.t2b) +
          tierRow('大单款', '大额订单 / 抽奖头奖', t3, bands.t3, bands.t3 * 3) +
        '</tbody></table>' +
        poolHint +
      '</div>' +

      '<div class="prop-sec">' +
        '<h3>四、效果图</h3>' +
        '<p>上面三档各挑 1~2 个品，配上' + esc(c.brand || '') + '的 logo 出效果图，图直接放在这一段。' +
        '要真实门店场景，不要艺术图——客户要看见「摆在我店里什么样」。</p>' +
      '</div>' +

      '<div class="prop-sec">' +
        '<h3>五、预估效果</h3>' +
        '<p>这一段填你自己的真实数字，别编——客户看得出来。</p>' +
        '<table class="sh-table"><tbody>' +
          '<tr><td style="width:50%">预计进店人数</td><td>＿＿＿＿ 人</td></tr>' +
          '<tr><td>预计转化率</td><td>＿＿＿＿ %</td></tr>' +
          '<tr><td>预计成交额</td><td>＿＿＿＿ 元</td></tr>' +
        '</tbody></table>' +
      '</div>' +

      '<div class="sh-terms">' +
        '<div>1. 以上单价含 logo 印制，不含特殊工艺（烫金、UV、异形模切）加价。</div>' +
        '<div>2. 运费走物流到付，不包含在报价内；大件到达县市需自提。</div>' +
        '<div>3. 方案里的品类只是建议，可以按你的预算和门店情况替换。</div>' +
        '<div>4. 数量确定后我出正式报价单，全款到账后安排生产。</div>' +
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

window.showProposal = showProposal;
window.openProposalForm = openProposalForm;
