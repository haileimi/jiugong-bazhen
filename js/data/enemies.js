/**
 * enemies.js — 五魔将 + 魔王本体（第 8 将）
 * 字段：血/攻。魔将按牌序循环出牌（跳过阵亡）；魔将全灭后魔王本体解锁进攻。
 * 魔焰将（e3）为全体攻击。
 * 布局：魔王本体最上独占一行，魔将上 2 下 3 排列。
 */
(function (g) {
  'use strict';

  var GENERALS = [
    { id: 'e1', name: '蚀骨爪魔', element: '土', hp: 18, atk: 5, aoe: false },
    { id: 'e2', name: '浊流魔',   element: '水', hp: 16, atk: 4, aoe: false },
    { id: 'e3', name: '魔焰将',   element: '火', hp: 22, atk: 4, aoe: true },
    { id: 'e4', name: '赤炎魔',   element: '火', hp: 20, atk: 6, aoe: false },
    { id: 'e5', name: '狂煞魔',   element: '金', hp: 16, atk: 4, aoe: false }
  ];

  /** 魔王本体（第 8 将）：魔将全灭前被守护，不可被攻击 */
  var BOSS = { id: 'boss', name: '混沌·六爻魔', element: '土', hp: 100, atk: 6, aoe: false };

  g.DSH_ENEMIES = {
    GENERALS: GENERALS,
    BOSS: BOSS,
    byId: function (id) {
      if (id === BOSS.id) return BOSS;
      for (var i = 0; i < GENERALS.length; i++) if (GENERALS[i].id === id) return GENERALS[i];
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
