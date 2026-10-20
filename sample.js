/* 打样记录 —— logo 版本、印字位置、色号、谁确认的 */

window.SAM = { filter: 'all' };

const SAMPLE_STATUS = {
  pending: '待打样', making: '打样中', sent: '已寄出',
  confirmed: '已确认', rejected: '要改',
};
const SAMPLE_FLOW = { pending: 'making', making: 'sent', sent: 'confirmed' };

function sampleTag(st) {
  const cls = st === 'confirmed' ? 'ok' : st === 'rejected' ? 'bad'
    : st === 'sent' ? 'blue' : st === 'making' ? 'warn' : '';
  return '<span class="tag ' + cls + '">' + (SAMPLE_STATUS[st] || st) + '</span>';
}

function skuOptions() {
  return S.skus.map((s) => {
    const p = byId(S.products, s.product_id) || {};
    return { v: s.id, t: (p.name || '') + (s.spec ? ' · ' + s.spec : '') };
  });
}

function sampleFields() {
  return [
    { key: 'customer_id', label: '客户', type: 'select', full: true,
      options: [{ v: '', t: '先不指定' }].concat(S.customers.map((c) => ({ v: c.id, t: c.company }))) },
    { key: 'sku_id', label: '打样哪个品', type: 'select', full: true, options: skuOptions() },
    { key: 'position', label: '印字位置', ph: '杯身正面 / 盒盖正中 / 侧面' },
    { key: 'color', label: '色号', ph: 'Pantone 186C / 四色印刷' },
    { key: 'qty', label: '数量', type: 'number', def: 1 },
    { key: 'due_date', label: '要确认到哪天', def: plusDays(5) },
    { key: 'status', label: '现在到哪步', type: 'select',
      options: Object.keys(SAMPLE_STATUS).map((k) => ({ v: k, t: SAMPLE_STATUS[k] })) },
    { key: 'confirmed_by', label: '谁确认' },
    { key: 'logo_url', label: '客户 logo 文件', type: 'image', full: true,
      hint: '确认错 logo 就是整批返工，这里一定要传对的那一版' },
    { key: 'preview_url', label: '效果图 / 打样实拍', type: 'image', full: true },
    { key: 'note', label: '备注', type: 'textarea', full: true,
      ph: '客户说 logo 再往左一点，字高 8mm' },
  ];
}

function openSampleForm(id) {
  const before = id ? byId(S.samples, id) : null;
  openForm(before ? '改打样记录' : '新建打样', sampleFields(), before || {}, async (b) => {
    const sku = byId(S.skus, b.sku_id);
    const prod = sku ? (byId(S.products, sku.product_id) || {}) : {};
    const cust = byId(S.customers, b.customer_id);
    const body = sanitize({
      customer_id: b.customer_id ? Number(b.customer_id) : null,
      customer_name: cust ? cust.company : '',
      sku_id: sku ? sku.id : null,
      product_name: prod.name || '',
      spec: sku ? sku.spec : '',
      position: b.position || '',
      color: b.color || '',
      qty: Number(b.qty || 0),
      due_date: b.due_date || null,
      status: b.status || 'pending',
      confirmed_by: b.confirmed_by || '',
      logo_url: b.logo_url || '',
      preview_url: b.preview_url || '',
      note: b.note || '',
    });
    await save('samples', id || 0, body);
    if (id) openSampleDetail(id); else render();
    toast(before ? '已保存' : '打样记录建好了');
  });
}

