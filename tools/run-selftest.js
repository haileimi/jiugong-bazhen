/**
 * run-selftest.js — Node 环境运行规则自检（不依赖浏览器 DOM）
 * 用法：node tools/run-selftest.js
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
  'js/test/selftest.js'
];

const sandbox = { console: console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of files) {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

const res = sandbox.DSH_Selftest.run();
console.log('========================================');
console.log('规则自检结果：' + (res.pass ? '✓ 全部通过' : '✗ 存在失败'));
console.log('总断言：' + res.total + ' 项（通过 ' + res.ok + '，失败 ' + res.fail + '）');
console.log('========================================');
const fails = res.details.filter((d) => !d.pass);
if (fails.length) {
  fails.slice(0, 40).forEach((d) => console.log('FAIL: ' + d.name + (d.msg ? ' —— ' + d.msg : '')));
  process.exit(1);
}
console.log('✓ 无失败断言');
