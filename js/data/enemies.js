/**
 * enemies.js — 敌方英雄卡（v3.10 全角色卡牌模型）
 *
 * 世界：主角是雇佣兵。两大势力：
 *   山河盟（正义联盟：厚岳守护 + 青榆生命 + 玄锋秩序）—— 官军
 *   曜魔宗（邪恶组织：赤曜征服 + 沧澜暗流）—— 魔军
 * 玩家按「路线」选择本层讨伐哪一方军队；层末可自由选择打善/恶 boss，
 * 善恶值（meta，-10~+10）随之改变：打善boss=-10（杀善者=恶，被官军通缉）、打恶boss=+10（义士）。
 *
 * 全角色英雄字段：攻击(atk)/防御/种类(category)/血量(hp)/技能/主将天赋/姓名/诨号/
 * 立绘/头像/关键数值/简介/五行/善恶值/速度/射程（主将天赋敌方恒为 null——敌方不会是主将）。
 * 战斗仍用 atk/hp/aoe；heroView() 给出完整英雄视图供卡面展示。
 */
(function (g) {
  'use strict';

  function heroTemplate() {
    return { defense: 1, alignment: 0, speed: 5, range: 1, skill: null, talent: null, portrait: '', avatar: '' };
  }
  function H(e, extra) {
    var t = heroTemplate();
    t.id = e.id; t.name = e.name; t.nick = e.nick || e.name;
    t.category = e.category || '战斗'; t.element = e.element;
    t.hp = e.hp; t.atk = e.atk; t.aoe = !!e.aoe;
    t.desc = e.desc || ('敌方' + t.category + '单位');
    t.defense = e.defense !== undefined ? e.defense : t.defense;
    t.alignment = e.alignment !== undefined ? e.alignment : t.alignment;
    t.speed = e.speed !== undefined ? e.speed : t.speed;
    t.range = e.range !== undefined ? e.range : t.range;
    if (extra) for (var k in extra) t[k] = extra[k];
    return t;
  }

  /* ============ 曜魔宗（邪恶组织）魔军 ============ */
  var GENERALS = [
    H({ id: 'e1', name: '蚀骨爪魔', nick: '噬骨', category: '战斗', element: '土', hp: 18, atk: 5, aoe: false, defense: 1, alignment: -4, speed: 5, range: 1, desc: '魔爪撕裂敌人，曜魔宗先锋。' }),
    H({ id: 'e2', name: '浊流魔', nick: '暗涌', category: '计谋', element: '水', hp: 16, atk: 4, aoe: false, defense: 1, alignment: -3, speed: 6, range: 3, desc: '以浊水之术惑乱军心。' }),
    H({ id: 'e3', name: '魔焰将', nick: '焚野', category: '护卫', element: '火', hp: 22, atk: 4, aoe: true, defense: 2, alignment: -5, speed: 4, range: 2, desc: '魔焰焚野，全体灼烧。' }),
    H({ id: 'e4', name: '赤炎魔', nick: '灼心', category: '战斗', element: '火', hp: 20, atk: 6, aoe: false, defense: 1, alignment: -4, speed: 5, range: 1, desc: '曜魔宗精锐打手。' }),
    H({ id: 'e5', name: '狂煞魔', nick: '煞气', category: '计谋', element: '金', hp: 16, atk: 4, aoe: false, defense: 1, alignment: -3, speed: 6, range: 3, desc: '以煞气削弱来敌。' })
  ];

  /** 曜魔宗主（恶boss）：魔将全灭前被守护，不可被攻击 */
  var BOSS = H({ id: 'boss', name: '曜魔宗主·六爻魔', nick: '六爻', category: '战斗', element: '土', hp: 100, atk: 6, aoe: false, defense: 3, alignment: -10, speed: 6, range: 2, desc: '以六爻魔道统御群魔，曜魔宗之主。' });

  /* ============ 山河盟（正义联盟）官军 ============ */
  var GUANJUN = [
    H({ id: 'g1', name: '铁甲卫', nick: '铁壁', category: '护卫', element: '土', hp: 20, atk: 5, aoe: false, defense: 3, alignment: 3, speed: 4, range: 1, desc: '山河盟重甲卫士，阵前坚盾。' }),
    H({ id: 'g2', name: '弓弩营', nick: '穿杨', category: '护卫', element: '木', hp: 15, atk: 4, aoe: true, defense: 1, alignment: 2, speed: 5, range: 3, desc: '官军弓手，齐射如雨。' }),
    H({ id: 'g3', name: '枪骑营', nick: '破阵', category: '战斗', element: '金', hp: 18, atk: 6, aoe: false, defense: 2, alignment: 3, speed: 6, range: 2, desc: '山河盟铁骑，冲锋破阵。' }),
    H({ id: 'g4', name: '执法官', nick: '执法', category: '战斗', element: '火', hp: 17, atk: 5, aoe: false, defense: 2, alignment: 4, speed: 5, range: 1, desc: '维护山河盟法度的剑士。' }),
    H({ id: 'g5', name: '天机方士', nick: '观局', category: '计谋', element: '水', hp: 15, atk: 4, aoe: false, defense: 1, alignment: 3, speed: 5, range: 3, desc: '以天机术辅助官军。' })
  ];

  /** 山河盟主（善boss）：魔将全灭前被守护，不可被攻击 */
  var BOSS_GOOD = H({ id: 'boss-good', name: '山河盟主·镇岳王', nick: '镇岳', category: '战斗', element: '土', hp: 110, atk: 7, aoe: false, defense: 4, alignment: 10, speed: 5, range: 2, desc: '守护山河、统御五军的盟主。' });

  /* ============ 流寇（新手教学，弱） ============ */
  var BANDITS = [
    H({ id: 'l1', name: '流寇头目', nick: '刀疤', category: '战斗', element: '土', hp: 10, atk: 3, aoe: false, defense: 0, alignment: -2, speed: 5, range: 1, desc: '啸聚山林的流寇头目。' }),
    H({ id: 'l2', name: '流寇喽啰', nick: '瘦猴', category: '战斗', element: '火', hp: 6, atk: 2, aoe: false, defense: 0, alignment: -1, speed: 4, range: 1, desc: '跟着头目混饭吃的喽啰。' })
  ];

  /** 阵营军队（按路线）：route 'good' = 打官军（山河盟）；否则打魔军（曜魔宗） */
  function armyOf(route) {
    return route === 'good' ? GUANJUN : GENERALS;
  }

  /** 按善恶选择取 boss：bossChoice 'good' = 善boss（山河盟主）；否则恶boss（曜魔宗主） */
  function bossOf(bossChoice) {
    return bossChoice === 'good' ? BOSS_GOOD : BOSS;
  }

  /** 战斗实例 → 完整英雄视图（补立绘/头像占位等） */
  function heroView(e) {
    var v = {};
    for (var k in e) v[k] = e[k];
    v.attack = e.atk;
    v.portrait = e.portrait || 'images/enemy/' + e.id + '.png';
    v.avatar = e.avatar || v.portrait;
    v.talent = e.talent || null;
    v.skill = e.skill || null;
    return v;
  }

  g.DSH_ENEMIES = {
    GENERALS: GENERALS,
    BOSS: BOSS,
    GUANJUN: GUANJUN,
    BOSS_GOOD: BOSS_GOOD,
    BANDITS: BANDITS,
    armyOf: armyOf,
    bossOf: bossOf,
    heroView: heroView,
    byId: function (id) {
      var all = GENERALS.concat(GUANJUN).concat(BANDITS);
      if (id === BOSS.id) return BOSS;
      if (id === BOSS_GOOD.id) return BOSS_GOOD;
      for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
