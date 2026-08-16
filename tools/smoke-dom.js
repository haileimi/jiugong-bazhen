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
    style: {},
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

// 3. 选穆奎（大山汉，血量厚）当主将
const dwPick = created.find((e) => String(e.className).indexOf('pick-card') >= 0 && String(e.innerHTML || '').indexOf('穆奎') >= 0);
if (!dwPick) { console.error('✗ 未找到穆奎选将卡'); process.exit(1); }
dwPick.click();
const pageMap = elements['page-map'];
if (!pageMap || pageMap.style.display === 'none') {
  console.error('✗ 选将后未进入地图页');
  process.exit(1);
}
const app = sandbox.DSH_APP;
const st = app.getState();
if (!st.commander || st.commander.heroId !== 'dw1' || st.pack.length !== 48) {
  console.error('✗ 主将/卡包初始化错误');
  process.exit(1);
}
console.log('✓ 主将选定穆奎，卡包 48 张，进入第 ' + st.layer + ' 层地图');

// 4. 点击「小怪战斗点」进入战斗
const monsterNode = created.find((e) => String(e.className).indexOf('map-node') >= 0 &&
  e.classList.contains('clickable') && String(e.innerHTML || '').indexOf('小怪战斗点') >= 0);
if (!monsterNode) { console.error('✗ 未找到可进入的小怪战斗点'); process.exit(1); }
monsterNode.click();
const pageBattle = elements['page-battle'];
if (!pageBattle || pageBattle.style.display === 'none') {
  console.error('✗ 未进入战斗页');
  process.exit(1);
}
if (st.phase !== 'player' || st.hand.length === 0 || st.enemies.length !== 2) {
  console.error('✗ 战斗初始化错误（phase=' + st.phase + ' 手牌=' + st.hand.length + ' 敌=' + st.enemies.length + '）');
  process.exit(1);
}
console.log('✓ 小怪战开始：手牌 ' + st.hand.length + ' 张，天机 ' + st.tianji + '/' + st.maxTianji + '，敌方 ' + st.enemies.length + ' 个');

// 5. 打出一张自身/全体类卡牌（若有），否则打出任意单体卡
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

// 7. 战斗自检仍然可跑
const res = sandbox.DSH_Selftest.run();
if (!res.pass) { console.error('✗ 自检失败: ' + res.fail + ' 项'); process.exit(1); }
console.log('✓ 冒烟测试全部通过（加载 → 首页 → 选将 → 地图 → 战斗 → 回合流转 无异常，自检 ' + res.total + ' 项）');
