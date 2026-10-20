/* 导入老客户 —— 从 Excel / 微信里复制出来，一次搬进来 */

const IMPORT_FIELDS = [
  { key: 'company', names: ['公司名', '公司', '客户名称', '客户', '店名', '名称'] },
  { key: 'contact', names: ['联系人', '姓名', '老板', '负责人'] },
  { key: 'salutation', names: ['称呼'] },
  { key: 'phone', names: ['电话', '手机', '手机号', '联系电话'] },
  { key: 'wechat', names: ['微信', '微信号'] },
  { key: 'brand', names: ['品牌'] },
  { key: 'industry', names: ['行业'] },
  { key: 'city', names: ['城市', '地区'] },
  { key: 'size', names: ['门店规模', '规模'] },
  { key: 'budget', names: ['进店礼预算', '预算', '单价'] },
  { key: 'stage', names: ['阶段', '下一步', '跟进阶段'] },
  { key: 'source', names: ['来源'] },
  { key: 'last_contact', names: ['最近联系', '最近联系日期'] },
  { key: 'note', names: ['备注', '说明'] },
];

const PRODUCT_FIELDS = [
  { key: 'supplier', names: ['厂家', '供应商', '工厂', '货源'] },
  { key: 'product', names: ['产品', '产品名', '品名', '名称'] },
  { key: 'category', names: ['类目', '分类', '品类'] },
  { key: 'unit', names: ['单位'] },
  { key: 'spec', names: ['规格', '尺寸', '型号'] },
  { key: 'cost', names: ['成本', '成本价', '进价'] },
  { key: 'price300', names: ['300套价', '300价'] },
  { key: 'price1000', names: ['1000套价', '1000价'] },
  { key: 'moq', names: ['起订', '起订量'] },
  { key: 'logo', names: ['印字', '印字方式', '工艺'] },
  { key: 'lead_days', names: ['交期'] },
  { key: 'note', names: ['备注'] },
];

window.IMP = { mode: 'customer', rows: [], ready: [] };

function parseTable(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const tabN = (lines[0].match(/\t/g) || []).length;
  const commaN = (lines[0].match(/,/g) || []).length;
  const delim = tabN >= commaN ? '\t' : ',';

  const splitLine = (line) => {
    if (delim === '\t') return line.split('\t');
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  return lines.map((l) => splitLine(l).map((c) => String(c == null ? '' : c).trim()));
}

function mapHeader(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const clean = String(h || '').replace(/\s/g, '');
    IMPORT_FIELDS.forEach((f) => {
      if (map[f.key] !== undefined) return;
      if (f.names.some((n) => clean === n || clean.indexOf(n) >= 0)) map[f.key] = idx;
    });
  });
  return map;
}

function normalizeRow(obj) {
  const str = (v) => String(v == null ? '' : v).trim();
  const body = {};
  IMPORT_FIELDS.forEach((f) => {
    const v = str(obj[f.key]);
    if (!v) return;
    if (f.key === 'budget') {
      const n = Number(v.replace(/[^\d.]/g, ''));
      if (!isNaN(n) && n > 0) body.budget = n;
      return;
    }
    if (f.key === 'last_contact') {
      const m = v.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
      body.last_contact = m
        ? m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0')
        : v;
      return;
    }
    body[f.key] = v;
  });
  return body;
}

function scanImport(text) {
  const table = parseTable(text);
  if (!table.length) return { error: '没读到内容' };
  const header = table[0];
  const map = mapHeader(header);
  if (map.company === undefined) {
    return { error: '第一行得是表头，而且要有「公司名」这一列。现在的第一行是：' + header.join(' | ').slice(0, 60) };
  }
  const rows = table.slice(1).map((r) => {
    const o = {};
    Object.keys(map).forEach((k) => { o[k] = r[map[k]]; });
    return o;
  }).filter((o) => String(o.company || '').trim());

  const existing = {};
  (S.customers || []).forEach((c) => { existing[String(c.company || '').trim().toLowerCase()] = 1; });

  const seen = {};
  const ready = [];
  const dup = [];
  const bad = [];
  rows.forEach((o) => {
    const body = normalizeRow(o);
    const key = String(body.company || '').trim().toLowerCase();
    if (!key) { bad.push(o); return; }
    if (existing[key] || seen[key]) { dup.push(body); return; }
    seen[key] = 1;
    ready.push(body);
  });
  return { total: rows.length, ready: ready, dup: dup, bad: bad, map: map, header: header };
}

function mapProductHeader(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    const clean = String(h || '').replace(/\s/g, '');
    PRODUCT_FIELDS.forEach((f) => {
      if (map[f.key] !== undefined) return;
      if (f.names.some((n) => clean === n || clean.indexOf(n) >= 0)) map[f.key] = idx;
    });
  });
  return map;
}

