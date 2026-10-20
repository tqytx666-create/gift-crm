/* 话术库 —— 把每天要发的那几句话存成模板，带上客户信息一键复制 */

const SCRIPT_CATS = ['收款', '跟进', '邀约', '回访', '拼单', '问候'];

function scriptList() {
  return (S.scripts || []).filter((x) => !x.deleted_at)
    .sort((a, b) => (Number(b.used_count) || 0) - (Number(a.used_count) || 0)
      || Number(a.id) - Number(b.id));
}

function scriptVars(c) {
  const st = (typeof custStats === 'function' && c) ? custStats(c.id) : {};
  const ev = (typeof upcomingEvent === 'function') ? upcomingEvent() : null;
  return {
    '称呼': (c && (c.salutation || c.contact)) || '老板',
    '公司': (c && c.company) || '',
    '品牌': (c && c.brand) || '',
    '城市': (c && c.city) || '',
    '金额': st.due ? '¥' + fmt(st.due) : '',
    '品类': (st.topCats && st.topCats[0]) || '小礼品',
    '活动': ev ? ev.name : '这次活动',
  };
}

function fillScript(content, vars) {
  return String(content || '').replace(/\{([^}]+)\}/g, (m, key) => {
    const v = vars[key];
    return (v === undefined || v === '' || v === null) ? m : v;
  });
}

function openScripts(customerId) {
  const c = customerId ? byId(S.customers, customerId) : null;
  const vars = scriptVars(c);
  const list = scriptList();

  const groups = {};
  list.forEach((s) => { (groups[s.category || '跟进'] = groups[s.category || '跟进'] || []).push(s); });
  const order = SCRIPT_CATS.filter((k) => groups[k]).concat(Object.keys(groups).filter((k) => SCRIPT_CATS.indexOf(k) < 0));
  const missingAmt = c && !(vars['金额'] && vars['金额'] !== '¥0.00');

  const body = list.length ? order.map((cat) =>
    '<div class="section-title">' + esc(cat) + ' <span class="muted small">' + groups[cat].length + ' 条</span></div>' +
    groups[cat].map((s) => {
      const text = fillScript(s.content, vars);
      return '<div class="scrip-card">' +
        '<div class="sp-top"><b>' + esc(s.name) + '</b>' +
          '<span class="muted small">用过 ' + (s.used_count || 0) + ' 次</span></div>' +
        '<div class="sp-text">' + esc(text) + '</div>' +
        '<div class="sp-act">' +
          '<button class="btn sm primary" data-act="copy-script" data-id="' + s.id + '"' +
            (c ? ' data-cid="' + c.id + '"' : '') + '>复制</button>' +
          '<button class="btn sm" data-act="edit-script" data-id="' + s.id + '">改</button>' +
          '<button class="btn sm danger" data-act="del-script" data-id="' + s.id + '">删</button>' +
        '</div>' +
      '</div>';
    }).join('')).join('')
    : '<div class="muted small">还没有话术。点下面「+ 新增一条」。</div>';

  openDrawer((c ? (c.company || '客户') + ' · ' : '') + '话术', body +
    (missingAmt ? '<div class="hint" style="margin-top:12px">这个客户还没有待收款，所以「{金额}」没被替换。复制前记得自己改一下。</div>' : '') +
    '<div style="margin-top:16px"><button class="btn" data-act="new-script">+ 新增一条</button></div>');
}

function scriptForm(id) {
  const s = id ? byId(S.scripts, id) : null;
  openForm(s ? '改话术' : '新增话术', [
    { key: 'name', label: '叫什么', full: true, ph: '催尾款' },
    { key: 'category', label: '归类', type: 'select', options: SCRIPT_CATS },
    {
      key: 'content', label: '话术正文', type: 'textarea', full: true,
      hint: '可以用这些占位符，发的时候会自动换成客户的信息：{称呼} {公司} {品牌} {城市} {金额} {品类} {活动}',
    },
  ], s || {}, async (b) => {
    await save('scripts', id || 0, {
      name: b.name || '未命名',
      category: b.category || '跟进',
      content: b.content || '',
    });
    toast(id ? '改好了' : '加好了');
    openScripts(0);
  });
}

async function copyScript(id, customerId) {
  const s = byId(S.scripts, id);
  if (!s) return;
  const c = customerId ? byId(S.customers, customerId) : null;
  const text = fillScript(s.content, scriptVars(c));
  const left = text.match(/\{[^}]+\}/g);
  copyText(text, left
    ? '已复制，但还有 ' + left.join('、') + ' 没填，发之前改一下'
    : '已复制，去微信粘贴');
  const next = (Number(s.used_count) || 0) + 1;
  s.used_count = next;
  rest('scripts', '?id=eq.' + id, { method: 'PATCH', body: { used_count: next }, prefer: 'return=minimal' })
    .catch(() => null);
  const el = document.querySelector('[data-act="copy-script"][data-id="' + id + '"]');
  if (el) {
    const prev = el.textContent;
    el.textContent = '已复制 ✓';
    setTimeout(() => { el.textContent = prev; }, 1400);
  }
}

/* ---------------- 事件 ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'open-scripts') { openScripts(el.dataset.id); return; }
  if (act === 'new-script') { scriptForm(0); return; }
  if (act === 'edit-script') { scriptForm(el.dataset.id); return; }
  if (act === 'copy-script') { copyScript(el.dataset.id, el.dataset.cid); return; }
  if (act === 'del-script') {
    const s = byId(S.scripts, el.dataset.id);
    if (!confirm('删除话术「' + (s && s.name ? s.name : '') + '」？')) return;
    await save('scripts', el.dataset.id, { deleted_at: new Date().toISOString() });
    openScripts(0);
    return;
  }
});

window.openScripts = openScripts;
window.fillScript = fillScript;
window.scriptVars = scriptVars;
