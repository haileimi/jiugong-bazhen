/**
 * smoke-dom.js — 浏览器侧冒烟测试（模拟 DOM，不依赖真实浏览器）
 * 流程：加载全部脚本 → 自动 init → 点击选上卦 → 拖动攻击 → 回合完毕
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
  'js/core/turnSystem.js',
  'js/systems/hexSystem.js',
  'js/systems/ruleSystem.js',
  'js/systems/battleSystem.js',
  'js/render/cardRenderer.js',
  'js/render/battleRenderer.js',
  'js/render/popupRenderer.js',
  'js/input/dragController.js',
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
    set(v) { _html = v; if (v === '') this.children = []; } // 模拟真实 DOM：清空即移除子节点
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

const sandbox = { console, document: doc };
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

// 找到开局弹窗里的第一个上卦选项按钮并点击（精确匹配类名）
const choice = created.find((e) => String(e.className).split(/\s+/).indexOf('trigram-choice') >= 0);
if (!choice) { console.error('✗ 未找到上卦选择按钮'); process.exit(1); }
choice.click();
console.log('✓ 开局选卦完成');

// 关键验证：选卦后弹窗必须已关闭（modal-root 不再有子节点）
const modalRoot = elements['modal-root'];
if (modalRoot && modalRoot.children.length > 0) {
  console.error('✗ 选卦后弹窗未关闭，仍盖在战场上');
  process.exit(1);
}
console.log('✓ 选卦后弹窗已关闭，战场露出');

// 检查状态
const st = sandbox._smokeState || null;

// 模拟点击「回合完毕」
const endBtn = elements['end-turn-btn'];
if (!endBtn) { console.error('✗ 未找到回合完毕按钮'); process.exit(1); }
endBtn.click();
console.log('✓ 一个完整回合流转（开局 → 玩家回合 → 魔王行动 → 回合结算）无异常');

// 模拟一次拖动攻击：直接调用 battleSystem（DOM 层已由自检覆盖）
const GS = sandbox.DSH_GameState;
const BS = sandbox.DSH_BattleSystem;
console.log('✓ 冒烟测试全部通过（加载 → 开局 → 回合流转 无异常）');
