/* 第 5 期：供应链 —— 同品比价、交期达成率、调价记录 */

window.SUP = { tab: 'list' };

function ptabsHtml() {
  const t = (window.SUP || {}).tab || 'list';
  const items = [['list', 'SKU 列表'], ['compare', '同品比价'], ['logs', '调价记录']];
  return '<div class="seg">' + items.map(([k, label]) =>
    '<button data-ptab2="' + k + '" class="' + (t === k ? 'on' : '') + '">' + label + '</button>').join('') +
    '</div>';
}

/* ---------------- 厂家交期达成率 ---------------- */

function skusOfSupplier(sid) {
  const prods = S.products.filter((p) => Number(p.supplier_id) === Number(sid));
  const prodIds = {};
  prods.forEach((p) => { prodIds[Number(p.id)] = p; });
  return S.skus.filter((s) => prodIds[Number(s.product_id)]);
}

function ordersOfSupplier(sid) {
  const prods = S.products.filter((p) => Number(p.supplier_id) === Number(sid));
  const byIdMap = {};
  prods.forEach((p) => { byIdMap[Number(p.id)] = p; });
  const names = {};
  prods.forEach((p) => { names[p.name] = 1; });
  return (S.orders || []).filter((o) => {
    const items = normalizeItems(o.items_json);
    return items.some((it) => {
      // 有 sku_id 就只认 sku，别用名字猜，否则同名不同厂会串单
      if (it.sku_id) {
        const sku = byId(S.skus, it.sku_id);
        return !!(sku && byIdMap[Number(sku.product_id)]);
      }
      return !!(it.name && names[it.name]);
    });
  });
}

function supplierStats(sid) {
  const sup = byId(S.suppliers, sid) || {};
  const skus = skusOfSupplier(sid);
  const orders = ordersOfSupplier(sid);
  const done = orders.filter((o) => o.shipped_at && o.created_at);

  let sumPromised = 0;
  let sumActual = 0;
  let onTime = 0;
  done.forEach((o) => {
    const items = normalizeItems(o.items_json);
    let promised = 0;
    items.forEach((it) => {
      let sku = it.sku_id ? byId(S.skus, it.sku_id) : null;
      if (!sku && it.name) {
        const prod = S.products.find((p) => p.name === it.name);
        sku = prod ? S.skus.find((s) => Number(s.product_id) === Number(prod.id)) : null;
      }
      const lead = (sku && sku.lead_days) || sup.lead_days || 0;
      promised = Math.max(promised, lead);
    });
    if (!promised) promised = sup.lead_days || 0;
    const actual = Math.round((dnum(o.shipped_at) - dnum(localDate(o.created_at))) / 86400000);
    if (actual < 0) return;
    sumPromised += promised;
    sumActual += actual;
    if (actual <= promised) onTime++;
  });

  const amount = orders.reduce((a, o) => a + Number(o.total_price || 0), 0);
  return {
    sup,
    skuCount: skus.length,
    productCount: S.products.filter((p) => Number(p.supplier_id) === Number(sid)).length,
    orderCount: orders.length,
    shippedCount: done.length,
    amount,
    avgPromised: done.length ? Math.round(sumPromised / done.length) : (sup.lead_days || 0),
    avgActual: done.length ? Math.round((sumActual / done.length) * 10) / 10 : null,
    onTimeRate: done.length ? onTime / done.length : null,
  };
}

function leadBadge(st) {
  if (st.onTimeRate === null) return '<span class="muted small">还没发过货</span>';
  const pct = Math.round(st.onTimeRate * 100);
  const cls = pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad';
  return '<span class="tag ' + cls + '">' + pct + '%</span>';
}

/* ---------------- 同品比价 ---------------- */

function compareGroups() {
  const map = {};
  S.skus.forEach((s) => {
    const p = byId(S.products, s.product_id);
    if (!p || !p.name) return;
    const key = p.name.trim();
    (map[key] = map[key] || []).push({
      sku: s,
      prod: p,
      sup: byId(S.suppliers, p.supplier_id) || {},
    });
  });
  return Object.keys(map).map((name) => ({
    name,
    rows: map[name].sort((a, b) => Number(a.sku.cost) - Number(b.sku.cost)),
  })).sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
}

