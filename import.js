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

window.IMP = { rows: [], ready: [] };

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

function importTemplateCsv() {
  const head = IMPORT_FIELDS.map((f) => f.names[0]).join(',');
  const sample = ['深圳龙华欧派旗舰店', '王志强', '王总', '13800000001', 'wx_oupai',
    '欧派', '建材家居', '深圳', '中型', '5', '待发方案', '微信老客', '2026-09-18', '之前问过双十一']
    .join(',');
  download('客户导入模板.csv', '\ufeff' + head + '\n' + sample + '\n', 'text/csv;charset=utf-8');
}

function renderImport() {
  const r = window.IMP;
  const totalRows = Number(r.total) || (r.rows ? r.rows.length : 0);
  const stat = totalRows
    ? '<div class="cards" style="grid-template-columns:repeat(4,1fr);margin-top:12px">' +
        '<div class="stat"><b>' + totalRows + '</b><span>读到几行</span></div>' +
        '<div class="stat ok"><b>' + r.ready.length + '</b><span>可以导入</span></div>' +
        '<div class="stat warn"><b>' + r.dup.length + '</b><span>重复跳过</span></div>' +
        '<div class="stat"><b>' + r.bad.length + '</b><span>缺公司名</span></div>' +
      '</div>'
    : '';

  const preview = r.ready.length
    ? '<div class="table-wrap" style="margin-top:12px"><table><thead><tr>' +
        '<th>公司名</th><th>联系人</th><th>品牌</th><th>城市</th><th>电话</th><th>阶段</th>' +
      '</tr></thead><tbody>' +
      r.ready.slice(0, 20).map((x) =>
        '<tr><td>' + esc(x.company) + '</td><td>' + esc(x.contact || '') + '</td>' +
        '<td>' + esc(x.brand || '') + '</td><td>' + esc(x.city || '') + '</td>' +
        '<td>' + esc(x.phone || '') + '</td><td>' + esc(x.stage || '') + '</td></tr>').join('') +
      '</tbody></table></div>' +
      (r.ready.length > 20 ? '<div class="hint">只显示前 20 行，导入的是全部 ' + r.ready.length + ' 条。</div>' : '')
    : '';

  return '<div class="panel" style="margin-bottom:14px">' +
      '<h4>怎么把老客户搬进来</h4>' +
      '<ol class="g-ol" style="margin:8px 0 12px">' +
        '<li>在 Excel 里把客户表做成一行一个客户，<b>第一行是表头</b>，必须有「公司名」这一列。</li>' +
        '<li>全选复制，粘到下面的大框里（从 Excel 直接粘也行，Tab 分隔它认）。</li>' +
        '<li>点「预览」，看清楚会进来哪些人、跳过哪些重复的。</li>' +
        '<li>确认没问题，点「确认导入」。</li>' +
      '</ol>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="btn" data-act="import-template">下载模板（CSV）</button>' +
        '<button class="btn" data-act="import-clear">清空</button>' +
      '</div>' +
    '</div>' +
    '<div class="panel">' +
      '<textarea id="importBox" class="import-box" placeholder="公司名,联系人,电话,品牌,城市,行业,备注&#10;深圳龙华欧派旗舰店,王志强,138...,欧派,深圳,建材家居,之前问过双十一"></textarea>' +
      '<div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn primary" data-act="import-scan">预览</button>' +
        (r.ready.length ? '<button class="btn primary" data-act="import-do">确认导入 ' + r.ready.length + ' 条</button>' : '') +
      '</div>' +
      stat + preview +
      (r.error ? '<div class="hint" style="color:#b03a2e;margin-top:10px">' + esc(r.error) + '</div>' : '') +
    '</div>';
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  if (act === 'import-template') { importTemplateCsv(); return; }
  if (act === 'import-clear') { window.IMP = { rows: [], ready: [] }; render(); return; }
  if (act === 'import-scan') {
    const box = document.getElementById('importBox');
    const text = box ? box.value : '';
    if (!String(text).trim()) return toast('先把内容粘进去');
    const r = scanImport(text);
    window.IMP = Object.assign({ rows: [] }, r);
    render();
    if (r.error) toast('读不出来，看下面的提示');
    else toast('读到 ' + r.total + ' 行，可以导入 ' + r.ready.length + ' 条');
    return;
  }
  if (act === 'import-do') {
    const r = window.IMP;
    if (!r.ready || !r.ready.length) return;
    if (!confirm('导入 ' + r.ready.length + ' 个客户？重复的会自动跳过。')) return;
    el.disabled = true;
    el.textContent = '正在导入…';
    let ok = 0;
    try {
      for (let i = 0; i < r.ready.length; i += 50) {
        const chunk = r.ready.slice(i, i + 50);
        await rest('customers', '', { method: 'POST', body: chunk, prefer: 'return=minimal' });
        ok += chunk.length;
      }
      window.IMP = { rows: [], ready: [] };
      await loadAll();
      render();
      toast('导进来了 ' + ok + ' 个客户');
    } catch (err) {
      toast('导入失败：' + err.message);
      el.disabled = false;
    }
  }
});

window.renderImport = renderImport;
window.scanImport = scanImport;
