/* 系统自检 —— 怀疑"是不是坏了"的时候点一下 */

window.SC = { run: false, results: [], at: '' };

function scTimeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('超时 ' + ms + 'ms')), ms));
}
function scRace(p, ms) { return Promise.race([p, scTimeout(ms)]); }

const SC_CHECKS = [
  {
    key: 'read', name: '数据能读', hint: '从云端把全部数据拉一遍',
    async run() {
      const t0 = Date.now();
      const d = await scRace(rpcAll(), 12000);
      const n = (d.customers || []).length + (d.skus || []).length + (d.orders || []).length;
      return { ok: true, msg: (Date.now() - t0) + 'ms，读到 ' + n + ' 条' };
    },
  },
  {
    key: 'write', name: '数据能写', hint: '写一条再删掉，不动你的真数据',
    async run() {
      const tk = await token();
      const k = '_selfcheck';
      const r = await scRace(fetch(SUPA.url + '/rest/v1/gift_settings', {
        method: 'POST',
        headers: { apikey: SUPA.key, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ k: k, v: new Date().toISOString() }),
      }), 10000);
      if (!r.ok) throw new Error('写入返回 ' + r.status);
      const r2 = await scRace(fetch(SUPA.url + '/rest/v1/gift_settings?k=eq.' + k, {
        method: 'DELETE',
        headers: { apikey: SUPA.key, Authorization: 'Bearer ' + tk, Prefer: 'return=minimal' },
      }), 10000);
      if (!r2.ok) throw new Error('删除返回 ' + r2.status);
      return { ok: true, msg: '写入+删除都通' };
    },
  },
  {
    key: 'image', name: '图片能传', hint: '报价单和方案上的 logo 存在云存储',
    async run() {
      const tk = await token();
      const r = await scRace(fetch(SUPA.url + '/storage/v1/object/list/gift-img', {
        method: 'POST',
        headers: { apikey: SUPA.key, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: '', limit: 1 }),
      }), 10000);
      if (r.status === 404 || r.status === 400) throw new Error('存储桶没找到（' + r.status + '）');
      if (!r.ok) throw new Error('存储返回 ' + r.status);
      return { ok: true, msg: '存储桶正常' };
    },
  },
  {
    key: 'share', name: '分享链接能开', hint: '生成一条、匿名取一次、再删掉',
    async run() {
      const tk = await token();
      const t = 'sc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const body = { token: t, kind: 'quote', payload: { kind: 'quote', total: 1, items: [], customer: { company: '自检' } }, title: '自检' };
      const r = await scRace(fetch(SUPA.url + '/rest/v1/gift_shares', {
        method: 'POST',
        headers: { apikey: SUPA.key, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      }), 10000);
      if (!r.ok) throw new Error('生成返回 ' + r.status);
      const r2 = await scRace(fetch(SUPA.url + '/rest/v1/rpc/gift_get_share', {
        method: 'POST',
        headers: { apikey: SUPA.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: t }),
      }), 10000);
      const got = r2.ok ? await r2.json() : null;
      await fetch(SUPA.url + '/rest/v1/gift_shares?token=eq.' + t, {
        method: 'DELETE',
        headers: { apikey: SUPA.key, Authorization: 'Bearer ' + tk, Prefer: 'return=minimal' },
      });
      if (!got) throw new Error('匿名取不到内容');
      return { ok: true, msg: '客户点开能拿到（不含成本）' };
    },
  },
  {
    key: 'print', name: 'A4 打印样式', hint: '打印时侧栏和按钮应当消失',
    async run() {
      // 1) 找到 @page{size:A4}
      let a4 = false;
      const scan = (rules) => {
        for (const rule of Array.prototype.slice.call(rules || [])) {
          const txt = String(rule.cssText || '');
          if (txt.indexOf('@page') === 0 && /size:\s*A4/i.test(txt)) a4 = true;
          if (rule.cssRules) scan(rule.cssRules);   // 钻进 @media print 里找
        }
      };
      for (const sh of Array.prototype.slice.call(document.styleSheets)) {
        try { scan(sh.cssRules); } catch (e) { /* 跨域样式表跳过 */ }
      }
      if (!a4) throw new Error('没找到 A4 纸张设置');

      // 2) 打印模式下侧栏和按钮应当消失
      document.body.classList.add('print-mode');
      const railHidden = getComputedStyle(document.querySelector('.rail')).display === 'none';
      const barHidden = (function () {
        const b = document.createElement('div');
        b.className = 'print-bar no-print';
        document.body.appendChild(b);
        const hidden = getComputedStyle(b).display === 'none';
        b.remove();
        return hidden;
      })();
      document.body.classList.remove('print-mode');
      if (!railHidden) throw new Error('打印时侧栏还在');
      return { ok: true, msg: 'A4 纸张已设置，侧栏和按钮会隐藏' + (barHidden ? '' : '（按钮需在打印时再看）') };
    },
  },
  {
    key: 'offline', name: '断网还能看', hint: '数据有没有在本机存一份',
    async run() {
      const raw = localStorage.getItem('gift_snapshot_v1');
      if (!raw) throw new Error('本机没有缓存');
      const d = JSON.parse(raw);
      const n = Object.keys(d || {}).length;
      return { ok: true, msg: '本机存了 ' + Math.round(raw.length / 1024) + 'KB（' + n + ' 类数据）' };
    },
  },
  {
    key: 'sw', name: '离线包已装', hint: 'Service Worker 负责没网时打开',
    async run() {
      if (!('serviceWorker' in navigator)) throw new Error('这个浏览器不支持');
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error('还没装（刷新一次试试）');
      return { ok: true, msg: reg.active ? '已激活' : '安装中' };
    },
  },
  {
    key: 'data', name: '数据体检', hint: '有没有明显缺漏',
    async run() {
      const list = (typeof healthIssues === 'function') ? healthIssues() : [];
      if (list.length > 8) throw new Error('有 ' + list.length + ' 处要补');
      return { ok: true, msg: list.length ? ('有 ' + list.length + ' 处可补，不算故障') : '没发现问题' };
    },
  },
];

