/* 分享给客户的只读页面 —— 凭随机 token 看，不含成本、不含别的客户 */

function shareToken() {
  const a = new Uint8Array(10);
  (crypto.getRandomValues ? crypto : { getRandomValues: (x) => {
    for (let i = 0; i < x.length; i++) x[i] = Math.floor(Math.random() * 256);
    return x;
  } }).getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildQuotePayload(quoteId) {
  const q = byId(S.quotes, quoteId);
  if (!q) return null;
  const c = byId(S.customers, q.customer_id) || {};
  const sh = (typeof shop === 'function') ? shop() : {};
  const items = normalizeItems(q.items_json).map((it) => ({
    name: it.name || '',
    spec: it.spec || '',
    qty: Number(it.qty || 0),
    unit_price: Number(it.unit_price || 0),
    price: Number(it.price || 0),
  }));
  return {
    kind: 'quote',
    shop: { name: sh.name, contact: sh.contact, phone: sh.phone, wechat: sh.wechat, addr: sh.addr, logo: sh.logo },
    customer: { company: c.company || q.customer_name || '客户', contact: c.contact || '', logo: c.logo_url || '' },
    title: q.title || '',
    items: items,
    total: Number(q.total_price || 0),
    valid_until: q.valid_until || '',
    date: localDate(q.created_at),
    note: '',
  };
}

async function createShare(kind, payload, refId, title) {
  const tk = await token();
  for (let i = 0; i < 4; i++) {
    const t = shareToken();
    const r = await fetch(SUPA.url + '/rest/v1/gift_shares', {
      method: 'POST',
      headers: {
        apikey: SUPA.key,
        Authorization: 'Bearer ' + tk,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        token: t, kind: kind, payload: payload,
        ref_id: refId || null, title: title || '',
      }),
    });
    if (r.ok) {
      const url = location.origin + location.pathname + '#share/' + t;
      copyText(url, '链接已复制，直接发微信给客户');
      if (typeof loadAll === 'function') loadAll().then(() => render()).catch(() => null);
      return url;
    }
    if (r.status !== 409) {
      toast('生成失败 ' + r.status);
      return null;
    }
  }
  toast('生成失败，再试一次');
  return null;
}

async function makeShareLink(quoteId) {
  const payload = buildQuotePayload(quoteId);
  if (!payload || !payload.items.length) return toast('这份报价没有明细，先补上');
  const q = byId(S.quotes, quoteId);
  return createShare('quote', payload, Number(quoteId), q ? (q.customer_name || '') + ' 报价' : '报价');
}

async function makeProposalShare() {
  const last = window.LAST_PROPOSAL;
  if (!last || !last.payload) return toast('先出一份方案再分享');
  return createShare('proposal', last.payload, last.customerId || null,
    (last.payload.customer && last.payload.customer.company ? last.payload.customer.company + ' ' : '') + '活动方案');
}

// 某个报价/方案发过的分享，最近一条
function shareStatusOf(kind, refId) {
  const list = (S.shares || []).filter((x) => x.kind === kind && Number(x.ref_id) === Number(refId));
  if (!list.length) return null;
  return list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

function shareStatusText(kind, refId) {
  const sh = shareStatusOf(kind, refId);
  if (!sh) return '还没发过';
  if (!Number(sh.views)) return '发了，客户还没点开';
  return '客户看过 ' + sh.views + ' 次（最近 ' + localDate(sh.last_viewed_at) + '）';
}

async function fetchShare(tokenStr) {
  const r = await fetch(SUPA.url + '/rest/v1/rpc/gift_get_share', {
    method: 'POST',
    headers: { apikey: SUPA.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ t: tokenStr }),
  });
  if (!r.ok) throw new Error('拿不到这份内容');
  return r.json();
}