function renderCompare() {
  const groups = compareGroups();
  const multi = groups.filter((g) => g.rows.length > 1);
  const single = groups.filter((g) => g.rows.length === 1);

  const groupHtml = (g) => {
    const cheapest = Number(g.rows[0].sku.cost);
    const dearest = Number(g.rows[g.rows.length - 1].sku.cost);
    const spread = Math.round((dearest - cheapest) * 100) / 100;
    const rows = g.rows.map((r, i) => {
      const pct = cheapest > 0 ? Math.round(((Number(r.sku.cost) - cheapest) / cheapest) * 100) : 0;
      return '<tr>' +
        '<td>' + (i === 0 ? '<span class="tag ok">最便宜</span> ' : '') + esc(r.sup.name || '未指定厂家') + '</td>' +
        '<td>' + esc(r.sku.spec || '') + '</td>' +
        '<td class="num">' + fmt(r.sku.cost) + (i > 0 ? ' <span class="small muted">+' + pct + '%</span>' : '') + '</td>' +
        '<td class="num muted">' + (r.sku.price300 ? fmt(r.sku.price300) : '—') + '</td>' +
        '<td class="num">' + (r.sku.moq || 0) + '</td>' +
        '<td class="num">' + ((r.sku.lead_days || r.sup.lead_days || 0)) + ' 天</td>' +
        '<td>' + (r.sku.logo ? '<span class="tag">' + esc(r.sku.logo) + '</span>' : '—') + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="cmp-card">' +
      '<div class="cmp-head"><b>' + esc(g.name) + '</b>' +
        (spread > 0 ? '<span class="cmp-spread">相差 ¥' + fmt(spread) + '</span>' : '') + '</div>' +
      '<div class="table-wrap" style="border:none"><table><thead><tr>' +
        '<th>厂家</th><th>规格</th><th class="num">成本</th><th class="num">300 套价</th>' +
        '<th class="num">起订</th><th class="num">交期</th><th>印字</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  };

  const list = multi.length ? multi : [];
  const singleHtml = single.length
    ? '<div class="section-title">只有一个厂的产品 <span class="muted small">' + single.length + ' 个</span></div>' +
      '<div class="cmp-single">' + single.map((g) =>
        '<div class="cmp-single-item" data-act="edit-sku" data-id="' + g.rows[0].sku.id + '">' +
        '<span>' + esc(g.name) + (g.rows[0].sku.spec ? ' · ' + esc(g.rows[0].sku.spec) : '') + '</span>' +
        '<span class="muted small">' + esc(g.rows[0].sup.name || '') + '　成本 ' + fmt(g.rows[0].sku.cost) + '</span>' +
        '</div>').join('') + '</div>'
    : '';

  return ptabsHtml() +
    (list.length
      ? '<div class="hint" style="margin:10px 0 12px">同一个品，不同厂的报价摆在一起比。这个页面只有在同一个品名录了多家厂的时候才有货。</div>' +
        list.map(groupHtml).join('')
      : '<div class="table-wrap"><div class="empty">还没有同品多厂的数据。<br>' +
        '<span class="small muted">比如「不锈钢保温杯」分别在义乌昌达和永康厨具各录一条产品，这里就会自动并排放。</span></div></div>') +
    singleHtml;
}

/* ---------------- 调价记录 ---------------- */

function renderPriceLogs() {
  const logs = (S.priceLogs || []).slice(0, 80);
  const rows = logs.map((l) => {
    const diff = Number(l.new_cost) - Number(l.old_cost);
    const up = diff > 0;
    return '<tr>' +
      '<td><div class="rowtitle">' + esc(l.product_name || '') + '</div>' +
      '<div class="rowsub">' + esc(l.spec || '') + '</div></td>' +
      '<td class="num">' + fmt(l.old_cost) + '</td>' +
      '<td class="num">' + fmt(l.new_cost) + '</td>' +
      '<td class="num ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + fmt(diff) + '</td>' +
      '<td class="muted small">' + esc(localDate(l.created_at)) + '</td>' +
      '</tr>';
  }).join('');

  const upCount = logs.filter((l) => Number(l.new_cost) > Number(l.old_cost)).length;

  return ptabsHtml() +
    '<div class="cards" style="grid-template-columns:repeat(3,1fr);margin-top:10px">' +
      '<div class="stat"><b>' + logs.length + '</b><span>调价次数</span></div>' +
      '<div class="stat warn"><b>' + upCount + '</b><span>涨价的</span></div>' +
      '<div class="stat ok"><b>' + (logs.length - upCount) + '</b><span>降价的</span></div>' +
    '</div>' +
    '<div class="table-wrap"><table><thead><tr>' +
      '<th>产品 / 规格</th><th class="num">原成本</th><th class="num">新成本</th>' +
      '<th class="num">变化</th><th>时间</th>' +
    '</tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="empty">还没有调价记录。<br><span class="small muted">在「SKU 列表」里改成本，这里会自动记一笔。</span></td></tr>') +
    '</tbody></table></div>';
}

function renderSupplyTab() {
  if ((window.SUP || {}).tab === 'compare') return renderCompare();
  if ((window.SUP || {}).tab === 'logs') return renderPriceLogs();
  return null;
}

/* ---------------- 保存 SKU 时记调价 ---------------- */

async function saveSkuWithLog(id, body, before) {
  const oldCost = before ? Number(before.cost || 0) : null;
  const newCost = Number(body.cost || 0);
  if (id && before && oldCost !== null && oldCost !== newCost) {
    const prod = byId(S.products, body.product_id || before.product_id) || {};
    try {
      await rest('priceLogs', '', {
        method: 'POST',
        body: sanitize({
          sku_id: Number(id),
          product_name: prod.name || '',
          spec: body.spec || before.spec || '',
          old_cost: oldCost,
          new_cost: newCost,
        }),
      });
    } catch (e) {
      console.warn('调价记录没写进去', e);
    }
  }
  await save('skus', id, body);
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-ptab2]');
  if (!el) return;
  window.SUP.tab = el.dataset.ptab2;
  if (S.view !== 'products') { location.hash = '#products'; return; }
  render();
});

window.renderSupplyTab = renderSupplyTab;
window.supplierStats = supplierStats;
window.saveSkuWithLog = saveSkuWithLog;
window.ptabsHtml = ptabsHtml;