function scanImportProducts(text) {
  const table = parseTable(text);
  if (!table.length) return { error: '没读到内容' };
  const header = table[0];
  const map = mapProductHeader(header);
  if (map.product === undefined) {
    return { error: '第一行得是表头，而且要有「产品名」这一列。现在的第一行是：' + header.join(' | ').slice(0, 60) };
  }
  const raw = table.slice(1).map((r) => {
    const o = {};
    Object.keys(map).forEach((k) => { o[k] = r[map[k]]; });
    return o;
  }).filter((o) => String(o.product || '').trim());

  const num = (v) => {
    const n = Number(String(v || '').replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const supId = {};
  (S.suppliers || []).forEach((x) => { supId[String(x.name).trim().toLowerCase()] = x.id; });
  const prodKey = (sup, name) => String(sup || '').trim().toLowerCase() + '||' + String(name || '').trim().toLowerCase();
  const prodMap = {};
  (S.products || []).forEach((p) => {
    const sn = ((byId(S.suppliers, p.supplier_id) || {}).name) || '';
    prodMap[prodKey(sn, p.name)] = p.id;
  });
  const skuKey = (pid, spec) => String(pid) + '||' + String(spec || '').trim().toLowerCase();
  const skuMap = {};
  (S.skus || []).forEach((k) => { skuMap[skuKey(k.product_id, k.spec)] = 1; });

  const ready = [];
  const dup = [];
  const newSup = {};
  const newProd = {};
  const seen = {};

  raw.forEach((o) => {
    const sup = String(o.supplier || '').trim();
    const prod = String(o.product || '').trim();
    const spec = String(o.spec || '').trim();
    const pk = prodKey(sup, prod);
    const pid = prodMap[pk];
    const key = pk + '|' + spec.toLowerCase();
    if (pid && skuMap[skuKey(pid, spec)]) { dup.push(o); return; }
    if (seen[key]) { dup.push(o); return; }
    seen[key] = 1;
    if (sup && !supId[sup.toLowerCase()]) newSup[sup] = 1;
    if (!pid) newProd[sup + ' / ' + prod] = 1;
    ready.push({
      supplier: sup, product: prod, category: String(o.category || '').trim(),
      unit: String(o.unit || '').trim() || '个',
      spec: spec, cost: num(o.cost), price300: num(o.price300),
      price1000: num(o.price1000), moq: num(o.moq),
      logo: String(o.logo || '').trim(), lead_days: num(o.lead_days),
      note: String(o.note || '').trim(),
    });
  });

  return {
    total: raw.length, ready: ready, dup: dup, bad: [],
    newSuppliers: Object.keys(newSup), newProducts: Object.keys(newProd),
    map: map, header: header,
  };
}

function importProductTemplateCsv() {
  const head = PRODUCT_FIELDS.map((f) => f.names[0]).join(',');
  const sample = '义乌昌达礼品,不锈钢保温杯,杯子,个,500ml,12.5,11.8,11,300,激光,10,'
    .replace(/,$/, '');
  download('产品导入模板.csv', '\ufeff' + head + '\n' + sample + '\n', 'text/csv;charset=utf-8');
}

function importTemplateCsv() {
  const head = IMPORT_FIELDS.map((f) => f.names[0]).join(',');
  const sample = ['深圳龙华欧派旗舰店', '王志强', '王总', '13800000001', 'wx_oupai',
    '欧派', '建材家居', '深圳', '中型', '5', '待发方案', '微信老客', '2026-09-18', '之前问过双十一']
    .join(',');
  download('客户导入模板.csv', '\ufeff' + head + '\n' + sample + '\n', 'text/csv;charset=utf-8');
}

function importTabs() {
  const m = (window.IMP || {}).mode || 'customer';
  return '<div class="imp-mode"><div class="seg">' +
    '<button data-imode="customer" class="' + (m === 'customer' ? 'on' : '') + '">导入客户</button>' +
    '<button data-imode="product" class="' + (m === 'product' ? 'on' : '') + '">导入产品</button>' +
  '</div></div>';
}

async function doImportProducts(rows) {
  const norm = (x) => String(x || '').trim().toLowerCase();

  // 1) 缺的厂家先建
  const haveSup = {};
  (S.suppliers || []).forEach((x) => { haveSup[norm(x.name)] = x.id; });
  const needSup = [];
  rows.forEach((r) => {
    if (r.supplier && !haveSup[norm(r.supplier)] && needSup.indexOf(r.supplier) < 0) needSup.push(r.supplier);
  });
  if (needSup.length) {
    await rest('suppliers', '', { method: 'POST', body: needSup.map((n) => ({ name: n })), prefer: 'return=minimal' });
    await loadAll();
  }

  // 2) 缺的产品再建
  const supId = {};
  (S.suppliers || []).forEach((x) => { supId[norm(x.name)] = x.id; });
  const pkey = (sup, name) => norm(sup) + '||' + norm(name);
  const haveProd = {};
  (S.products || []).forEach((p) => {
    const sn = ((byId(S.suppliers, p.supplier_id) || {}).name) || '';
    haveProd[pkey(sn, p.name)] = p.id;
  });
  const needProd = [];
  rows.forEach((r) => {
    const pk = pkey(r.supplier, r.product);
    if (!haveProd[pk] && !needProd.some((x) => x._k === pk)) {
      needProd.push({ _k: pk, supplier_id: supId[norm(r.supplier)] || null, name: r.product,
        category: r.category || '', unit: r.unit || '个' });
    }
  });
  if (needProd.length) {
    await rest('products', '', {
      method: 'POST',
      body: needProd.map((x) => ({ supplier_id: x.supplier_id, name: x.name, category: x.category, unit: x.unit })),
      prefer: 'return=minimal',
    });
    await loadAll();
  }

  // 3) 规格整批写
  const prodId = {};
  (S.products || []).forEach((p) => {
    const sn = ((byId(S.suppliers, p.supplier_id) || {}).name) || '';
    prodId[pkey(sn, p.name)] = p.id;
  });
  const skuBody = rows.map((r) => ({
    product_id: prodId[pkey(r.supplier, r.product)] || null,
    spec: r.spec, cost: r.cost, price300: r.price300, price1000: r.price1000,
    moq: r.moq, logo: r.logo, lead_days: r.lead_days, note: r.note || '',
  })).filter((x) => x.product_id);
  let ok = 0;
  for (let i = 0; i < skuBody.length; i += 50) {
    const chunk = skuBody.slice(i, i + 50);
    await rest('skus', '', { method: 'POST', body: chunk, prefer: 'return=minimal' });
    ok += chunk.length;
  }
  await loadAll();
  return ok;
}

function renderImport() {
  const r = window.IMP;
  const mode = r.mode || 'customer';
  const isProd = mode === 'product';
  const totalRows = Number(r.total) || 0;

  const stat = totalRows
    ? '<div class="cards" style="grid-template-columns:repeat(4,1fr);margin-top:12px">' +
        '<div class="stat"><b>' + totalRows + '</b><span>读到几行</span></div>' +
        '<div class="stat ok"><b>' + (r.ready || []).length + '</b><span>可以导入</span></div>' +
        '<div class="stat warn"><b>' + (r.dup || []).length + '</b><span>重复跳过</span></div>' +
        (isProd
          ? '<div class="stat"><b>' + ((r.newSuppliers || []).length + (r.newProducts || []).length) + '</b><span>要新建的厂家/产品</span></div>'
          : '<div class="stat"><b>' + (r.bad || []).length + '</b><span>缺公司名</span></div>') +
      '</div>'
    : '';

  const head = isProd
    ? '<tr><th>厂家</th><th>产品</th><th>规格</th><th class="num">成本</th><th class="num">起订</th><th>印字</th></tr>'
    : '<tr><th>公司名</th><th>联系人</th><th>品牌</th><th>城市</th><th>电话</th><th>阶段</th></tr>';

  const rows = (r.ready || []).slice(0, 20).map((x) => (isProd
    ? '<tr><td>' + esc(x.supplier || '—') + '</td><td>' + esc(x.product) + '</td>' +
      '<td>' + esc(x.spec || '') + '</td><td class="num">' + fmt(x.cost) + '</td>' +
      '<td class="num">' + (x.moq || 0) + '</td><td>' + esc(x.logo || '') + '</td></tr>'
    : '<tr><td>' + esc(x.company) + '</td><td>' + esc(x.contact || '') + '</td>' +
      '<td>' + esc(x.brand || '') + '</td><td>' + esc(x.city || '') + '</td>' +
      '<td>' + esc(x.phone || '') + '</td><td>' + esc(x.stage || '') + '</td></tr>')).join('');

  const preview = rows
    ? '<div class="table-wrap" style="margin-top:12px"><table><thead>' + head + '</thead><tbody>' + rows +
      '</tbody></table></div>' +
      ((r.ready || []).length > 20 ? '<div class="hint">只显示前 20 行，导入的是全部 ' + r.ready.length + ' 条。</div>' : '')
    : '';

  const tip = isProd
    ? '<ol class="g-ol" style="margin:8px 0 12px">' +
        '<li>一行一个规格。<b>第一行是表头</b>，必须有「产品」这一列，最好也有「厂家」。</li>' +
        '<li>同一个产品多个规格就写多行，厂家和产品名重复写，系统会自动归到一起。</li>' +
        '<li>厂家或产品还不存在的，导入时会自动帮你建。</li>' +
        '<li>点「预览」看清会新建哪些，再「确认导入」。</li>' +
      '</ol>'
    : '<ol class="g-ol" style="margin:8px 0 12px">' +
        '<li>在 Excel 里把客户表做成一行一个客户，<b>第一行是表头</b>，必须有「公司名」这一列。</li>' +
        '<li>全选复制，粘到下面的大框里（从 Excel 直接粘也行，Tab 分隔它认）。</li>' +
        '<li>点「预览」，看清楚会进来哪些人、跳过哪些重复的。</li>' +
        '<li>确认没问题，点「确认导入」。</li>' +
      '</ol>';

  const placeholder = isProd
    ? '厂家,产品,类目,单位,规格,成本,300套价,1000套价,起订,印字,交期\n义乌昌达礼品,不锈钢保温杯,杯子,个,500ml,12.5,11.8,11,300,激光,10'
    : '公司名,联系人,电话,品牌,城市,行业,备注\n深圳龙华欧派旗舰店,王志强,138...,欧派,深圳,建材家居,之前问过双十一';

  return importTabs() +
    '<div class="panel" style="margin-bottom:14px">' +
      '<h4>怎么把' + (isProd ? '产品' : '老客户') + '搬进来</h4>' + tip +
      '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="btn" data-act="import-template">下载模板（CSV）</button>' +
        '<button class="btn" data-act="import-clear">清空</button>' +
      '</div>' +
      (isProd && (r.newSuppliers || []).length
        ? '<div class="hint" style="margin-top:10px">会新建厂家：' + esc(r.newSuppliers.join('、')) + '</div>' : '') +
      (isProd && (r.newProducts || []).length
        ? '<div class="hint" style="margin-top:6px">会新建产品：' + esc(r.newProducts.slice(0, 8).join('、')) +
          (r.newProducts.length > 8 ? ' 等 ' + r.newProducts.length + ' 个' : '') + '</div>' : '') +
    '</div>' +
    '<div class="panel">' +
      '<textarea id="importBox" class="import-box" placeholder="' + esc(placeholder) + '"></textarea>' +
      '<div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn primary" data-act="import-scan">预览</button>' +
        ((r.ready || []).length ? '<button class="btn primary" data-act="import-do">确认导入 ' + r.ready.length + ' 条</button>' : '') +
      '</div>' +
      stat + preview +
      (r.error ? '<div class="hint" style="color:#b03a2e;margin-top:10px">' + esc(r.error) + '</div>' : '') +
    '</div>';
}

window.renderImport = renderImport;
window.scanImport = scanImport;

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const mt = e.target.closest('[data-imode]');
  if (mt) {
    window.IMP = { mode: mt.dataset.imode, rows: [], ready: [] };
    render();
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const mode = (window.IMP || {}).mode || 'customer';

  if (act === 'import-template') {
    if (mode === 'product') importProductTemplateCsv();
    else importTemplateCsv();
    return;
  }
  if (act === 'import-clear') {
    window.IMP = { mode: mode, rows: [], ready: [] };
    render();
    return;
  }
  if (act === 'import-scan') {
    const box = document.getElementById('importBox');
    const text = box ? box.value : '';
    if (!String(text).trim()) return toast('先把内容粘进去');
    const r = (mode === 'product') ? scanImportProducts(text) : scanImport(text);
    window.IMP = Object.assign({ mode: mode }, r);
    render();
    if (r.error) toast('读不出来，看下面的提示');
    else toast('读到 ' + r.total + ' 行，可以导入 ' + ((r.ready || []).length) + ' 条');
    return;
  }
  if (act === 'import-do') {
    const r = window.IMP;
    if (!r.ready || !r.ready.length) return;
    if (!confirm('导入 ' + r.ready.length + ' 条？重复的会自动跳过。')) return;
    el.disabled = true;
    el.textContent = '正在导入…';
    let ok = 0;
    try {
      if (mode === 'product') {
        ok = await doImportProducts(r.ready);
      } else {
        for (let i = 0; i < r.ready.length; i += 50) {
          const chunk = r.ready.slice(i, i + 50);
          await rest('customers', '', { method: 'POST', body: chunk, prefer: 'return=minimal' });
          ok += chunk.length;
        }
      }
      window.IMP = { mode: mode, rows: [], ready: [] };
      await loadAll();
      render();
      toast('导进来了 ' + ok + ' 条');
    } catch (err) {
      toast('导入失败：' + err.message);
      el.disabled = false;
      el.textContent = '确认导入';
    }
  }
});