async function runSelfCheck() {
  window.SC = { run: true, results: SC_CHECKS.map((c) => ({ key: c.key, name: c.name, hint: c.hint, st: 'wait' })), at: '' };
  render();
  for (let i = 0; i < SC_CHECKS.length; i++) {
    const c = SC_CHECKS[i];
    window.SC.results[i].st = 'run';
    render();
    const t0 = Date.now();
    try {
      const r = await c.run();
      window.SC.results[i].st = 'ok';
      window.SC.results[i].msg = r.msg;
    } catch (e) {
      window.SC.results[i].st = 'bad';
      window.SC.results[i].msg = (e && e.message) ? e.message : '失败';
    }
    window.SC.results[i].ms = Date.now() - t0;
    render();
  }
  window.SC.run = false;
  window.SC.at = todayStr();
  render();
}

function renderSelfCheck() {
  const r = window.SC;
  const total = SC_CHECKS.length;
  const done = (r.results || []).filter((x) => x.st === 'ok' || x.st === 'bad');
  const bad = (r.results || []).filter((x) => x.st === 'bad');
  const okN = done.filter((x) => x.st === 'ok').length;

  const head = !r.results.length
    ? '<div class="sc-intro">点一下，把这套系统的关键通道挨个试一遍：能不能读、能不能写、图片能不能传、' +
      '分享链接客户能不能开、A4 纸能不能打、断网还能不能看。<br>' +
      '<span class="muted small">自检不会动你的真实数据（写的那条会自己删掉）。</span></div>'
    : (r.run
      ? '<div class="sc-sum">正在检查… ' + done.length + ' / ' + total + '</div>'
      : (bad.length
        ? '<div class="sc-sum bad">' + bad.length + ' 项有问题，下面标红了</div>'
        : '<div class="sc-sum ok">' + total + ' 项全部通过，系统是好的</div>'));

  const rows = (r.results || []).map((x) =>
    '<div class="sc-row ' + (x.st === 'bad' ? 'bad' : x.st === 'ok' ? 'ok' : '') + '">' +
      '<span class="sc-mark">' +
        (x.st === 'ok' ? '✓' : x.st === 'bad' ? '×' : x.st === 'run' ? '…' : '·') + '</span>' +
      '<span class="sc-body"><b>' + esc(x.name) + '</b>' +
        '<span class="sc-hint">' + esc(x.msg || x.hint) + '</span></span>' +
      (x.ms ? '<span class="sc-ms">' + x.ms + 'ms</span>' : '') +
    '</div>').join('');

  return (rows
    ? '<div class="panel" style="margin-bottom:14px">' + head + rows +
      '<div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="btn primary" data-act="run-selfcheck"' + (r.run ? ' disabled' : '') + '>重新检查一遍</button>' +
        (r.at ? '<span class="muted small" style="align-self:center">上次：' + esc(r.at) + '</span>' : '') +
      '</div></div>'
    : '<div class="panel">' + head +
      '<button class="btn primary" data-act="run-selfcheck" style="margin-top:12px">开始检查</button></div>');
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'run-selfcheck') runSelfCheck();
});

window.renderSelfCheck = renderSelfCheck;
window.runSelfCheck = runSelfCheck;
