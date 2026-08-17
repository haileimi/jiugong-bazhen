/**
 * fix-index-encoding.js — 一次性修复脚本：从 git 干净版本重建 index.html
 * 原因：v3.9 用 PowerShell Set-Content 写文件导致中文乱码（GBK 误读 UTF-8）。
 * 用法：node tools/fix-index-encoding.js
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'index.html');

// 1. 从 git 取干净版本（40fbdfb，UTF-8 原始字节）
const clean = execSync('git show 40fbdfb:index.html', { encoding: 'utf8', cwd: root });
if (clean.indexOf('九宫八阵') < 0) {
  console.error('✗ 模板不含正常中文，中止');
  process.exit(1);
}

// 2. 版本号 25 → 27（v3.8 → v3.10）
let out = clean.split('?v=25').join('?v=27');

// 3. 插入 economySystem.js（v3.9 新增）
const anchor = '  <script src="js/systems/battleSystem.js?v=27"></script>';
if (out.indexOf(anchor) < 0) {
  console.error('✗ 未找到 battleSystem 锚点');
  process.exit(1);
}
out = out.replace(anchor, anchor + '\n  <script src="js/systems/economySystem.js?v=27"></script>');

// 4. 写入（Node utf8 = 无 BOM，绝不乱码）
fs.writeFileSync(file, out, 'utf8');
console.log('✓ index.html 重建完成（干净 UTF-8，v=27，含 economySystem）');
