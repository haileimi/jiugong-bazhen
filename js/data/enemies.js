/**
 * enemies.js — 双阵营 + 教学流寇（v3.10 善恶世界观）
 *
 * 世界：主角是雇佣兵。两大势力：
 *   山河盟（正义联盟：厚岳守护 + 青榆生命 + 玄锋秩序）—— 官军
 *   曜魔宗（邪恶组织：赤曜征服 + 沧澜暗流）—— 魔军
 * 玩家按「路线」选择本层讨伐哪一方军队；层末可自由选择打善/恶 boss，
 * 善恶值（meta，-10~+10）随之改变：打善boss=-10（杀善者=恶，被官军通缉）、打恶boss=+10（义士）。
 *
 * 字段：血/攻/定位（category：战斗/护卫/计谋，用于部门区摆放）。
 */
(function (g) {
  'use strict';

  /* ============ 曜魔宗（邪恶组织）魔军 ============ */
  var GENERALS = [
    { id: 'e1', name: '蚀骨爪魔', element: '土', hp: 18, atk: 5, aoe: false, category: '战斗' },
    { id: 'e2', name: '浊流魔',   element: '水', hp: 16, atk: 4, aoe: false, category: '计谋' },
    { id: 'e3', name: '魔焰将',   element: '火', hp: 22, atk: 4, aoe: true,  category: '护卫' },
    { id: 'e4', name: '赤炎魔',   element: '火', hp: 20, atk: 6, aoe: false, category: '战斗' },
    { id: 'e5', name: '狂煞魔',   element: '金', hp: 16, atk: 4, aoe: false, category: '计谋' }
  ];

  /** 曜魔宗主（恶boss）：魔将全灭前被守护，不可被攻击 */
  var BOSS = { id: 'boss', name: '曜魔宗主·六爻魔', element: '土', hp: 100, atk: 6, aoe: false, category: '战斗' };

  /* ============ 山河盟（正义联盟）官军 ============ */
  var GUANJUN = [
    { id: 'g1', name: '铁甲卫', element: '土', hp: 20, atk: 5, aoe: false, category: '护卫' },
    { id: 'g2', name: '弓弩营', element: '木', hp: 15, atk: 4, aoe: true,  category: '护卫' },
    { id: 'g3', name: '枪骑营', element: '金', hp: 18, atk: 6, aoe: false, category: '战斗' },
    { id: 'g4', name: '执法官', element: '火', hp: 17, atk: 5, aoe: false, category: '战斗' },
    { id: 'g5', name: '天机方士', element: '水', hp: 15, atk: 4, aoe: false, category: '计谋' }
  ];

  /** 山河盟主（善boss）：魔将全灭前被守护，不可被攻击 */
  var BOSS_GOOD = { id: 'boss-good', name: '山河盟主·镇岳王', element: '土', hp: 110, atk: 7, aoe: false, category: '战斗' };

  /* ============ 流寇（新手教学，弱） ============ */
  var BANDITS = [
    { id: 'l1', name: '流寇头目', element: '土', hp: 10, atk: 3, aoe: false, category: '战斗' },
    { id: 'l2', name: '流寇喽啰', element: '火', hp: 6,  atk: 2, aoe: false, category: '战斗' }
  ];

  /** 阵营军队（按路线）：route 'good' = 打官军（山河盟）；否则打魔军（曜魔宗） */
  function armyOf(route) {
    return route === 'good' ? GUANJUN : GENERALS;
  }

  /** 按善恶选择取 boss：bossChoice 'good' = 善boss（山河盟主）；否则恶boss（曜魔宗主） */
  function bossOf(bossChoice) {
    return bossChoice === 'good' ? BOSS_GOOD : BOSS;
  }

  g.DSH_ENEMIES = {
    GENERALS: GENERALS,
    BOSS: BOSS,
    GUANJUN: GUANJUN,
    BOSS_GOOD: BOSS_GOOD,
    BANDITS: BANDITS,
    armyOf: armyOf,
    bossOf: bossOf,
    byId: function (id) {
      var all = GENERALS.concat(GUANJUN).concat(BANDITS);
      if (id === BOSS.id) return BOSS;
      if (id === BOSS_GOOD.id) return BOSS_GOOD;
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
