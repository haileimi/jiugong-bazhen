/**
 * elements.js — 五行系统
 * 克制环：金 → 木 → 土 → 水 → 火 → 金（前者克后者）
 * 克制 ×1.3 / 被克 ×0.7 / 无关 ×1.0
 */
(function (g) {
  'use strict';

  var RING = ['金', '木', '土', '水', '火'];

  /** 前者克后者 */
  var BEATS = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' };

  /** 克制系数：att 攻击 def */
  function counterMult(att, def) {
    if (att === def) return 1.0;
    if (BEATS[att] === def) return 1.3; // 克制
    if (BEATS[def] === att) return 0.7; // 被克
    return 1.0;
  }

  /** 界面用五行颜色 */
  var COLOR = { 金: '#d4af37', 木: '#4caf50', 土: '#8d6e63', 水: '#42a5f5', 火: '#ef5350' };

  /** 界面用五行文字图标 */
  var ICON = { 金: '金', 木: '木', 土: '土', 水: '水', 火: '火' };

  g.DSH_ELEMENTS = {
    RING: RING,
    BEATS: BEATS,
    counterMult: counterMult,
    COLOR: COLOR,
    ICON: ICON,
    /** 是否合法五行 */
    isValid: function (el) { return RING.indexOf(el) >= 0; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
