/* 第 3 期：图片上传 + 店铺信息 + 可打印的报价单 */

/* ---------------- 图片 ---------------- */

// 手机拍的图几 MB，先在浏览器里压到 1400px 再传
function shrinkImage(file, maxSide) {
  maxSide = maxSide || 1400;
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type) || /svg/.test(file.type)) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      if (scale >= 1 && file.size < 400 * 1024) return resolve(file);
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function uploadImage(file, prefix) {
  const blob = await shrinkImage(file);
  const tk = await token();
  const ext = blob === file ? ((file.name.split('.').pop() || 'png').toLowerCase()) : 'jpg';
  const path = (prefix || 'img') + '/' + Date.now() + '-' +
    Math.random().toString(36).slice(2, 7) + '.' + ext;
  const r = await fetch(SUPA.url + '/storage/v1/object/gift-img/' + path, {
    method: 'POST',
    headers: {
      apikey: SUPA.key,
      Authorization: 'Bearer ' + tk,
      'Content-Type': blob === file ? (file.type || 'image/png') : 'image/jpeg',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (r.status === 401) { await refreshSession(); return uploadImage(file, prefix); }
  if (!r.ok) throw new Error('上传失败 ' + r.status);
  return SUPA.url + '/storage/v1/object/public/gift-img/' + path;
}

/* ---------------- 店铺信息 ---------------- */

const SHOP_KEYS = [
  ['name', '店铺 / 公司名', '深圳XX礼品定制'],
  ['contact', '联系人', '小鱼'],
  ['phone', '电话', '13800000000'],
  ['wechat', '微信号', ''],
  ['addr', '地址', ''],
  ['logo', '店铺 logo', ''],
  ['slogan', '一句介绍（可空）', '客户礼品一站式定制'],
];

function shop() {
  const s = S.settings || {};
  return {
    name: s.shop_name || '礼品定制',
    contact: s.shop_contact || '',
    phone: s.shop_phone || '',
    wechat: s.shop_wechat || '',
    addr: s.shop_addr || '',
    logo: s.shop_logo || '',
    slogan: s.shop_slogan || '',
  };
}

async function saveShop(vals) {
  for (const [k, val] of Object.entries(vals)) {
    const key = 'shop_' + k;
    const existing = (S.settings || {})[key];
    if (existing === undefined) {
      await rest('settings', '', { method: 'POST', body: { k: key, v: String(val || '') } });
    } else if (existing !== String(val || '')) {
      await rest('settings', '?k=eq.' + key, { method: 'PATCH', body: { v: String(val || '') } });
    }
  }
  await loadAll();
}

function editShop() {
  const sh = shop();
  const fields = SHOP_KEYS.map(([k, label, ph]) => ({
    key: k, label,
    ph: k === 'logo' ? '' : ph,
    full: k === 'name' || k === 'addr' || k === 'slogan' || k === 'logo',
    type: k === 'logo' ? 'image' : 'text',
    def: sh[k] || '',
  }));
  openForm('店铺信息（打印报价单用）', fields, sh, async (b) => {
    await saveShop(b);
    renderData();
    toast('店铺信息已保存');
  });
}

/* ---------------- 打印视图 ---------------- */

function enterPrint() {
  document.body.classList.add('print-mode');
}

function leavePrint() {
  document.body.classList.remove('print-mode');
}

// 金额大写
function rmbUpper(num) {
  const n = Math.round(Number(num || 0) * 100) / 100;
  if (!n) return '零元整';
  const cn = '零壹贰叁肆伍陆柒捌玖';
  const u1 = ['', '拾', '佰', '仟'];
  const u2 = ['', '万', '亿', '万亿'];
  let int = Math.floor(n);
  const dec = Math.round((n - int) * 100);

  let s = '';
  let pos = 0;
  let prevZero = false;
  while (int > 0) {
    const sec = int % 10000;
    let secStr = '';
    let tmp = sec;
    let zero = false;
    for (let i = 0; i < 4; i++) {
      const d = tmp % 10;
      if (d === 0) {
        if (secStr) zero = true;
      } else {
        secStr = cn[d] + u1[i] + (zero ? '零' : '') + secStr;
        zero = false;
      }
      tmp = Math.floor(tmp / 10);
    }
    if (secStr) {
      s = secStr + u2[pos] + (prevZero && s ? '零' : '') + s;
      prevZero = (sec < 1000);
    } else if (s) {
      prevZero = true;
    }
    int = Math.floor(int / 10000);
    pos++;
  }
  if (!s) s = '零';
  let out = s + '元';
  if (dec === 0) return out + '整';
  const jiao = Math.floor(dec / 10);
  const fen = dec % 10;
  if (jiao) out += cn[jiao] + '角';
  else if (fen) out += '零';
  if (fen) out += cn[fen] + '分';
  else out += '整';
  return out;
}

function todayCn() {
  const d = new Date();
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
}

function showPrintQuote(id) {
  const q = byId(S.quotes, id);
  if (!q) { toast('报价单不存在'); return; }
  const items = normalizeItems(q.items_json);
  const c = byId(S.customers, q.customer_id) || {};
  const sh = shop();
  const total = Number(q.total_price || 0);

  const rows = items.map((it) => {
    const sku = it.sku_id ? byId(S.skus, it.sku_id) : null;
    let prod = sku ? byId(S.products, sku.product_id) : null;
    // 老报价单里可能只有名字，按名字兜底找产品图
    if (!prod && it.name) prod = S.products.find((x) => x.name === it.name) || null;
    const pic = (prod && prod.image) || (sku && sku.image) || '';
    return '<tr>' +
      '<td class="pic">' + (pic ? '<img src="' + esc(pic) + '" alt="">' : '<span class="ph">无图</span>') + '</td>' +
      '<td><div class="pn">' + esc(it.name || '') + '</div>' +
      (it.spec ? '<div class="ps">' + esc(it.spec) + '</div>' : '') + '</td>' +
      '<td class="num">' + it.qty + '</td>' +
      '<td class="num">' + fmt(it.unit_price) + '</td>' +
      '<td class="num">' + fmt(it.price) + '</td>' +
      '</tr>';
  }).join('');

  const html =
    '<div class="sheet">' +
      '<div class="sh-head">' +
        '<div class="sh-brand">' +
          (sh.logo ? '<img class="sh-logo" src="' + esc(sh.logo) + '" alt="">' : '') +
          '<div><div class="sh-name">' + esc(sh.name) + '</div>' +
          '<div class="sh-slogan">' + esc(sh.slogan || '') + '</div></div>' +
        '</div>' +
        '<div class="sh-title">礼品报价单</div>' +
      '</div>' +
      '<div class="sh-meta">' +
        '<div>' + [sh.contact, sh.phone, sh.wechat && ('微信 ' + sh.wechat)].filter(Boolean).map(esc).join('　·　') + '</div>' +
        '<div>日期：' + esc(dateCn(q.created_at)) + '</div>' +
      '</div>' +

      '<div class="sh-client">' +
        (c.logo_url ? '<img class="cl-logo" src="' + esc(c.logo_url) + '" alt="">' : '') +
        '<div class="cl-body">' +
          '<div class="cl-name">' + esc(c.company || q.customer_name || '客户') + '</div>' +
          '<div class="cl-sub">' +
            [c.contact && ('联系人：' + c.contact), c.phone && ('电话：' + c.phone),
             c.city && ('城市：' + c.city)].filter(Boolean).map(esc).join('　　') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<table class="sh-table">' +
        '<thead><tr><th class="pic">图</th><th>品名 / 规格</th>' +
        '<th class="num">数量</th><th class="num">单价</th><th class="num">金额</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="5" class="empty">没有明细</td></tr>') + '</tbody>' +
      '</table>' +

      '<div class="sh-total">' +
        '<div class="st-upper">合计人民币（大写）：' + esc(rmbUpper(total)) + '</div>' +
        '<div class="st-num">¥ ' + fmt(total) + '</div>' +
      '</div>' +

      '<div class="sh-terms">' +
        '<div>1. 报价有效期至 ' + esc(q.valid_until || '7 天内') + '，过期以最新报价为准。</div>' +
        '<div>2. 运费走物流到付，不包含在报价内；大件到达县市需自提。</div>' +
        '<div>3. 全款到账后安排生产，可开公户收款。</div>' +
        '<div>4. 以上价格含 logo 印制，不含特殊工艺（烫金、UV 等）加价。</div>' +
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

function dateCn(s) {
  if (!s) return todayCn();
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s).slice(0, 10);
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'print-quote') { showPrintQuote(el.dataset.id); return; }
  if (act === 'do-print') { window.print(); return; }
  if (act === 'leave-print') {
    leavePrint();
    location.hash = '#orders';
    return;
  }
  if (act === 'edit-shop') { editShop(); return; }
});

window.showPrintQuote = showPrintQuote;
window.leavePrint = leavePrint;
