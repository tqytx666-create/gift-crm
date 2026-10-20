/* 报价模板 —— 常卖的组合存下来，下次一键调 */

function tplList() {
  return (S.templates || []).filter((t) => !t.deleted_at)
    .sort((a, b) => (Number(b.used_count) || 0) - (Number(a.used_count) || 0)
      || Number(a.id) - Number(b.id));
}

function tplItems(t) {
  let v = t.items_json;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
  return Array.isArray(v) ? v : [];
}

function tplSummary(t) {
  const items = tplItems(t);
  const nums = items.map((i) => (Number(i.qty) || 0) + '×' + (i.name || ''));
  return (nums.slice(0, 3).join('、') || '空模板') + (nums.length > 3 ? ' 等 ' + nums.length + ' 项' : '');
}

function tplStripHtml() {
  const list = tplList();
  const chips = list.map((t) =>
    '<button class="chip tpl-chip" data-tpl="' + t.id + '" title="' + esc(tplSummary(t)) + '">' +
    esc(t.name || ('模板 ' + t.id)) +
    '<em>¥' + fmt0(Number(t.total_price)) + '</em></button>').join('');

  return '<div class="tpl-bar">' +
    '<span class="tpl-label">常用模板</span>' +
    (chips || '<span class="muted small">还没有模板。把下面这份清单存成一个，下次一键调。</span>') +
    '<button class="chip ghost" data-act="save-template">+ 存成模板</button>' +
    (list.length ? '<button class="chip ghost" data-act="manage-templates">管理</button>' : '') +
    '</div>';
}

function applyTemplate(id) {
  const t = byId(tplList(), id);
  if (!t) return;
  const items = tplItems(t).map((it) => {
    const sku = byId(S.skus, it.sku_id);
    const p = sku ? (byId(S.products, sku.product_id) || {}) : {};
    return {
      sku_id: it.sku_id,
      qty: Number(it.qty) || 1,
      name: (sku ? p.name : it.name) || '',
      spec: (sku ? sku.spec : it.spec) || '',
      unit: (p && p.unit) || '个',
      cost: sku ? sku.cost : Number(it.cost) || 0,
    };
  }).filter((x) => byId(S.skus, x.sku_id));

  if (!items.length) return toast('这个模板里的品已经找不到');
  VS.quote.items = items;
  // 本地先加上，界面立刻能看到；后台再写库
  const nextCount = (Number(t.used_count) || 0) + 1;
  t.used_count = nextCount;
  rest('templates', '?id=eq.' + id, {
    method: 'PATCH',
    body: { used_count: nextCount },
    prefer: 'return=minimal',
  }).catch(() => null);
  recalc();
  toast('已载入「' + (t.name || '') + '」');
}

function saveCurrentAsTemplate() {
  const Q = VS.quote;
  if (!Q.items.length || !Q.result) return toast('先加几个商品再存');
  openForm('把当前清单存成模板', [
    { key: 'name', label: '模板名', full: true, ph: '建材双十一标准三档' },
    { key: 'note', label: '备注', type: 'textarea', full: true, ph: '进店礼 + 成交款 + 大单款，给建材客户用' },
  ], {}, async (b) => {
    const items = Q.result.detail.map((d) => ({
      sku_id: d.sku_id, name: d.name, spec: d.spec, qty: d.qty, cost: d.unit_cost,
    }));
    await save('templates', 0, {
      name: b.name || ('模板 ' + new Date().toLocaleDateString('zh-CN')),
      note: b.note || '',
      items_json: items,
      total_cost: Q.result.total_cost,
      total_price: Q.result.total_price,
      used_count: 0,
    });
    toast('模板存好了，下次一点就出来');
  });
}

function manageTemplates() {
  const list = tplList();
  const rows = list.map((t) =>
    '<div class="tpl-row">' +
      '<div class="tpl-info"><div class="tpl-name">' + esc(t.name || '') + '</div>' +
      '<div class="tpl-sub">' + esc(tplSummary(t)) + '</div>' +
      (t.note ? '<div class="tpl-sub">' + esc(t.note) + '</div>' : '') + '</div>' +
      '<div class="tpl-money">¥' + fmt(Number(t.total_price)) +
        '<div class="rowsub">用过 ' + (t.used_count || 0) + ' 次</div></div>' +
      '<div class="tpl-act">' +
        '<button class="btn sm primary" data-tpl="' + t.id + '">载入</button>' +
        '<button class="btn sm danger" data-act="del-template" data-id="' + t.id + '">删</button>' +
      '</div>' +
    '</div>').join('');

  openDrawer('报价模板', (rows || '<div class="muted small">还没有模板。</div>'));
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const tpl = e.target.closest('[data-tpl]');
  if (tpl) {
    applyTemplate(tpl.dataset.tpl);
    if ($('#drawer').classList.contains('on')) closeDrawer();
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'save-template') { saveCurrentAsTemplate(); return; }
  if (el.dataset.act === 'manage-templates') { manageTemplates(); return; }
  if (el.dataset.act === 'del-template') {
    const t = byId(S.templates, el.dataset.id);
    if (!confirm('删除模板「' + (t && t.name ? t.name : '') + '」？')) return;
    await save('templates', el.dataset.id, { deleted_at: new Date().toISOString() });
    manageTemplates();
    render();
    return;
  }
});

window.tplStripHtml = tplStripHtml;