async function showShare(tokenStr) {
  document.body.classList.add('share-mode');
  const rail = document.querySelector('.rail');
  const bar = document.querySelector('.topbar');
  if (rail) rail.style.display = 'none';
  if (bar) bar.style.display = 'none';
  const boot = $('#boot');
  if (boot) boot.classList.remove('on');

  let p;
  try {
    p = await fetchShare(tokenStr);
  } catch (e) {
    p = null;
  }
  if (!p) {
    $('#view').innerHTML =
      '<div class="share-wrap"><div class="share-dead">' +
      '<h2>链接失效了</h2><p>可能已经过期，或者链接不完整。让业务员重新发一次吧。</p></div></div>';
    return;
  }
  if (p.kind === 'proposal') return renderShareProposal(p);

  const sh = p.shop || {};
  const c = p.customer || {};
  const rows = (p.items || []).map((it) =>
    '<tr>' +
      '<td><div class="pn">' + esc(it.name) + '</div>' +
      (it.spec ? '<div class="ps">' + esc(it.spec) + '</div>' : '') + '</td>' +
      '<td class="num">' + it.qty + '</td>' +
      '<td class="num">' + fmt(it.unit_price) + '</td>' +
      '<td class="num">' + fmt(it.price) + '</td>' +
    '</tr>').join('');

  $('#view').innerHTML =
    '<div class="share-wrap">' +
      '<div class="sheet">' +
        '<div class="sh-head">' +
          '<div class="sh-brand">' +
            (sh.logo ? '<img class="sh-logo" src="' + esc(sh.logo) + '" alt="">' : '') +
            '<div><div class="sh-name">' + esc(sh.name || '礼品定制') + '</div>' +
            '<div class="sh-slogan">' + esc(sh.slogan || '') + '</div></div>' +
          '</div>' +
          '<div class="sh-title">礼品报价单</div>' +
        '</div>' +
        '<div class="sh-meta">' +
          '<div>' + [sh.contact, sh.phone, sh.wechat && ('微信 ' + sh.wechat)].filter(Boolean).map(esc).join('　·　') + '</div>' +
          '<div>' + esc(p.date || '') + '</div>' +
        '</div>' +
        '<div class="sh-client">' +
          (c.logo ? '<img class="cl-logo" src="' + esc(c.logo) + '" alt="">' : '') +
          '<div class="cl-body"><div class="cl-name">' + esc(c.company) + '</div>' +
          (c.contact ? '<div class="cl-sub">联系人：' + esc(c.contact) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<table class="sh-table"><thead><tr>' +
          '<th>品名 / 规格</th><th class="num">数量</th><th class="num">单价</th><th class="num">金额</th>' +
        '</tr></thead><tbody>' + rows +
          '<tr class="total-row"><td colspan="3">合计</td><td class="num">' + fmt(p.total) + '</td></tr>' +
        '</tbody></table>' +
        '<div class="sh-terms">' +
          '<div>1. 报价有效期至 ' + esc(p.valid_until || '7 天内') + '，过期以最新报价为准。</div>' +
          '<div>2. 运费走物流到付，不含在报价内；大件到达县市需自提。</div>' +
          '<div>3. 全款到账后安排生产，可开公户收款。</div>' +
        '</div>' +
        '<div class="share-cta">' +
          '<div class="scta-t">有要调整的地方，直接跟我说</div>' +
          '<div class="scta-b">' +
            (sh.phone ? '<a class="scta-btn" href="tel:' + esc(sh.phone) + '">打电话</a>' : '') +
            '<span class="scta-wx">微信 ' + esc(sh.wechat || sh.phone || '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="sh-foot">' + (sh.addr ? esc(sh.addr) + '　' : '') + esc(sh.name || '') +
          (sh.phone ? '　' + esc(sh.phone) : '') + '</div>' +
      '</div>' +
      '<div class="print-bar no-print" style="justify-content:center">' +
        '<button class="btn" onclick="window.print()">存成 PDF</button>' +
      '</div>' +
    '</div>';
}

function renderShareProposal(p) {
  const sh = p.shop || {};
  const c = p.customer || {};
  const tiers = (p.tiers || []).map((t) => {
    const items = (t.items || []).length
      ? t.items.map((i) => esc(i.name) + (i.spec ? '（' + esc(i.spec) + '）' : '') +
          ' <span class="ps">¥' + fmt(i.price) + (i.moq ? ' / 起订 ' + i.moq : '') + '</span>').join('<br>')
      : '<span class="muted">这个价位暂时没有合适的品</span>';
    return '<tr><td><b>' + esc(t.label) + '</b><div class="ps">' + esc(t.use) + '</div></td><td>' + items + '</td></tr>';
  }).join('');

  $('#view').innerHTML =
    '<div class="share-wrap">' +
      '<div class="sheet prop-sheet">' +
        '<div class="sh-head">' +
          '<div class="sh-brand">' +
            (sh.logo ? '<img class="sh-logo" src="' + esc(sh.logo) + '" alt="">' : '') +
            '<div><div class="sh-name">' + esc(sh.name || '礼品定制') + '</div>' +
            '<div class="sh-slogan">' + esc(sh.slogan || '') + '</div></div>' +
          '</div>' +
          '<div class="sh-title">礼品活动方案</div>' +
        '</div>' +
        '<div class="sh-meta"><div>' +
          [sh.contact, sh.phone, sh.wechat && ('微信 ' + sh.wechat)].filter(Boolean).map(esc).join('　·　') +
          '</div><div>' + esc(p.date || '') + '</div></div>' +
        '<div class="sh-client">' +
          (c.logo ? '<img class="cl-logo" src="' + esc(c.logo) + '" alt="">' : '') +
          '<div class="cl-body"><div class="cl-name">' + esc(c.company) + '　·　' + esc(p.act || '') + '</div>' +
          '<div class="cl-sub">' + [c.contact && ('联系人：' + c.contact), p.when && ('时间：' + p.when)]
            .filter(Boolean).map(esc).join('　　') + '</div></div>' +
        '</div>' +
        '<div class="prop-sec"><h3>一、你的场景</h3><p>' +
          esc(c.company) + ' 准备在 ' + esc(p.when || '近期') + ' 做一场「' + esc(p.act) + '」，' +
          '目标是「' + esc(p.goal || '') + '」。进店礼预算 ' + esc(p.budget) + ' 元以内，预计 ' +
          esc(p.qty) + ' 套。</p>' +
          (p.goalNote ? '<div class="prop-note">' + esc(p.goalNote) + '</div>' : '') + '</div>' +
        '<div class="prop-sec"><h3>二、活动怎么设计</h3><ol class="prop-ol">' +
          (p.hooks || []).map((h) => '<li>' + esc(h) + '</li>').join('') + '</ol></div>' +
        '<div class="prop-sec"><h3>三、礼品三档</h3>' +
          '<table class="sh-table"><tbody>' + tiers + '</tbody></table>' +
          (p.poolHint ? '<div class="prop-note">' + esc(p.poolHint) + '</div>' : '') + '</div>' +
        '<div class="prop-sec"><h3>四、效果图</h3>' +
          '<p>上面三档各挑 1~2 个品，配上 logo 出效果图——让您先看见「摆在我店里什么样」。</p></div>' +
        '<div class="sh-terms">' +
          '<div>1. 单价含 logo 印制，不含特殊工艺加价。</div>' +
          '<div>2. 运费物流到付，不含在报价内。</div>' +
          '<div>3. 品类只是建议，可以按预算替换。</div>' +
        '</div>' +
        '<div class="share-cta"><div class="scta-t">这份方案哪里想调整，直接跟我说</div>' +
          '<div class="scta-b">' +
            (sh.phone ? '<a class="scta-btn" href="tel:' + esc(sh.phone) + '">打电话</a>' : '') +
            '<span class="scta-wx">微信 ' + esc(sh.wechat || sh.phone || '') + '</span>' +
          '</div></div>' +
        '<div class="sh-foot">' + (sh.addr ? esc(sh.addr) + '　' : '') + esc(sh.name || '') +
          (sh.phone ? '　' + esc(sh.phone) : '') + '</div>' +
      '</div>' +
      '<div class="print-bar no-print" style="justify-content:center">' +
        '<button class="btn" onclick="window.print()">存成 PDF</button></div>' +
    '</div>';
}

window.showShare = showShare;
window.makeShareLink = makeShareLink;
window.makeProposalShare = makeProposalShare;
window.shareStatusText = shareStatusText;

/* ---------------- 事件 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'share-proposal') {
    el.disabled = true;
    makeProposalShare().finally(() => { el.disabled = false; });
    return;
  }
  if (el.dataset.act === 'share-quote') {
    el.disabled = true;
    makeShareLink(el.dataset.id).finally(() => { el.disabled = false; });
  }
});

/* ---------------- 分享记录一览 ---------------- */
function shareCustomer(s) {
  if (s.kind === 'quote') {
    const q = byId(S.quotes, s.ref_id);
    return q ? (q.customer_name || custName(q.customer_id)) : (s.title || '报价');
  }
  const c = byId(S.customers, s.ref_id);
  return (c && c.company) || (s.title || '方案');
}

function shareGroups() {
  const list = (S.shares || []).slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const groups = { unseen: [], seen: [], done: [] };
  list.forEach((s) => {
    const q = s.kind === 'quote' ? byId(S.quotes, s.ref_id) : null;
    const won = q && q.status === 'won';
    if (won) groups.done.push(s);
    else if (!Number(s.views)) groups.unseen.push(s);
    else groups.seen.push(s);
  });
  return groups;
}

function shareCard(s) {
  const n = Number(s.views || 0);
  const cls = n ? (s.kind === 'quote' ? '' : 'blue') : 'warn';
  const when = n
    ? '看过 ' + n + ' 次 · 最近 ' + localDate(s.last_viewed_at)
    : '发出去了，还没点开';
  return '<div class="ship-card ' + (n ? '' : 'warn') + '">' +
    '<div class="sp-head"><b>' + esc(shareCustomer(s)) + '</b>' +
      '<span class="tag ' + (s.kind === 'quote' ? 'blue' : '') + '">' +
      (s.kind === 'quote' ? '报价单' : '活动方案') + '</span></div>' +
    '<div class="sp-line muted">' + esc(localDate(s.created_at)) + ' 发的　·　' + esc(when) + '</div>' +
    '<div class="sp-act">' +
      '<button class="btn sm" data-act="copy-share" data-token="' + esc(s.token) + '">复制链接</button>' +
      (s.kind === 'quote'
        ? '<button class="btn sm" data-act="open-quote" data-id="' + s.ref_id + '">看报价单</button>'
        : '<button class="btn sm" data-act="open-customer" data-id="' + s.ref_id + '">看客户</button>') +
      '<button class="btn sm" data-act="open-share" data-token="' + esc(s.token) + '">自己预览</button>' +
    '</div>' +
  '</div>';
}

function sharePanel() {
  const g = shareGroups();
  const total = g.unseen.length + g.seen.length + g.done.length;

  const block = (title, hint, arr) => arr.length
    ? '<div class="section-title">' + title + ' <span class="muted small">' + arr.length + ' 份</span></div>' +
      (hint ? '<div class="hint" style="margin:0 0 10px">' + hint + '</div>' : '') +
      '<div class="ship-list" style="margin-bottom:16px">' + arr.map(shareCard).join('') + '</div>'
    : '';

  if (!total) {
    return '<div class="table-wrap"><div class="empty">还没发过分享链接。<br>' +
      '<span class="small muted">在报价单或方案页点「分享给客户」，这里就会记下发给了谁、看没看。</span></div></div>';
  }

  return '<div class="cards" style="grid-template-columns:repeat(3,1fr)">' +
      '<div class="stat"><b>' + total + '</b><span>发出去的</span></div>' +
      '<div class="stat ' + (g.unseen.length ? 'warn' : '') + '"><b>' + g.unseen.length + '</b><span>还没点开</span></div>' +
      '<div class="stat ok"><b>' + g.done.length + '</b><span>已经成交</span></div>' +
    '</div>' +
    block('发了没点开', '两天以上还没点开的，别再等微信了，直接打个电话。', g.unseen) +
    block('看了还没回音', '点开过的说明在认真看，这时候问一句「哪里要调」最容易推进。', g.seen) +
    block('已经成交', '', g.done);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'copy-share') {
    const url = location.origin + location.pathname + '#share/' + el.dataset.token;
    copyText(url, '链接已复制，直接发微信给客户');
    return;
  }
  if (act === 'open-share') {
    const win = window.open(location.origin + location.pathname + '#share/' + el.dataset.token, '_blank');
    if (!win) toast('浏览器拦住了新窗口');
    return;
  }
});

window.sharePanel = sharePanel;
window.shareGroups = shareGroups;
