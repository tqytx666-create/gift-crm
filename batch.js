/* 客户批量操作 —— 一次改一批 */

window.SEL = window.SEL || {};

function selIds() {
  return Object.keys(window.SEL).filter((k) => window.SEL[k]).map(Number);
}
function selCount() { return selIds().length; }
function selClear() { window.SEL = {}; }
function selSet(ids, on) {
  ids.forEach((id) => { if (on) window.SEL[id] = 1; else delete window.SEL[id]; });
}

function batchBarHtml() {
  const n = selCount();
  if (!n) return '';
  return '<div class="selbar" id="selBar">' +
    '<span class="selbar-n">已选 <b>' + n + '</b> 个客户</span>' +
    '<span class="selbar-btns">' +
      '<button class="btn sm" data-act="batch-stage">改阶段</button>' +
      '<button class="btn sm" data-act="batch-brand">打品牌</button>' +
      '<button class="btn sm" data-act="batch-industry">改行业</button>' +
      '<button class="btn sm danger" data-act="batch-del">删除</button>' +
      '<button class="btn sm ghost" data-act="batch-clear">取消选择</button>' +
    '</span>' +
    '</div>';
}

function batchBind() {
  const all = document.getElementById('selAll');
  const boxes = Array.prototype.slice.call(document.querySelectorAll('.rowsel'));
  boxes.forEach((box) => {
    box.checked = !!window.SEL[box.dataset.id];
    box.onchange = () => {
      if (box.checked) window.SEL[box.dataset.id] = 1;
      else delete window.SEL[box.dataset.id];
      refreshBatchBar();
    };
  });
  if (all) {
    const n = boxes.length;
    const sel = boxes.filter((b) => b.checked).length;
    all.checked = n > 0 && sel === n;
    all.indeterminate = sel > 0 && sel < n;
    all.onchange = () => {
      if (all.checked) boxes.forEach((b) => { window.SEL[b.dataset.id] = 1; b.checked = true; });
      else { boxes.forEach((b) => { delete window.SEL[b.dataset.id]; b.checked = false; }); }
      refreshBatchBar();
    };
  }
}

// 只换操作条，不重绘整页（不然勾选会闪）
function refreshBatchBar() {
  const old = document.getElementById('selBar');
  if (old) old.remove();
  const n = selCount();
  const anchor = document.querySelector('.toolbar');
  if (n && anchor) {
    const wrap = document.createElement('div');
    wrap.innerHTML = batchBarHtml();
    anchor.insertAdjacentElement('afterend', wrap.firstChild);
  }
  const all = document.getElementById('selAll');
  if (all) {
    const boxes = Array.prototype.slice.call(document.querySelectorAll('.rowsel'));
    const sel = boxes.filter((b) => b.checked).length;
    all.checked = boxes.length > 0 && sel === boxes.length;
    all.indeterminate = sel > 0 && sel < boxes.length;
  }
}

async function bulkPatch(patch, label) {
  const ids = selIds();
  if (!ids.length) return;
  const q = '?id=in.(' + ids.join(',') + ')';
  await rest('customers', q, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
  selClear();
  await loadAll();
  render();
  toast(label + '（' + ids.length + ' 个）');
}

function batchAsk(kind) {
  const ids = selIds();
  if (!ids.length) return;
  if (kind === 'stage') {
    openForm('批量改阶段 · ' + ids.length + ' 个客户', [
      { key: 'stage', label: '改成哪个阶段', type: 'select', full: true, options: STAGES },
    ], {}, async (b) => { await bulkPatch({ stage: b.stage }, '阶段改好了'); });
  } else if (kind === 'brand') {
    openForm('批量打品牌 · ' + ids.length + ' 个客户', [
      { key: 'brand', label: '品牌', full: true, ph: '欧派' },
    ], {}, async (b) => {
      if (!String(b.brand || '').trim()) return toast('品牌不能空');
      await bulkPatch({ brand: String(b.brand).trim() }, '品牌打好了');
    });
  } else if (kind === 'industry') {
    openForm('批量改行业 · ' + ids.length + ' 个客户', [
      { key: 'industry', label: '行业', type: 'select', full: true, options: INDUSTRIES },
    ], {}, async (b) => { await bulkPatch({ industry: b.industry }, '行业改好了'); });
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'batch-stage') { batchAsk('stage'); return; }
  if (act === 'batch-brand') { batchAsk('brand'); return; }
  if (act === 'batch-industry') { batchAsk('industry'); return; }
  if (act === 'batch-clear') { selClear(); render(); return; }
  if (act === 'batch-del') {
    const ids = selIds();
    if (!ids.length) return;
    if (!confirm('把选中的 ' + ids.length + ' 个客户移到回收站？随时能捞回来。')) return;
    el.disabled = true;
    try {
      await rest('customers', '?id=in.(' + ids.join(',') + ')', {
        method: 'PATCH',
        body: { deleted_at: new Date().toISOString() },
        prefer: 'return=minimal',
      });
      selClear();
      await loadAll();
      render();
      toast('已移到回收站（' + ids.length + ' 个）');
    } catch (err) {
      toast('删除失败：' + err.message);
      el.disabled = false;
    }
  }
});

window.batchBarHtml = batchBarHtml;
window.batchBind = batchBind;