function renderSamples() {
  const all = (S.samples || []).slice();
  const counts = { all: all.length };
  Object.keys(SAMPLE_STATUS).forEach((k) => { counts[k] = all.filter((s) => s.status === k).length; });

  let list = all;
  if (SAM.filter !== 'all') list = all.filter((s) => s.status === SAM.filter);
  const q = S.q;
  if (q) {
    list = list.filter((s) => [s.customer_name, s.product_name, s.spec, s.position, s.color, s.note]
      .join(' ').toLowerCase().includes(q));
  }
  list.sort((a, b) => {
    const rank = { pending: 0, making: 1, sent: 2, rejected: 3, confirmed: 4 };
    const r = (rank[a.status] || 0) - (rank[b.status] || 0);
    return r !== 0 ? r : Number(b.id) - Number(a.id);
  });

  const chips = [['all', '全部', counts.all]]
    .concat(Object.keys(SAMPLE_STATUS).map((k) => [k, SAMPLE_STATUS[k], counts[k]]))
    .filter((x) => x[2] > 0 || x[0] === 'all');

  const cards = list.map((s) => {
    const pic = s.preview_url || s.logo_url;
    const overdue = s.due_date && s.status !== 'confirmed' && s.due_date < todayStr();
    return '<div class="sample-card" data-act="open-sample" data-id="' + s.id + '">' +
      '<div class="sc-pic">' + (pic ? '<img src="' + esc(pic) + '" alt="">' : '<span>无图</span>') + '</div>' +
      '<div class="sc-body">' +
        '<div class="sc-top"><div class="sc-name">' + esc(s.customer_name || '未选客户') + '</div>' +
        sampleTag(s.status) + '</div>' +
        '<div class="sc-sub">' + esc(s.product_name || '') + (s.spec ? ' · ' + esc(s.spec) : '') +
          (s.qty ? '　×' + s.qty : '') + '</div>' +
        '<div class="sc-meta">' +
          (s.position ? '印字：' + esc(s.position) + '　' : '') +
          (s.color ? '色号：' + esc(s.color) + '　' : '') +
          (s.confirmed_by ? '确认：' + esc(s.confirmed_by) + '　' : '') +
          (s.due_date ? '<span class="' + (overdue ? 'sc-over' : '') + '">' + esc(s.due_date) + ' 前确认</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  $('#view').innerHTML =
    '<div class="cards">' +
      '<div class="stat warn"><b>' + (counts.pending + counts.making) + '</b><span>还没确认的</span></div>' +
      '<div class="stat"><b>' + counts.sent + '</b><span>已寄出等回话</span></div>' +
      '<div class="stat ok"><b>' + counts.confirmed + '</b><span>已确认</span></div>' +
      '<div class="stat"><b>' + counts.rejected + '</b><span>要改</span></div>' +
    '</div>' +
    '<div class="chips" id="sampleChips">' + chips.map(([k, label, n]) =>
      '<button class="chip ' + (SAM.filter === k ? 'on' : '') + '" data-sfilter="' + k + '">' +
      label + (k === 'all' ? '' : ' ' + n) + '</button>').join('') + '</div>' +
    (cards ? '<div class="sample-list">' + cards + '</div>'
      : '<div class="table-wrap" style="margin-top:12px"><div class="empty">还没有打样记录。<br>' +
        '<span class="small muted">点右上角「+ 新建打样」，把 logo 文件、印字位置、色号都记上。' +
        '确认错 logo 就是整批返工，这一步别省。</span></div></div>');

  document.querySelectorAll('[data-sfilter]').forEach((b) => {
    b.onclick = () => { SAM.filter = b.dataset.sfilter; renderSamples(); };
  });
}

function openSampleDetail(id) {
  const s = byId(S.samples, id);
  if (!s) return;
  const next = SAMPLE_FLOW[s.status];
  const html =
    '<div class="sample-hero">' +
      (s.logo_url ? '<div class="sh-item"><span>客户 logo</span><img src="' + esc(s.logo_url) + '" alt=""></div>' : '') +
      (s.preview_url ? '<div class="sh-item"><span>效果图 / 实拍</span><img src="' + esc(s.preview_url) + '" alt=""></div>' : '') +
    '</div>' +
    '<div class="field-grid">' +
      kv('客户', s.customer_name) +
      kv('状态', SAMPLE_STATUS[s.status] || s.status) +
      kv('产品', s.product_name) +
      kv('规格', s.spec) +
      kv('数量', s.qty ? String(s.qty) : '') +
      kv('印字位置', s.position) +
      kv('色号', s.color) +
      kv('谁确认', s.confirmed_by) +
      kv('确认到哪天', s.due_date) +
      kv('建立于', localDate(s.created_at)) +
    '</div>' +
    (s.note ? '<div class="kv" style="margin-top:6px"><i>备注</i><b>' + esc(s.note) + '</b></div>' : '') +
    '<div style="display:flex;gap:8px;margin:16px 0 4px;flex-wrap:wrap">' +
      (next ? '<button class="btn sm primary" data-act="sample-next" data-id="' + s.id + '" data-v="' + next + '">推进到「' + SAMPLE_STATUS[next] + '」</button>' : '') +
      (s.status !== 'confirmed' ? '<button class="btn sm" data-act="sample-ok" data-id="' + s.id + '">标记已确认</button>' : '') +
      (s.status !== 'rejected' ? '<button class="btn sm" data-act="sample-no" data-id="' + s.id + '">客户要改</button>' : '') +
      '<button class="btn sm" data-act="sample-edit" data-id="' + s.id + '">编辑</button>' +
      '<button class="btn sm danger" data-act="sample-del" data-id="' + s.id + '">删除</button>' +
    '</div>' +
    (s.order_id ? '' : '');
  openDrawer((s.product_name || '打样') + ' · ' + (s.customer_name || ''), html);
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'add-sample') return openSampleForm(0);
  if (act === 'open-sample') return openSampleDetail(id);
  if (act === 'sample-edit') return openSampleForm(id);
  if (act === 'sample-next') {
    await save('samples', id, { status: el.dataset.v });
    openSampleDetail(id);
    return;
  }
  if (act === 'sample-ok') {
    const s = byId(S.samples, id);
    openForm('确认打样', [
      { key: 'confirmed_by', label: '谁确认的', def: (s && s.confirmed_by) || '', full: true },
      { key: 'note', label: '确认备注', type: 'textarea', full: true, ph: '客户微信回「可以」' },
    ], s, async (b) => {
      await save('samples', id, {
        status: 'confirmed',
        confirmed_by: b.confirmed_by || '',
        note: b.note || (s && s.note) || '',
      });
      openSampleDetail(id);
      toast('已确认，可以下单了');
    });
    return;
  }
  if (act === 'sample-no') {
    await save('samples', id, { status: 'rejected' });
    openSampleDetail(id);
    toast('标成「要改」了');
    return;
  }
  if (act === 'sample-del') {
    const s = byId(S.samples, id);
    if (!confirm('删除这条打样记录？')) return;
    await del('samples', id, s && s.product_name);
    closeDrawer();
    renderSamples();
    return;
  }
});

window.renderSamples = renderSamples;
