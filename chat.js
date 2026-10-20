/* 贴聊天 —— 把微信里那几句粘进来，自动抠出数量、预算、日期、产品 */

const INTENT_WORDS = [
  ['报价', '要报价'], ['报个价', '要报价'], ['报一下', '要报价'], ['什么价', '要报价'],
  ['多少钱', '要报价'], ['方案', '要方案'], ['打样', '要打样'],
  ['下单', '要下单'], ['定金', '定金'], ['尾款', '尾款'],
  ['发货', '发货'], ['便宜', '在压价'], ['再想想', '在犹豫'],
  ['考虑', '在犹豫'], ['月底', '月底节点'], ['开业', '开业活动'],
  ['双十一', '双十一'], ['店庆', '店庆'], ['活动', '做活动'],
];

function extractFacts(raw) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  const facts = { qty: null, unit: '', budget: null, date: '', products: [], intents: [] };
  if (!t) return facts;

  // 数量：100套 / 300 个
  let m = t.match(/(\d{1,5})\s*(套|个|件|台|份|盒|把|只|条)/);
  if (m) { facts.qty = Number(m[1]); facts.unit = m[2]; }

  // 预算/单价：5块以内 / 单价 5 元 / 8块钱
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:块|元)(?:\s*(?:以内|以下|左右))?/);
  if (m) facts.budget = Number(m[1]);

  // 日期：10月25日 / 周五 / 明天 / 月底
  m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/)
    || t.match(/(今天|明天|后天|大后天|本周[一二三四五六日天]?|下周[一二三四五六日天]|周[一二三四五六日天]|月底|月底前|月初)/);
  if (m) facts.date = m[0];

  // 产品：拿产品库的名字去对（客户嘴上只会说「保温杯」，不会说「不锈钢保温杯」）
  const CORE_STRIP = ['不锈钢', '铝合金', '纯棉', '环保', '定制', '加厚', '便携', '大容量', '家用'];
  const core = (n) => {
    let x = n;
    CORE_STRIP.forEach((w) => { x = x.split(w).join(''); });
    return x;
  };
  const names = (S.products || []).map((p) => p.name).filter((n) => n && n.length > 1);
  facts.products = names.filter((n) => {
    if (t.indexOf(n) >= 0) return true;
    const c = core(n);
    if (c.length >= 2 && t.indexOf(c) >= 0) return true;
    if (n.length >= 3 && t.indexOf(n.slice(-3)) >= 0) return true;
    return false;
  }).slice(0, 5);

  // 意图
  const hit = {};
  INTENT_WORDS.forEach(([kw, label]) => {
    if (t.indexOf(kw) >= 0) hit[label] = 1;
  });
  facts.intents = Object.keys(hit);

  return facts;
}

function factsLine(f) {
  const bits = [];
  if (f.qty) bits.push(f.qty + (f.unit || '套'));
  if (f.budget) bits.push('单价 ' + f.budget + ' 元');
  if (f.date) bits.push(f.date);
  if (f.products.length) bits.push(f.products.join('/'));
  if (f.intents.length) bits.push(f.intents.join('、'));
  return bits.length ? '〔识别：' + bits.join(' · ') + '〕' : '';
}

function openPasteChat(customerId) {
  const c = byId(S.customers, customerId) || {};
  openForm('记一笔 · ' + (c.company || '客户'), [
    {
      key: 'raw', label: '把微信里那几句粘进来', type: 'textarea', full: true,
      ph: '王总：那个保温杯要 100 套，5 块以内的，周五给我答复',
    },
    {
      key: 'result', label: '归到哪类', type: 'select',
      options: ['聊了', '已报价', '已发方案', '已成交', '没接', '再等等'],
    },
    { key: 'date', label: '日期', def: todayStr() },
  ], {}, async (b) => {
    const raw = String(b.raw || '').trim();
    if (!raw) return toast('先粘点内容进来');
    const f = extractFacts(raw);
    const line = factsLine(f);
    const body = raw.slice(0, 400) + (line ? '\n' + line : '');

    await rest('followups', '', {
      method: 'POST',
      body: sanitize({
        customer_id: Number(customerId),
        date: b.date || todayStr(),
        result: b.result || '聊了',
        content: body,
      }),
    });
    await rest('customers', '?id=eq.' + customerId, {
      method: 'PATCH',
      body: { last_contact: b.date || todayStr() },
    });
    await loadAll();
    if (typeof openCustomer === 'function') openCustomer(customerId);
    render();
    toast(line ? '记好了，' + line.replace(/[〔〕]/g, '') : '记好了');
  });
}

window.extractFacts = extractFacts;
window.openPasteChat = openPasteChat;
