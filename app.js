/* 礼品管家 —— 前端 */

const S = {
  suppliers: [], products: [], skus: [], customers: [], followups: [], quotes: [],
  orders: [], payments: [], pools: [], poolItems: [],
  view: 'customers', q: '',
};

const VS = {
  customers: { stage: '', industry: '', brand: '' },
  products: { supplier: '', category: '' },
  quote: { customerId: 0, items: [], markup: 0.25, result: null },
};

const STAGES = ['待加微信', '待报价', '待发方案', '已报价', '待成交', '已成交', '暂缓'];
const INDUSTRIES = ['建材家居', '汽车4S', '餐饮', '美业', '教培', '其他'];
const SIZES = ['小店', '中型', '大店', '连锁'];
const SOURCES = ['微信老客', '招聘网', '展会', '转介绍', '短视频', '其他'];

/* ---------------- 小工具 ---------------- */
const $ = (s) => document.querySelector(s);
const byId = (arr, id) => arr.find((x) => Number(x.id) === Number(id));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const fmt = (n) => Number(n || 0).toLocaleString('zh-CN',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Number(n || 0).toLocaleString('zh-CN');
const dash = (v) => (v === '' || v == null ? '<span class="muted">—</span>' : esc(v));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('on'), 1900);
}

/* ---------------- 云端数据层（Supabase） ---------------- */
const SUPA = {
  url: 'https://cmswoyiuoeqzeassubvw.supabase.co',
  key: 'sb_publishable_kyhsOoWxO8YEBczAIJsUxQ_9KUmxFV2',
};
const TAB = {
  suppliers: 'gift_suppliers', products: 'gift_products', skus: 'gift_skus',
  customers: 'gift_customers', followups: 'gift_followups', quotes: 'gift_quotes',
  orders: 'gift_orders', payments: 'gift_payments',
  pools: 'gift_pools', poolItems: 'gift_pool_items',
};
let SESSION = null;

function loadSession() {
  try { SESSION = JSON.parse(localStorage.getItem('gift_session') || 'null'); } catch (e) { SESSION = null; }
}
function storeSession(s) {
  SESSION = s;
  try {
    if (s) localStorage.setItem('gift_session', JSON.stringify(s));
    else localStorage.removeItem('gift_session');
  } catch (e) { /* 隐私模式 */ }
}

function normalizeAccount(raw) {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (v.indexOf('@') < 0) v += '@gift.local';
  return v;
}

async function login(email, password) {
  const r = await fetch(SUPA.url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: SUPA.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || d.message || '账号或密码不对');
  storeSession({
    email: email,
    account: email.split('@')[0],
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    exp: Date.now() + (d.expires_in || 3600) * 1000,
  });
  return true;
}

async function refreshSession() {
  if (!SESSION || !SESSION.refresh_token) throw new Error('登录已过期');
  const r = await fetch(SUPA.url + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: SUPA.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: SESSION.refresh_token }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    storeSession(null);
    if (typeof showLogin === 'function') showLogin('登录已过期，请重新登录');
    throw new Error('登录已过期');
  }
  storeSession({
    email: SESSION.email,
    account: SESSION.account || (SESSION.email || '').split('@')[0],
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    exp: Date.now() + (d.expires_in || 3600) * 1000,
  });
}

async function token() {
  if (!SESSION) throw new Error('没登录');
  if (Date.now() > SESSION.exp - 120000) await refreshSession();
  return SESSION.access_token;
}

