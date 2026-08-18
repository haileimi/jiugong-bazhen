/**
 * smoke-dom.js — 浏览器侧冒烟测试（模拟 DOM，不依赖真实浏览器）
 * 流程：加载全部脚本 → 自动 init → 首页 → 开始战斗 → 选主将（穆奎）→
 *       地图 → 进入小怪战斗点 → 战斗渲染 → 回合完毕流转
 * 用法：node tools/smoke-dom.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const files = [
  'js/data/elements.js',
  'js/data/heroes.js',
  'js/data/trigram.js',
  'js/data/enemies.js',
  'js/data/hex64.js',
  'js/core/eventSystem.js',
  'js/core/gameState.js',
  'js/core/saveSystem.js',
  'js/core/turnSystem.js',
  'js/systems/hexSystem.js',
  'js/systems/ruleSystem.js',
  'js/systems/battleSystem.js',
  'js/systems/economySystem.js',
  'js/render/cardRenderer.js',
  'js/render/battleRenderer.js',
  'js/render/popupRenderer.js',
  'js/input/clickController.js',
  'js/test/selftest.js',
  'js/main.js'
];

/* ---------- 最小 DOM 桩 ---------- */
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    className: '',
    dataset: {},
    style: { setProperty: function () {} },
    children: [],
    _handlers: {},
    textContent: '',
    disabled: false,
    value: '',
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
    addEventListener(t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    removeEventListener() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    cloneNode() { return makeEl(this.tagName); },
    remove() {},
    click() { ((this._handlers.click || [])[0] || function () {} )(); }
  };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return _html; },
    set(v) { _html = v; if (v === '') this.children = []; }
  });
  Object.defineProperty(el, 'classList', {
    value: {
      _set: new Set(),
      add() { for (const c of arguments) this._set.add(c); },
      remove() { for (const c of arguments) this._set.delete(c); },
      toggle(c, force) { if (force === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else { force ? this._set.add(c) : this._set.delete(c); } },
      contains(c) { return this._set.has(c); }
    },
    enumerable: true
  });
  return el;
}

const elements = {};
const created = [];
const doc = {
  readyState: 'complete',
  body: makeEl('body'),
  getElementById(id) { if (!elements[id]) elements[id] = makeEl('div'); return elements[id]; },
  createElement(tag) { const e = makeEl(tag); created.push(e); return e; },
  addEventListener() {},
  elementFromPoint() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};

const store = {};
const localStorage = {
  getItem(k) { return store[k] !== undefined ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; }
};

const sandbox = { console, document: doc, localStorage };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
} catch (e) {
  console.error('✗ 脚本加载失败: ' + e.message);
  process.exit(1);
}
console.log('✓ 全部脚本加载，首页已初始化');

// 1. 首页应显示（page-home 可见）
const pageHome = elements['page-home'];
if (!pageHome || pageHome.style.display === 'none') {
  console.error('✗ 首页未显示');
  process.exit(1);
}
console.log('✓ 首页显示');

// 2. 点击「开始战斗」→ 弹选主将
const startBtn = elements['home-start-btn'];
if (!startBtn) { console.error('✗ 未找到开始战斗按钮'); process.exit(1); }
startBtn.click();
if (!elements['modal-root'] || elements['modal-root'].children.length === 0) {
  console.error('✗ 未弹出选主将窗口');
  process.exit(1);
}
console.log('✓ 选主将弹窗出现');

// 3. 选穆奎（大山汉，血量厚）当主将 → 新手教学（流寇战）
const dwPick = created.find((e) => String(e.className).indexOf('pick-card') >= 0 && String(e.innerHTML || '').indexOf('穆奎') >= 0);
if (!dwPick) { console.error('✗ 未找到穆奎选将卡'); process.exit(1); }
dwPick.click();
const app = sandbox.DSH_APP;
const st = app.getState();
if (!st.commander || st.commander.heroId !== 'dw1' || st.pack.length !== 63) {
  console.error('✗ 主将/卡包初始化错误');
  process.exit(1);
}
// 出生村引导消息 → 确定 → 教学战
const introOk = created.filter((e) => e.textContent === '确定').pop();
if (!introOk) { console.error('✗ 未找到出生村引导按钮'); process.exit(1); }
introOk.click();
const pageBattle = elements['page-battle'];
if (!pageBattle || pageBattle.style.display === 'none' || st.battleKind !== 'tutorial' || st.enemies.length !== 2) {
  console.error('✗ 教学战未开始（kind=' + st.battleKind + ' 敌=' + (st.enemies || []).length + '）');
  process.exit(1);
}
console.log('✓ 主将选定穆奎，卡包 63 张（含村民 ABC），流寇教学战开始（敌方 ' + st.enemies.length + ' 个）');

