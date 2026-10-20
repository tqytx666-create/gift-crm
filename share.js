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

async function makeShareLink(quoteId) {
  const payload = buildQuotePayload(quoteId);
  if (!payload || !payload.items.length) return toast('这份报价没有明细，先补上');

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
      body: JSON.stringify({ token: t, kind: 'quote', payload: payload }),
    });
    if (r.ok) {
      const url = location.origin + location.pathname + '#share/' + t;
      copyText(url, '链接已复制，直接发微信给客户');
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

window.showShare = showShare;
window.makeShareLink = makeShareLink;

/* ---------------- 事件 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'share-quote') {
    el.disabled = true;
    makeShareLink(el.dataset.id).finally(() => { el.disabled = false; });
  }
});