async function rest(table, query, opts) {
  opts = opts || {};
  const tk = await token();
  const r = await fetch(SUPA.url + '/rest/v1/' + TAB[table] + (query || ''), {
    method: opts.method || 'GET',
    headers: {
      apikey: SUPA.key,
      Authorization: 'Bearer ' + tk,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (r.status === 401) {
    await refreshSession();
    return rest(table, query, opts);
  }
  const txt = await r.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!r.ok) throw new Error((data && (data.message || data.hint || data.details)) || ('请求失败 ' + r.status));
  return data;
}

const NUM_FIELDS = ['moq', 'cost', 'price300', 'price1000', 'lead_days', 'budget',
  'supplier_id', 'product_id', 'customer_id', 'markup', 'total_cost', 'total_price'];

// 表单里留空是空字符串，Postgres 的 numeric 不收，先统一处理
function sanitize(body) {
  const out = {};
  Object.keys(body).forEach((k) => {
    let v = body[k];
    if (NUM_FIELDS.indexOf(k) >= 0) {
      if (v === '' || v == null) v = k.slice(-3) === '_id' ? null : 0;
      else v = Number(v);
      if (v !== null && isNaN(v)) v = 0;
    }
    out[k] = v;
  });
  return out;
}

function n(v) { const x = Number(v); return isNaN(x) ? 0 : x; }

async function rpcAll() {
  const tk = await token();
  const r = await fetch(SUPA.url + '/rest/v1/rpc/gift_snapshot', {
    method: 'POST',
    headers: { apikey: SUPA.key, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (r.status === 401) { await refreshSession(); return rpcAll(); }
  const txt = await r.text();
  let d = null;
  try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = null; }
  if (!r.ok || !d) throw new Error((d && (d.message || d.hint)) || ('读取失败 ' + r.status));
  return d;
}

// 一次拿全部（快）；失败就退回逐表拉（稳）
async function loadAll() {
  let d;
  try {
    d = await rpcAll();
  } catch (err) {
    console.warn('快照接口不可用，改用逐表读取', err);
    const res = await Promise.all([
      rest('suppliers', '?select=*&order=id'),
      rest('products', '?select=*&order=id'),
      rest('skus', '?select=*&order=id'),
      rest('customers', '?select=*&order=id'),
      rest('followups', '?select=*&order=id'),
      rest('quotes', '?select=*&order=id.desc&limit=200'),
      rest('orders', '?select=*&order=id.desc&limit=300'),
      rest('payments', '?select=*&order=id'),
      rest('pools', '?select=*&order=id'),
      rest('poolItems', '?select=*&order=id'),
    ]);
    d = {
      suppliers: res[0], products: res[1], skus: res[2], customers: res[3],
      followups: res[4], quotes: res[5], orders: res[6], payments: res[7],
      pools: res[8], poolItems: res[9],
    };
  }

  // Postgres 的 numeric 回来是字符串，统一转成数字，不然报价会算错
  (d.skus || []).forEach((x) => {
    x.cost = n(x.cost); x.price300 = n(x.price300); x.price1000 = n(x.price1000);
    x.moq = n(x.moq); x.lead_days = n(x.lead_days);
  });
  (d.customers || []).forEach((x) => { x.budget = n(x.budget); });
  (d.quotes || []).forEach((x) => {
    x.total_cost = n(x.total_cost); x.total_price = n(x.total_price); x.markup = n(x.markup);
  });
  (d.orders || []).forEach((x) => {
    x.total_cost = n(x.total_cost); x.total_price = n(x.total_price); x.freight = n(x.freight);
  });
  (d.payments || []).forEach((x) => { x.amount = n(x.amount); });
  (d.pools || []).forEach((x) => { x.target_qty = n(x.target_qty); });
  (d.poolItems || []).forEach((x) => { x.qty = n(x.qty); });

  S.suppliers = d.suppliers || [];
  S.products = d.products || [];
  S.skus = d.skus || [];
  S.customers = d.customers || [];
  S.followups = d.followups || [];
  S.quotes = d.quotes || [];
  S.orders = d.orders || [];
  S.payments = d.payments || [];
  S.pools = d.pools || [];
  S.poolItems = d.poolItems || [];
  updateCounts();
}

function updateCounts() {
  $('#cntCustomers').textContent = S.customers.length;
  $('#cntSkus').textContent = S.skus.length;
  $('#cntSuppliers').textContent = S.suppliers.length;
  const co = $('#cntOrders');
  if (co) co.textContent = (S.orders || []).length;
  const cp = $('#cntPools');
  if (cp) cp.textContent = (S.pools || []).filter((x) => x.status === 'open').length;
}

async function save(table, id, body) {
  const clean = sanitize(body);
  if (id) await rest(table, '?id=eq.' + id, { method: 'PATCH', body: clean });
  else await rest(table, '', { method: 'POST', body: clean });
  await loadAll();
  render();
}

async function del(table, id, name) {
  if (!confirm('确定删除「' + (name || '这条') + '」？删了拿不回来。')) return;
  try {
    await rest(table, '?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' });
    await loadAll();
    closeDrawer();
    render();
    toast('已删除');
  } catch (e) {
    toast('删除失败：' + e.message);
  }
}

/* ---------------- 弹窗表单 ---------------- */
let formSubmit = null;

function openForm(title, fields, values, onSubmit) {
  const v = values || {};
  const html = fields.map((f) => {
    const val = v[f.key] == null ? (f.def == null ? '' : f.def) : v[f.key];
    let input;
    if (f.type === 'select') {
      input = '<select name="' + f.key + '">' + f.options.map((o) => {
        const ov = typeof o === 'string' ? o : o.v;
        const ot = typeof o === 'string' ? o : o.t;
        return '<option value="' + esc(ov) + '"' + (String(ov) === String(val) ? ' selected' : '') + '>' + esc(ot) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea name="' + f.key + '" placeholder="' + esc(f.ph || '') + '">' + esc(val) + '</textarea>';
    } else {
      input = '<input name="' + f.key + '" type="' + (f.type || 'text') + '" value="' + esc(val) +
        '" placeholder="' + esc(f.ph || '') + '"' + (f.type === 'number' ? ' step="any"' : '') + '>';
    }
    return '<div class="fld ' + (f.full ? 'full' : '') + '"><label>' + esc(f.label) + '</label>' +
      input + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
  }).join('');

  $('#modalTitle').textContent = title;
  const form = $('#modalForm');
  form.className = 'modal-body form-grid';
  form.innerHTML = html;
  formSubmit = onSubmit;
  $('#modalMask').classList.add('on');
  const first = form.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 30);
}

function closeForm() {
  $('#modalMask').classList.remove('on');
  formSubmit = null;
}

$('#modalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!formSubmit) return;
  const fd = new FormData(e.target);
  const body = {};
  fd.forEach((val, k) => { body[k] = val; });
  try {
    await formSubmit(body);
    closeForm();
  } catch (err) {
    toast('保存失败：' + err.message);
  }
});
$('#modalClose').onclick = closeForm;
$('#modalCancel').onclick = closeForm;
$('#modalMask').addEventListener('click', (e) => { if (e.target.id === 'modalMask') closeForm(); });

/* ---------------- 抽屉 ---------------- */
function openDrawer(title, html) {
  $('#drawerTitle').textContent = title;
  $('#drawerBody').innerHTML = html;
  $('#drawer').classList.add('on');
  $('#drawerMask').classList.add('on');
}
function closeDrawer() {
  $('#drawer').classList.remove('on');
  $('#drawerMask').classList.remove('on');
  setTimeout(() => { $('#drawerBody').innerHTML = ''; }, 260);
}
$('#drawerClose').onclick = closeDrawer;
$('#drawerMask').onclick = closeDrawer;

/* ---------------- 导航 ---------------- */
document.querySelectorAll('.nav-btn').forEach((b) => {
  b.onclick = () => { location.hash = '#' + b.dataset.view; };
});

function setView(view, customerId) {
  if (S.view !== view) {
    S.q = '';
    $('#globalSearch').value = '';
  }
  S.view = view;
  document.querySelectorAll('.nav-btn').forEach((x) => x.classList.toggle('active', x.dataset.view === view));
  if (customerId) openCustomer(customerId);
  else closeDrawer();
  render();
}

function applyHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  const parts = raw.split('/');
  const ok = ['customers', 'products', 'suppliers', 'quote', 'orders', 'pools', 'data'];
  if (ok.indexOf(parts[0]) >= 0) setView(parts[0], parts[1] ? Number(parts[1]) : 0);
  else setView('customers', 0);
}
window.addEventListener('hashchange', applyHash);

$('#globalSearch').addEventListener('input', (e) => {
  S.q = e.target.value.trim().toLowerCase();
  render();
});

/* ---------------- 渲染入口 ---------------- */
function topActions() {
  const box = $('#topActions');
  if (S.view === 'customers') {
    box.innerHTML = '<button class="btn primary" data-act="add-customer">+ 新增客户</button>';
  } else if (S.view === 'products') {
    box.innerHTML = '<button class="btn" data-act="add-product">+ 新增产品</button>' +
      '<button class="btn primary" data-act="add-sku">+ 新增规格</button>';
  } else if (S.view === 'suppliers') {
    box.innerHTML = '<button class="btn primary" data-act="add-supplier">+ 新增厂家</button>';
  } else if (S.view === 'quote') {
    box.innerHTML = '<button class="btn" data-act="go-customers">去客户页</button>';
  } else if (S.view === 'orders') {
    box.innerHTML = '<button class="btn primary" data-act="go-quote">+ 新建报价</button>';
  } else if (S.view === 'pools') {
    box.innerHTML = '<button class="btn primary" data-act="add-pool">+ 建一个拼单</button>';
  } else {
    box.innerHTML = '';
  }
}

function render() {
  topActions();
  if (S.view === 'orders' && typeof window.renderOrders === 'function') return window.renderOrders();
  if (S.view === 'pools' && typeof window.renderPools === 'function') return window.renderPools();
  const map = { customers: renderCustomers, products: renderProducts, suppliers: renderSuppliers, quote: renderQuote, data: renderData };
  (map[S.view] || renderCustomers)();
}

/* ================= 客户 ================= */
function renderCustomers() {
  const st = VS.customers;
  const q = S.q;

  let list = S.customers.slice();
  if (st.stage) list = list.filter((c) => c.stage === st.stage);
  if (st.industry) list = list.filter((c) => c.industry === st.industry);
  if (st.brand) list = list.filter((c) => c.brand === st.brand);
  if (q) {
    list = list.filter((c) => [c.company, c.contact, c.salutation, c.phone, c.wechat, c.brand, c.city, c.note]
      .join(' ').toLowerCase().includes(q));
  }

  const brandCount = {};
  S.customers.forEach((c) => { if (c.brand) brandCount[c.brand] = (brandCount[c.brand] || 0) + 1; });

  const total = S.customers.length;
  const following = S.customers.filter((c) => c.stage !== '已成交' && c.stage !== '暂缓').length;
  const won = S.customers.filter((c) => c.stage === '已成交').length;
  const splittable = S.customers.filter((c) => c.brand && brandCount[c.brand] > 1).length;

  const brands = [...new Set(S.customers.map((c) => c.brand).filter(Boolean))].sort();
  const inds = [...new Set(S.customers.map((c) => c.industry).filter(Boolean))].sort();

  const rows = list.map((c) => {
    const same = c.brand ? (brandCount[c.brand] - 1) : 0;
    return '<tr data-act="open-customer" data-id="' + c.id + '">' +
      '<td><div class="rowtitle">' + esc(c.company || '未命名') + '</div>' +
      (c.note ? '<div class="rowsub">' + esc(c.note.slice(0, 28)) + '</div>' : '') + '</td>' +
      '<td>' + dash(c.contact) + (c.salutation ? '<div class="rowsub">' + esc(c.salutation) + '</div>' : '') + '</td>' +
      '<td>' + (c.brand ? '<span class="tag blue">' + esc(c.brand) + '</span>' : '<span class="muted">—</span>') +
      (same > 0 ? ' <span class="tag ok">可拼单 ' + same + '</span>' : '') + '</td>' +
      '<td>' + dash(c.city) + '</td>' +
      '<td class="num">' + (c.budget ? esc(c.budget) + ' 元' : '<span class="muted">—</span>') + '</td>' +
      '<td>' + stageTag(c.stage) + '</td>' +
      '<td class="muted small">' + dash(c.last_contact) + '</td>' +
      '</tr>';
  }).join('');

  $('#view').innerHTML =
    '<div class="cards">' +
      '<div class="stat"><b>' + total + '</b><span>客户总数</span></div>' +
      '<div class="stat warn"><b>' + following + '</b><span>还在跟</span></div>' +
      '<div class="stat ok"><b>' + won + '</b><span>已成交</span></div>' +
      '<div class="stat"><b>' + splittable + '</b><span>可拼单客户</span></div>' +
    '</div>' +
    '<div class="toolbar">' +
      '<div class="chips" id="stageChips">' +
        '<button class="chip ' + (st.stage === '' ? 'on' : '') + '" data-stage="">全部</button>' +
        STAGES.map((s) => '<button class="chip ' + (st.stage === s ? 'on' : '') + '" data-stage="' + s + '">' + s + '</button>').join('') +
      '</div>' +
      '<select id="fIndustry"><option value="">行业不限</option>' +
        inds.map((i) => '<option ' + (st.industry === i ? 'selected' : '') + '>' + esc(i) + '</option>').join('') + '</select>' +
      '<select id="fBrand"><option value="">品牌不限</option>' +
        brands.map((b) => '<option ' + (st.brand === b ? 'selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>' +
      '<span class="muted small">' + list.length + ' 条</span>' +
    '</div>' +
    '<div class="table-wrap cust-list"><table><thead><tr>' +
      '<th>公司</th><th>联系人</th><th>品牌 / 拼单</th><th>城市</th><th class="num">进店礼预算</th><th>阶段</th><th>最近联系</th>' +
    '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="7" class="empty">还没有客户。点右上角「+ 新增客户」开始录。</td></tr>') +
    '</tbody></table></div>';

  document.querySelectorAll('#stageChips .chip').forEach((b) => {
    b.onclick = () => { VS.customers.stage = b.dataset.stage; render(); };
  });
  $('#fIndustry').onchange = (e) => { VS.customers.industry = e.target.value; render(); };
  $('#fBrand').onchange = (e) => { VS.customers.brand = e.target.value; render(); };
}

function stageTag(s) {
  const cls = s === '已成交' ? 'ok' : (s === '暂缓' ? 'warn' : (s === '待成交' ? 'hot' : ''));
  return '<span class="tag ' + cls + '">' + esc(s || '未填') + '</span>';
}

function openCustomer(id) {
  const c = byId(S.customers, id);
  if (!c) return;
  const same = S.customers.filter((x) => x.brand && x.brand === c.brand && x.id !== c.id);
  const fus = S.followups.filter((f) => Number(f.customer_id) === Number(c.id))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const supplierName = (pid) => {
    const p = byId(S.products, pid);
    if (!p) return '';
    const s = byId(S.suppliers, p.supplier_id);
    return s ? s.name : '';
  };

  const html =
    '<div class="field-grid">' +
      kv('联系人', c.contact) + kv('称呼', c.salutation) +
      kv('电话', c.phone) + kv('微信号', c.wechat) +
      kv('品牌', c.brand) + kv('行业', c.industry) +
      kv('城市', c.city) + kv('门店规模', c.size) +
      kv('进店礼预算', c.budget ? c.budget + ' 元' : '') +
      kv('来源', c.source) +
      kv('阶段', c.stage) + kv('最近联系', c.last_contact) +
    '</div>' +
    (c.note ? '<div class="kv"><i>备注</i><b>' + esc(c.note) + '</b></div>' : '') +

    '<div style="display:flex;gap:8px;margin:16px 0 4px;flex-wrap:wrap">' +
      '<button class="btn sm" data-act="edit-customer" data-id="' + c.id + '">编辑</button>' +
      '<button class="btn sm" data-act="followup" data-id="' + c.id + '">记跟进</button>' +
      '<button class="btn sm" data-act="quote-for" data-id="' + c.id + '">做报价</button>' +
      '<button class="btn sm danger" data-act="del-customer" data-id="' + c.id + '">删除</button>' +
    '</div>' +

    '<div class="section-title">跟进记录 <span class="muted small">' + fus.length + ' 条</span></div>' +
    (fus.length ? '<div class="flist">' + fus.map((f) =>
      '<div class="fitem"><div class="fdate">' + esc(f.date) + (f.result ? ' · ' + esc(f.result) : '') + '</div>' +
      '<div class="fcontent">' + esc(f.content) + '</div></div>').join('') + '</div>'
      : '<div class="muted small">还没有记录。每聊一次就记一条，下次开口就知道说到哪了。</div>') +

    '<div class="section-title">同品牌的其他客户 <span class="muted small">' + same.length + ' 家</span></div>' +
    (same.length
      ? '<div class="flist">' + same.map((x) =>
        '<div class="fitem"><div class="rowtitle">' + esc(x.company) + '</div>' +
        '<div class="rowsub">' + esc(x.city || '') + ' · ' + esc(x.size || '') + ' · ' + esc(x.stage || '') +
        (x.contact ? ' · ' + esc(x.contact) : '') + '</div></div>').join('') + '</div>'
      : '<div class="muted small">这个品牌暂时只有他一家。等有第二家就能拼单了。</div>');

  openDrawer(c.company || '客户详情', html);
}

function kv(k, v) {
  return '<div class="kv"><i>' + esc(k) + '</i><b>' + (v ? esc(v) : '<span class="muted">—</span>') + '</b></div>';
}

/* ================= 产品库 ================= */
function renderProducts() {
  const st = VS.products;
  const q = S.q;
  const supName = (id) => { const s = byId(S.suppliers, id); return s ? s.name : '未指定'; };

  let rows = S.skus.map((s) => {
    const p = byId(S.products, s.product_id) || {};
    return Object.assign({}, s, {
      pname: p.name || '未命名产品', unit: p.unit || '个',
      supplier_id: p.supplier_id || 0, category: p.category || '', pnote: p.note || '',
    });
  });

  if (st.supplier) rows = rows.filter((r) => String(r.supplier_id) === String(st.supplier));
  if (st.category) rows = rows.filter((r) => r.category === st.category);
  if (q) rows = rows.filter((r) => [r.pname, r.spec, r.category, supName(r.supplier_id), r.note]
    .join(' ').toLowerCase().includes(q));

  const cats = [...new Set(S.products.map((p) => p.category).filter(Boolean))].sort();
  const body = rows.map((r) =>
    '<tr data-act="edit-sku" data-id="' + r.id + '">' +
    '<td><div class="rowtitle">' + esc(r.pname) + '</div>' +
    '<div class="rowsub">' + esc(r.category || '') + (r.note ? ' · ' + esc(r.note) : '') + '</div></td>' +
    '<td>' + dash(r.spec) + '</td>' +
    '<td class="muted">' + esc(supName(r.supplier_id)) + '</td>' +
    '<td class="num">' + fmt(r.cost) + '</td>' +
    '<td class="num muted">' + (r.price300 ? fmt(r.price300) : '—') + '</td>' +
    '<td class="num muted">' + (r.price1000 ? fmt(r.price1000) : '—') + '</td>' +
    '<td class="num">' + (r.moq || 0) + '</td>' +
    '<td>' + (r.logo ? '<span class="tag">' + esc(r.logo) + '</span>' : '—') + '</td>' +
    '</tr>').join('');

  const cost = S.skus.reduce((a, s) => a + num(s.cost), 0);

  $('#view').innerHTML =
    '<div class="cards">' +
      '<div class="stat"><b>' + S.products.length + '</b><span>产品</span></div>' +
      '<div class="stat"><b>' + S.skus.length + '</b><span>规格 / SKU</span></div>' +
      '<div class="stat"><b>' + S.suppliers.length + '</b><span>厂家</span></div>' +
      '<div class="stat"><b>' + (S.skus.length ? fmt(cost / S.skus.length) : '0.00') + '</b><span>平均成本（元）</span></div>' +
    '</div>' +
    '<div class="toolbar">' +
      '<select id="fSupplier"><option value="">厂家不限</option>' +
        S.suppliers.map((s) => '<option value="' + s.id + '"' + (String(st.supplier) === String(s.id) ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
      '</select>' +
      '<select id="fCategory"><option value="">类目不限</option>' +
        cats.map((c) => '<option ' + (st.category === c ? 'selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
      '<span class="muted small">' + rows.length + ' 个规格</span>' +
    '</div>' +
    '<div class="table-wrap prod-list"><table><thead><tr>' +
      '<th>产品</th><th>规格</th><th>厂家</th><th class="num">成本</th><th class="num">300 套价</th>' +
      '<th class="num">1000 套价</th><th class="num">起订</th><th>印字</th>' +
    '</tr></thead><tbody>' +
      (body || '<tr><td colspan="8" class="empty">还没有产品。先加厂家，再加产品和规格。</td></tr>') +
    '</tbody></table></div>' +
    '<div class="hint" style="margin-top:10px">点任意一行可以改成本、起订量、印字方式。报价时系统会按数量自动取 300 / 1000 套的阶梯价。</div>';

  $('#fSupplier').onchange = (e) => { VS.products.supplier = e.target.value; render(); };
  $('#fCategory').onchange = (e) => { VS.products.category = e.target.value; render(); };
}

/* ================= 厂家 ================= */
function renderSuppliers() {
  const q = S.q;
  let list = S.suppliers.slice();
  if (q) list = list.filter((s) => [s.name, s.contact, s.region, s.category, s.note].join(' ').toLowerCase().includes(q));

  const pcount = (sid) => S.products.filter((p) => Number(p.supplier_id) === Number(sid)).length;

  const body = list.map((s) =>
    '<tr data-act="edit-supplier" data-id="' + s.id + '">' +
    '<td><div class="rowtitle">' + esc(s.name) + '</div>' +
    (s.note ? '<div class="rowsub">' + esc(s.note) + '</div>' : '') + '</td>' +
    '<td>' + dash(s.contact) + '</td>' +
    '<td class="muted">' + dash(s.phone) + '</td>' +
    '<td>' + dash(s.region) + '</td>' +
    '<td>' + (s.category ? '<span class="tag">' + esc(s.category) + '</span>' : '—') + '</td>' +
    '<td class="num">' + (s.moq || 0) + '</td>' +
    '<td class="num">' + (s.lead_days || 0) + ' 天</td>' +
    '<td class="num">' + pcount(s.id) + '</td>' +
    '</tr>').join('');

  $('#view').innerHTML =
    '<div class="toolbar"><span class="muted small">' + list.length + ' 家厂家　·　点一行编辑，「起订量」是这个厂的默认门槛</span></div>' +
    '<div class="table-wrap"><table><thead><tr>' +
      '<th>厂家</th><th>联系人</th><th>电话</th><th>产地</th><th>类目</th>' +
      '<th class="num">起订量</th><th class="num">交期</th><th class="num">产品数</th>' +
    '</tr></thead><tbody>' +
      (body || '<tr><td colspan="8" class="empty">还没有厂家。点右上角新增。</td></tr>') +
    '</tbody></table></div>';
}

/* ================= 报价 ================= */
function renderQuote() {
  const Q = VS.quote;
  const cust = byId(S.customers, Q.customerId);
  const skuRows = S.skus.map((s) => {
    const p = byId(S.products, s.product_id) || {};
    return Object.assign({}, s, { pname: p.name || '', unit: p.unit || '个', supplier_id: p.supplier_id });
  });

  const itemsHtml = Q.items.length ? Q.items.map((it, i) => {
    const d = Q.result ? (Q.result.detail.find((x) => Number(x.sku_id) === Number(it.sku_id)) || null) : null;
    const warn = d && d.below_moq ? ' <span class="tag warn">低于起订量</span>' : '';
    return '<div class="qitem">' +
      '<div><div class="qname">' + esc(it.name) + (it.spec ? ' · ' + esc(it.spec) : '') + warn + '</div>' +
      '<div class="rowsub">成本 ' + fmt(d ? d.unit_cost : it.cost) + ' 元 / ' + esc(it.unit) + '</div></div>' +
      '<input type="number" min="1" step="10" value="' + it.qty + '" data-qty="' + i + '">' +
      '<div class="qsum">' + fmt(d ? d.price : 0) + '<button class="icon-btn" data-rm="' + i + '" title="移除">×</button></div>' +
      '</div>';
  }).join('') : '<div class="muted small" style="padding:10px 0">还没加商品。上面搜产品名或规格。</div>';

  $('#view').innerHTML =
    '<div class="quote-grid">' +
      '<div>' +
        '<div class="panel" style="margin-bottom:14px">' +
          '<h4>1 · 选客户</h4>' +
          '<div class="picker">' +
            '<input id="custPick" placeholder="' + (cust ? esc(cust.company) : '搜公司名 / 联系人 / 品牌…') + '" autocomplete="off">' +
            '<div class="picker-list" id="custList"></div>' +
          '</div>' +
          (cust ? '<div class="small muted">' + esc(cust.company) + '　·　' + esc(cust.brand || '无品牌') +
            '　·　进店礼预算 ' + esc(cust.budget || '-') + ' 元　·　' + esc(cust.stage) + '</div>' : '') +
        '</div>' +
        '<div class="panel">' +
          '<h4>2 · 加商品</h4>' +
          '<div class="picker">' +
            '<input id="skuPick" placeholder="搜产品名、规格、厂家…" autocomplete="off">' +
            '<div class="picker-list" id="skuList"></div>' +
          '</div>' +
          '<div id="qitems">' + itemsHtml + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="panel">' +
        '<h4>3 · 算价</h4>' +
        '<div class="fld" style="margin-bottom:12px"><label>加价率（%）</label>' +
          '<input id="markup" type="number" step="1" value="' + (Q.markup * 100) + '"></div>' +
        '<div style="border-top:1px solid var(--line2);padding-top:12px">' +
          '<div class="small muted">成本合计</div>' +
          '<div class="big-num" style="font-size:19px">¥' + fmt(Q.result ? Q.result.total_cost : 0) + '</div>' +
          '<div class="small muted" style="margin-top:10px">报价合计</div>' +
          '<div class="big-num">¥' + fmt(Q.result ? Q.result.total_price : 0) + '</div>' +
          '<div class="small muted" style="margin-top:10px">毛利</div>' +
          '<div class="big-num" style="font-size:19px;color:var(--ok)">¥' + fmt(Q.result ? Q.result.gross : 0) +
            ' <span class="small muted">(' + (Q.result ? (Q.result.margin * 100).toFixed(1) : '0.0') + '%)</span></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
          '<button class="btn primary" id="copyQuote">复制报价文字</button>' +
          '<button class="btn" id="saveQuote">存成报价单</button>' +
          '<button class="btn ghost" id="clearQuote">清空</button>' +
        '</div>' +
        '<div class="hint" style="margin-top:10px">数量到 300 / 1000 会自动取阶梯价。运费不含在里面。</div>' +
      '</div>' +
    '</div>';

  // 客户搜索
  const custPick = $('#custPick');
  const custList = $('#custList');
  custPick.oninput = () => {
    const v = custPick.value.trim().toLowerCase();
    if (!v) { custList.classList.remove('on'); return; }
    const hits = S.customers.filter((c) => [c.company, c.contact, c.brand].join(' ').toLowerCase().includes(v)).slice(0, 8);
    custList.innerHTML = hits.map((c) =>
      '<div class="picker-item" data-cid="' + c.id + '">' + esc(c.company) +
      '<div class="pi-sub">' + esc(c.brand || '无品牌') + ' · ' + esc(c.city || '') + ' · ' + esc(c.contact || '') + '</div></div>'
    ).join('') || '<div class="picker-item muted">没找到</div>';
    custList.classList.add('on');
  };
  custList.onclick = (e) => {
    const el = e.target.closest('[data-cid]');
    if (!el) return;
    VS.quote.customerId = Number(el.dataset.cid);
    renderQuote();
  };

  // 商品搜索
  const skuPick = $('#skuPick');
  const skuList = $('#skuList');
  skuPick.oninput = () => {
    const v = skuPick.value.trim().toLowerCase();
    if (!v) { skuList.classList.remove('on'); return; }
    const hits = skuRows.filter((s) => [s.pname, s.spec, s.note].join(' ').toLowerCase().includes(v)).slice(0, 10);
    skuList.innerHTML = hits.map((s) =>
      '<div class="picker-item" data-sid="' + s.id + '">' + esc(s.pname) + (s.spec ? ' · ' + esc(s.spec) : '') +
      '<div class="pi-sub">成本 ' + fmt(s.cost) + ' 元 · 起订 ' + (s.moq || 0) + ' · ' + esc(s.logo || '') + '</div></div>'
    ).join('') || '<div class="picker-item muted">没找到</div>';
    skuList.classList.add('on');
  };
  skuList.onclick = (e) => {
    const el = e.target.closest('[data-sid]');
    if (!el) return;
    const s = byId(skuRows, el.dataset.sid);
    const exist = Q.items.find((x) => Number(x.sku_id) === Number(s.id));
    if (exist) exist.qty += (s.moq || 100);
    else Q.items.push({ sku_id: s.id, qty: s.moq || 100, name: s.pname, spec: s.spec, unit: s.unit, cost: s.cost });
    skuPick.value = '';
    skuList.classList.remove('on');
    recalc();
  };

  document.querySelectorAll('[data-rm]').forEach((b) => {
    b.onclick = () => { VS.quote.items.splice(Number(b.dataset.rm), 1); recalc(); };
  });
  document.querySelectorAll('[data-qty]').forEach((inp) => {
    inp.onchange = () => { VS.quote.items[Number(inp.dataset.qty)].qty = Math.max(1, Number(inp.value) || 1); recalc(); };
  });

  $('#markup').onchange = (e) => {
    VS.quote.markup = Math.max(0, Number(e.target.value) || 0) / 100;
    recalc();
  };

  $('#copyQuote').onclick = () => {
    if (!Q.items.length) return toast('先加商品');
    const lines = [];
    const title = cust ? cust.company : '客户';
    lines.push('【' + title + ' · 礼品报价】');
    if (Q.result) {
      Q.result.detail.forEach((d) => {
        lines.push('· ' + d.name + (d.spec ? '（' + d.spec + '）' : '') + ' × ' + d.qty + ' = ¥' + fmt(d.price) + '（单价 ¥' + fmt(d.unit_price) + '）');
      });
      lines.push('');
      lines.push('合计：¥' + fmt(Q.result.total_price));
    }
    lines.push('运费：物流到付，另算');
    lines.push('交期：下单后 ' + (Q.result && Q.result.detail.length ? Math.max(...Q.result.detail.map((d) => d.lead_days || 0)) : '') + ' 天左右');
    copyText(lines.join('\n'));
  };

  $('#saveQuote').onclick = async () => {
    if (!Q.items.length || !Q.result) return toast('先加商品');
    try {
      await saveQuoteAsRecord(Q.result, cust, Q.markup);
      OS.tab = 'quotes';
      location.hash = '#orders';
      toast('已存成报价单');
    } catch (err) {
      toast('保存失败：' + err.message);
    }
  };

  $('#clearQuote').onclick = () => { VS.quote.items = []; VS.quote.result = null; renderQuote(); };
}

let recalcTimer = null;
function computeQuote(items, markup) {
  const detail = [];
  let total_cost = 0;
  let total_price = 0;
  items.forEach((it) => {
    const s = byId(S.skus, it.sku_id);
    if (!s) return;
    const p = byId(S.products, s.product_id) || {};
    let unit_cost = s.cost;
    if (it.qty >= 1000 && s.price1000 > 0) unit_cost = s.price1000;
    else if (it.qty >= 300 && s.price300 > 0) unit_cost = s.price300;
    const unit_price = Math.round(unit_cost * (1 + markup) * 100) / 100;
    const c = Math.round(unit_cost * it.qty * 100) / 100;
    const pr = Math.round(unit_price * it.qty * 100) / 100;
    total_cost += c;
    total_price += pr;
    detail.push({
      sku_id: Number(s.id), name: p.name || '', spec: s.spec || '', unit: p.unit || '个',
      supplier: '', qty: it.qty, moq: s.moq, unit_cost: unit_cost, unit_price: unit_price,
      cost: c, price: pr, logo: s.logo || '', lead_days: s.lead_days || 0,
      below_moq: it.qty < (s.moq || 0),
    });
  });
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    detail: detail,
    total_cost: r2(total_cost),
    total_price: r2(total_price),
    gross: r2(total_price - total_cost),
    margin: total_price ? (total_price - total_cost) / total_price : 0,
  };
}

function recalc() {
  const Q = VS.quote;
  clearTimeout(recalcTimer);
  recalcTimer = setTimeout(() => {
    Q.result = computeQuote(Q.items, Q.markup);
    renderQuote();
  }, 60);
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportBackup() {
  const data = {
    exported_at: new Date().toISOString(),
    version: 1,
    suppliers: S.suppliers, products: S.products, skus: S.skus,
    customers: S.customers, followups: S.followups, quotes: S.quotes,
  };
  download('礼品管家备份-' + new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify(data, null, 2), 'application/json');
  toast('备份已下载');
}

function exportCsv() {
  const head = ['编号', '公司名', '联系人', '称呼', '电话', '微信号', '品牌', '行业', '城市',
    '门店规模', '进店礼预算', '跟进阶段', '来源', '最近联系', '备注'];
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [head.join(',')];
  S.customers.forEach((c) => {
    lines.push([c.id, c.company, c.contact, c.salutation, c.phone, c.wechat, c.brand,
      c.industry, c.city, c.size, c.budget, c.stage, c.source, c.last_contact, c.note]
      .map(q).join(','));
  });
  download('客户名单-' + new Date().toISOString().slice(0, 10) + '.csv',
    '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('已导出');
}

function copyText(txt) {
  navigator.clipboard.writeText(txt).then(
    () => toast('已复制，去微信粘贴'),
    () => {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); toast('已复制');
    }
  );
}

/* ================= 数据 ================= */
function renderData() {
  $('#view').innerHTML =
    '<div class="cards">' +
      '<div class="stat"><b>' + S.customers.length + '</b><span>客户</span></div>' +
      '<div class="stat"><b>' + S.skus.length + '</b><span>SKU</span></div>' +
      '<div class="stat"><b>' + S.suppliers.length + '</b><span>厂家</span></div>' +
      '<div class="stat"><b>' + S.followups.length + '</b><span>跟进记录</span></div>' +
    '</div>' +

    '<div class="panel" style="max-width:820px;margin-bottom:14px">' +
      '<h4>每天怎么用（10 分钟）</h4>' +
      '<ol class="small" style="padding-left:20px;line-height:2;margin:0">' +
        '<li>打开「客户」，看顶上「还在跟」那一栏，逐个点进去看一眼上次聊到哪。</li>' +
        '<li>聊完马上点「记跟进」写一句，系统自动更新最近联系日期。</li>' +
        '<li>客户要报价，点「做报价」→ 加商品 → 改加价率 → 复制文字发微信。</li>' +
      '</ol>' +
    '</div>' +

    '<div class="panel" style="max-width:820px;margin-bottom:14px">' +
      '<h4>产品是怎么记的（三级）</h4>' +
      '<p class="small muted" style="margin-top:0">厂家 → 产品 → 规格。价格记在「规格」上，因为同一个保温杯，500ml 和 350ml 成本不一样。</p>' +
      '<ul class="small muted" style="padding-left:20px;line-height:1.9;margin:0">' +
        '<li>先在「厂家」里建厂，填默认起订量和交期。</li>' +
        '<li>再在「产品库」里点「+ 新增产品」，选它属于哪个厂。</li>' +
        '<li>最后点「+ 新增规格」，填成本、300 套价、1000 套价、起订量、印字方式。</li>' +
        '<li>报价时数量到 300 / 1000 会自动用阶梯价，不用自己算。</li>' +
      '</ul>' +
    '</div>' +

    '<div class="panel" style="max-width:820px;margin-bottom:14px">' +
      '<h4>拼单怎么找</h4>' +
      '<p class="small muted" style="margin-top:0">客户页的「品牌 / 拼单」那一列，绿色「可拼单 N」就是这个品牌还有几家在手上。' +
      '点开任一客户，抽屉底下会列出同品牌的其他客户和他们的城市、规模。</p>' +
    '</div>' +

    '<div class="panel" style="max-width:820px">' +
      '<h4>备份与导出</h4>' +
      '<p class="small muted" style="margin-top:0">数据存在云端，手机和电脑打开是同一份。' +
      '但 <b>每个月备份一次</b>，下载下来丢网盘或发自己微信收藏，双保险。</p>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:12px">' +
        '<button class="btn primary" data-act="backup">下载数据库备份</button>' +
        '<button class="btn" data-act="csv">导出客户名单（CSV）</button>' +
      '</div>' +
      '<div class="section-title">说明</div>' +
      '<ul class="small muted" style="padding-left:18px;line-height:1.9;margin:0">' +
        '<li>云端数据库是 Supabase 里 <code>gift_</code> 开头的 6 张表，只有登录后才能读写。</li>' +
        '<li>「下载数据库备份」是一个 JSON 文件，包含全部客户、厂家、产品和报价。</li>' +
        '<li>CSV 可以用 Excel 打开，发给别人不怕格式乱。</li>' +
        '<li>换手机、换电脑，同一个账号登进去就是同一份数据。</li>' +
      '</ul>' +
      '<div class="section-title">谁能看到</div>' +
      '<p class="small muted" style="margin-top:0">现在不设密码，<b>谁拿到网址谁就能进</b>。' +
      '所以别把这个网址发到群里、朋友圈，也别做成公开的二维码。' +
      '以后要加密码、或给员工单独开号，说一声就行。</p>' +
      '<div class="section-title">示例数据</div>' +
      '<p class="small muted">第一次打开时放了几条示例（3 个厂、12 个品、5 个客户），方便看格式。真正开始用之前建议清掉。</p>' +
      '<button class="btn danger" data-act="wipe" style="margin-top:6px">清空所有示例数据</button>' +
    '</div>';
}

/* ================= 事件委托 ================= */
const FORMS = {
  'add-customer': () => openForm('新增客户', customerFields(), {}, (b) => save('customers', 0, b)),
  'add-supplier': () => openForm('新增厂家', supplierFields(), {}, (b) => save('suppliers', 0, b)),
  'add-product': () => openForm('新增产品', productFields(), {}, (b) => save('products', 0, b)),
  'add-sku': () => openForm('新增规格 / SKU', skuFields(), {}, (b) => save('skus', 0, b)),
};

function customerFields() {
  return [
    { key: 'company', label: '公司名', full: true, ph: '城市 + 店名 + 品牌，例如：深圳龙华欧派旗舰店' },
    { key: 'contact', label: '联系人' }, { key: 'salutation', label: '称呼', ph: '王总' },
    { key: 'phone', label: '电话' }, { key: 'wechat', label: '微信号' },
    { key: 'brand', label: '品牌', hint: '这一列最关键，拼单靠它' },
    { key: 'industry', label: '行业', type: 'select', options: [''].concat(INDUSTRIES) },
    { key: 'city', label: '城市' },
    { key: 'size', label: '门店规模', type: 'select', options: [''].concat(SIZES) },
    { key: 'budget', label: '进店礼预算（元）', type: 'number' },
    { key: 'stage', label: '阶段', type: 'select', options: STAGES },
    { key: 'source', label: '来源', type: 'select', options: [''].concat(SOURCES) },
    { key: 'last_contact', label: '最近联系', ph: '2026-10-20' },
    { key: 'note', label: '备注', type: 'textarea', full: true },
  ];
}
function supplierFields() {
  return [
    { key: 'name', label: '厂家名称', full: true },
    { key: 'contact', label: '联系人' }, { key: 'phone', label: '电话' },
    { key: 'wechat', label: '微信号' }, { key: 'region', label: '产地', ph: '义乌 / 永康' },
    { key: 'category', label: '主营类目' }, { key: 'moq', label: '默认起订量', type: 'number' },
    { key: 'lead_days', label: '交期（天）', type: 'number' },
    { key: 'shipping', label: '发货方式', ph: '物流到付 / 快递' },
    { key: 'note', label: '备注', type: 'textarea', full: true },
  ];
}
function productFields() {
  return [
    { key: 'name', label: '产品名', full: true, ph: '不锈钢保温杯' },
    { key: 'supplier_id', label: '厂家', type: 'select', options: [{ v: '', t: '未指定' }].concat(S.suppliers.map((s) => ({ v: s.id, t: s.name }))) },
    { key: 'category', label: '类目', ph: '杯子 / 小家电' },
    { key: 'unit', label: '单位', ph: '个 / 套 / 盒', def: '个' },
    { key: 'note', label: '说明', type: 'textarea', full: true },
  ];
}
function skuFields() {
  return [
    { key: 'product_id', label: '属于哪个产品', type: 'select', full: true,
      options: S.products.map((p) => ({ v: p.id, t: p.name })) },
    { key: 'spec', label: '规格 / 颜色 / 容量', ph: '500ml 银色' },
    { key: 'cost', label: '成本价（元）', type: 'number' },
    { key: 'price300', label: '300 套价（元）', type: 'number', hint: '不填就按成本价算' },
    { key: 'price1000', label: '1000 套价（元）', type: 'number' },
    { key: 'moq', label: '起订量', type: 'number' },
    { key: 'logo', label: '印字方式', ph: '丝印 / 激光 / 烫金' },
    { key: 'lead_days', label: '交期（天）', type: 'number' },
    { key: 'note', label: '备注', type: 'textarea', full: true },
  ];
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'open-customer') return openCustomer(id);
  if (act === 'add-customer') return FORMS['add-customer']();
  if (act === 'add-supplier') return FORMS['add-supplier']();
  if (act === 'add-product') return FORMS['add-product']();
  if (act === 'add-sku') {
    if (!S.products.length) return toast('先建产品，再建规格');
    return FORMS['add-sku']();
  }

  if (act === 'edit-customer') {
    const c = byId(S.customers, id);
    return openForm('编辑客户', customerFields(), c, (b) => save('customers', id, b));
  }
  if (act === 'edit-supplier') {
    const s = byId(S.suppliers, id);
    return openForm('编辑厂家', supplierFields(), s, (b) => save('suppliers', id, b));
  }
  if (act === 'edit-product') {
    const p = byId(S.products, id);
    return openForm('编辑产品', productFields(), p, (b) => save('products', id, b));
  }
  if (act === 'edit-sku') {
    const s = byId(S.skus, id);
    return openForm('编辑规格', skuFields(), s, (b) => save('skus', id, b));
  }
  if (act === 'del-customer') return del('customers', id, (byId(S.customers, id) || {}).company);
  if (act === 'del-sku') return del('skus', id, '这个规格');
  if (act === 'del-supplier') return del('suppliers', id, (byId(S.suppliers, id) || {}).name);

  if (act === 'followup') {
    const c = byId(S.customers, id);
    return openForm('记一条跟进 · ' + (c ? c.company : ''), [
      { key: 'date', label: '日期', def: new Date().toISOString().slice(0, 10) },
      { key: 'result', label: '结果', type: 'select', options: ['聊了', '已报价', '已发方案', '已成交', '没接', '再等等'] },
      { key: 'content', label: '聊了什么', type: 'textarea', full: true, ph: '他要 5 块以内的进店礼，100 套，说周五给答复' },
    ], {}, async (b) => {
      await rest('followups', '', {
        method: 'POST',
        body: sanitize({ customer_id: Number(id), date: b.date, result: b.result, content: b.content }),
      });
      await rest('customers', '?id=eq.' + id, { method: 'PATCH', body: { last_contact: b.date } });
      await loadAll();
      openCustomer(id);
      render();
      toast('已记录');
    });
  }

  if (act === 'quote-for') {
    VS.quote.customerId = Number(id);
    closeDrawer();
    location.hash = '#quote';
    return;
  }
  if (act === 'go-customers') {
    location.hash = '#customers';
    return;
  }
  if (act === 'go-quote') {
    location.hash = '#quote';
    return;
  }

  if (act === 'logout') {
    if (!confirm('退出登录？')) return;
    storeSession(null);
    location.reload();
    return;
  }
  if (act === 'backup') return exportBackup();
  if (act === 'csv') return exportCsv();
  if (act === 'wipe') {
    if (!confirm('清掉所有示例厂家、产品、客户？你自己的数据不会被删。')) return;
    try {
      for (const t of ['followups', 'quotes', 'skus', 'products', 'customers', 'suppliers']) {
        await rest(t, '?demo=eq.true', { method: 'DELETE', prefer: 'return=minimal' });
      }
      await loadAll();
      render();
      toast('示例已清空');
    } catch (e) {
      toast('清空失败：' + e.message);
    }
  }
});

/* ---------------- 启动 ---------------- */
function showLogin(msg) {
  const box = $('#login');
  if (box) box.classList.add('on');
  if (msg) {
    const e = $('#loginErr');
    if (e) e.textContent = msg;
  }
  const f = $('#loginForm');
  if (f) {
    const target = SESSION ? $('#loginPass') : $('#loginEmail');
    if (target) setTimeout(() => target.focus(), 80);
  }
}

// 不弹登录：页面自己用内部账号进（只想少一步操作，不是真安全，见「数据」页说明）
const AUTO_LOGIN = { email: 'lipin@gift.local', password: 'lipin888' };

function hideBoot() {
  const b = $('#boot');
  if (b) b.classList.remove('on');
}

function afterLogin() {
  hideBoot();
  const lg = $('#login');
  if (lg) lg.classList.remove('on');
  const tip = $('#savedTip');
  if (tip) tip.textContent = '数据存在云端';
  applyHash();
}

async function doLogin(e) {
  e.preventDefault();
  const btn = $('#loginBtn');
  if (!btn) return;
  $('#loginErr').textContent = '';
  btn.disabled = true;
  btn.textContent = '登录中…';
  try {
    await login(normalizeAccount($('#loginEmail').value), $('#loginPass').value);
    await loadAll();
    afterLogin();
  } catch (err) {
    $('#loginErr').textContent = err.message || '登录失败';
  } finally {
    btn.disabled = false;
    btn.textContent = '登录';
  }
}

async function boot() {
  loadSession();
  const form = $('#loginForm');
  if (form) form.addEventListener('submit', doLogin);
  if (SESSION && (SESSION.account || SESSION.email)) {
    $('#loginEmail').value = SESSION.account || SESSION.email;
  }

  // 1) 上次登录还没过期，直接用
  if (SESSION) {
    try {
      await loadAll();
      afterLogin();
      return;
    } catch (err) {
      console.warn(err);
      storeSession(null);
    }
  }

  // 2) 自动进
  try {
    await login(AUTO_LOGIN.email, AUTO_LOGIN.password);
    await loadAll();
    afterLogin();
    return;
  } catch (err) {
    console.warn('自动进入失败', err);
  }

  // 3) 兜底：手动登录
  hideBoot();
  showLogin('自动进入失败，先手动登录一次');
}

boot();