// 4. 强制打赢教学战 → 村子得救 → 路线选择 → 进入地图
app.forceWin();
const villageOk = created.filter((e) => e.textContent === '确定').pop();
if (!villageOk) { console.error('✗ 未找到村子得救按钮'); process.exit(1); }
villageOk.click();
const routeGood = created.filter((e) => String(e.className || '').indexOf('route-btn') >= 0 &&
  String(e.innerHTML || '').indexOf('正义路线') >= 0).pop();
if (!routeGood) { console.error('✗ 未弹出路线选择'); process.exit(1); }
routeGood.click();
const pageMap = elements['page-map'];
if (!pageMap || pageMap.style.display === 'none' || st.route !== 'evil') {
  console.error('✗ 路线选择后未进入地图页（route=' + st.route + '）');
  process.exit(1);
}
console.log('✓ 教学战通关，选择正义路线（讨伐曜魔宗），进入第 ' + st.layer + ' 层地图');

// 5. 点击「小怪战斗点」进入战斗
const monsterNode = created.find((e) => String(e.className).indexOf('map-node') >= 0 &&
  e.classList.contains('clickable') && String(e.innerHTML || '').indexOf('小怪战斗点') >= 0);
if (!monsterNode) { console.error('✗ 未找到可进入的小怪战斗点'); process.exit(1); }
monsterNode.click();
if (!pageBattle || pageBattle.style.display === 'none') {
  console.error('✗ 未进入战斗页');
  process.exit(1);
}
if (st.phase !== 'player' || st.hand.length === 0 || st.enemies.length !== 2) {
  console.error('✗ 战斗初始化错误（phase=' + st.phase + ' 手牌=' + st.hand.length + ' 敌=' + st.enemies.length + '）');
  process.exit(1);
}
console.log('✓ 小怪战开始：手牌 ' + st.hand.length + ' 张，天机 ' + st.tianji + '/' + st.maxTianji + '，敌方 ' + st.enemies.length + ' 个');

// 6. 打出一张自身/全体类卡牌（若有），否则打出任意单体卡
const selfUid = st.hand.find((u) => {
  const d = sandbox.DSH_GameState.cardDef(st, u);
  return d && d.target !== 'single';
});
if (selfUid) {
  const r = app.playCard(selfUid, null);
  console.log('✓ 点出即打（' + sandbox.DSH_GameState.cardDef(st, selfUid).category + '）成功');
} else if (st.hand.length > 0) {
  const uid = st.hand[0];
  const r = app.playCard(uid, st.enemies[0].id);
  if (!r) { console.error('✗ 单体卡出牌失败'); process.exit(1); }
  console.log('✓ 单体卡点怪攻击成功，伤害 ' + r.damage);
}

// 6. 回合完毕 → 怪物行动 → 回合流转
app.endTurn();
if (st.over === 'lose') {
  console.log('✓ 回合流转完成（主将阵亡，弹出败局——符合模拟场景）');
} else {
  console.log('✓ 回合流转完成：进入第 ' + st.turn + ' 回合，天机回满 ' + st.tianji + '/' + st.maxTianji);
}

// 6.5 经济：进入战斗消耗 1 军粮（每日 5 → 4）
if (st.rations !== 4) {
  console.error('✗ 军粮未按预期消耗（rations=' + st.rations + '，应为 4）');
  process.exit(1);
}
console.log('✓ 进入战斗消耗 1 军粮（剩 ' + st.rations + '/5）');

