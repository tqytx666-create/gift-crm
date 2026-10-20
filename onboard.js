/* 新手引导 —— 五步把系统跑通 */

const ONBOARD_KEY = 'gift_onboard_dismissed';

function onboardDone() {
  try { return localStorage.getItem(ONBOARD_KEY) === '1'; } catch (e) { return false; }
}
function dismissOnboard() {
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) { /* 隐私模式 */ }
  render();
}
function showOnboardAgain() {
  try { localStorage.removeItem(ONBOARD_KEY); } catch (e) { /* 忽略 */ }
  location.hash = '#inbox';
  render();
  toast('开工清单回来了');
}

function onboardSteps() {
  const sh = S.settings || {};
  return [
    {
      ok: !!sh.shop_name, title: '填店铺信息',
      text: '名字、电话、地址、logo。填一次，以后每张报价单和方案都会自动带上。',
      act: 'edit-shop', btn: '去填',
    },
    {
      ok: (S.customers || []).length > 0, title: '录第一个客户',
      text: '公司名写「城市 + 店名 + 品牌」，品牌这一列最关键——拼单全靠它。',
      act: 'add-customer', btn: '去录',
    },
    {
      ok: (S.skus || []).length > 0, title: '建第一个产品',
      text: '产品库里建：厂家 → 产品 → 规格，填上成本和起订量。报价才算得准。',
      act: 'go-products', btn: '去建',
    },
    {
      ok: (S.quotes || []).length > 0, title: '报第一份价',
      text: '选客户、加商品、改加价率，算完点「存成报价单」。',
      act: 'go-quote', btn: '去报价',
    },
    {
      ok: (S.shares || []).length > 0, title: '发出第一条分享链接',
      text: '在报价单里点「分享给客户」，链接直接发微信，客户点开就能看，还能知道看没看。',
      act: 'go-orders', btn: '去发',
    },
  ];
}

function onboardHtml() {
  if (onboardDone()) return '';
  const steps = onboardSteps();
  const doneCount = steps.filter((s) => s.ok).length;
  if (doneCount >= steps.length) {
    // 全做完了：让他点一下收起来
    return '<div class="onb-card done">' +
      '<div class="onb-head"><b>五步都做完了，这套系统你已经会用到底了</b>' +
      '<button class="btn sm" data-act="dismiss-onboard">收起来</button></div>' +
      '<div class="onb-sub">以后想再看，去「数据」页点「重看开工清单」。</div></div>';
  }

  const rows = steps.map((s, i) =>
    '<div class="g-step ' + (s.ok ? 'done' : '') + '">' +
      '<div class="gs-mark">' + (s.ok ? '✓' : (i + 1)) + '</div>' +
      '<div class="gs-body"><div class="gs-title">' + s.title + '</div>' +
      '<div class="gs-text">' + s.text + '</div></div>' +
      (s.ok ? '' : '<button class="btn sm" data-act="' + s.act + '">' + s.btn + '</button>') +
    '</div>').join('');

  return '<div class="onb-card">' +
    '<div class="onb-head"><b>开工清单</b>' +
      '<span class="onb-prog">' + doneCount + ' / ' + steps.length + ' 完成</span></div>' +
    '<div class="onb-sub">照着做完这五步，这套系统就算跑通了。做完一步自动打勾。</div>' +
    rows +
    '<div class="onb-foot"><button class="btn sm ghost" data-act="dismiss-onboard">先跳过，我知道怎么用</button></div>' +
  '</div>';
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'dismiss-onboard') { dismissOnboard(); return; }
  if (el.dataset.act === 'show-onboard') { showOnboardAgain(); return; }
});

window.onboardHtml = onboardHtml;
window.showOnboardAgain = showOnboardAgain;