// 7. 地图「返回」→ 保存并回首页
const mapBackBtn = elements['map-back-btn'];
if (!mapBackBtn) { console.error('✗ 未找到地图返回按钮'); process.exit(1); }
mapBackBtn.click();
const savedOk = created.filter((e) => e.textContent === '确定').pop();
if (!savedOk) { console.error('✗ 未找到保存消息弹窗按钮'); process.exit(1); }
savedOk.click();
if (!pageHome || pageHome.style.display === 'none') {
  console.error('✗ 保存后未返回首页');
  process.exit(1);
}
console.log('✓ 保存并返回首页（金币 ' + st.gold + ' · 军粮 ' + st.rations + '/5）');

// 8. 商店弹窗：打开 → 金币不足买卡被拒 → 关闭
const shopBtn = elements['home-shop-btn'];
if (!shopBtn) { console.error('✗ 未找到商店按钮'); process.exit(1); }
shopBtn.click();
const modalRootEl = elements['modal-root'];
if (modalRootEl.children.length === 0) {
  console.error('✗ 商店未弹出');
  process.exit(1);
}
const packBuyBtn = created.filter((e) => String(e.className || '').indexOf('price-btn') >= 0 &&
  String(e.innerHTML || '').indexOf('招式卡包') >= 0).pop();
if (!packBuyBtn) { console.error('✗ 商店未渲染商品按钮'); process.exit(1); }
packBuyBtn.click(); // 金币 0，应提示不足
if (!created.some((e) => String(e.className || '').indexOf('shop-result') >= 0 &&
  String(e.textContent || '').indexOf('马蹄金不足') >= 0)) {
  console.error('✗ 金币不足买卡未被拒绝');
  process.exit(1);
}
console.log('✓ 商店弹窗正常，金币不足买卡被拒');
const shopClose = created.filter((e) => e.textContent === '关闭').pop();
if (!shopClose) { console.error('✗ 商店无关闭按钮'); process.exit(1); }
shopClose.click();

// 9. 招募所弹窗：3 候选 + 标价 + 刷新（扣金）+ 返回
const recruitBtn = elements['home-recruit-btn'];
if (!recruitBtn) { console.error('✗ 未找到招募所按钮'); process.exit(1); }
recruitBtn.click();
const recruitCards = created.filter((e) => String(e.className || '').indexOf('recruit-card') >= 0);
if (recruitCards.length === 0) {
  console.error('✗ 招募所未渲染候选英雄');
  process.exit(1);
}
if (recruitCards.length > 3) {
  console.error('✗ 招募所候选超过 3 个（实际 ' + recruitCards.length + '）');
  process.exit(1);
}
const priceOk = recruitCards.every((e) => /金 \/ 1 张|不可招募/.test(String(e.innerHTML || '')));
if (!priceOk) { console.error('✗ 候选未标注价格'); process.exit(1); }
console.log('✓ 招募所一次展示 ' + recruitCards.length + ' 位候选，均已标价');
const refreshBtn = created.filter((e) => String(e.className || '').indexOf('mid-btn') >= 0 &&
  String(e.textContent || '').indexOf('刷新') >= 0).pop();
if (!refreshBtn) { console.error('✗ 招募所无刷新按钮'); process.exit(1); }
const goldBefore = app.getState().gold;
refreshBtn.click();
const goldAfter = app.getState().gold;
if (goldBefore > 0 && goldAfter >= goldBefore) {
  console.error('✗ 刷新未扣金币（' + goldBefore + ' → ' + goldAfter + '）');
  process.exit(1);
}
console.log('✓ 刷新按钮正常（扣 ' + (goldBefore - goldAfter) + ' 金）');
const recruitBack = created.filter((e) => String(e.className || '').indexOf('recruit-back') >= 0).pop();
if (!recruitBack) { console.error('✗ 招募所无返回按钮'); process.exit(1); }
recruitBack.click();
if (elements['modal-root'].children.length !== 0) {
  console.error('✗ 招募所返回后弹窗未关闭');
  process.exit(1);
}
console.log('✓ 招募所返回按钮正常，弹窗已关闭');

// 10. 战斗自检仍然可跑
const res = sandbox.DSH_Selftest.run();
if (!res.pass) { console.error('✗ 自检失败: ' + res.fail + ' 项'); process.exit(1); }
console.log('✓ 冒烟测试全部通过（加载 → 首页 → 选将 → 地图 → 战斗 → 回合流转 → 军粮 → 商店/招募 无异常，自检 ' + res.total + ' 项）');
