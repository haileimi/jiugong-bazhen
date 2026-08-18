/**
 * heroes.js — 16 名英雄（v3 主将制）
 *
 * 每名英雄既可当「主将」（有血量、被怪打、带被动天赋），也可作为「偏将」（招式牌进卡包）。
 * 类别（与五行脱钩，五行只做克制结算）：
 *   战斗 = 发起攻击（多为单体需点怪，例外为全体直接打出）
 *   护卫 = 使用技能 / 增加防御（自身，点出即打；闷嘴石为例外：单体指向减伤+回血）
 *   计谋 = 类似杀戮尖塔能力牌（自身=抽牌/能力；冷算子为例外：单体指向减益）
 *
 * 指向类型 target：
 *   single = 点手牌 → 放大 20%+轻摆 → 点怪物 → 打出
 *   all    = 点手牌直接打出（群体）
 *   self   = 点手牌直接打出（作用主将/全场）
 *
 * 主将模型：血量（命，归零=输）+ 防御（护盾条，每场战斗开始归零，受击先扣防御再扣血）。
 * 恢复类效果一律恢复血量。
 */
(function (g) {
  'use strict';

  var CATEGORY = { '战斗': 1, '护卫': 1, '计谋': 1 };

  var HEROES = [
    /* ---------- 战斗（6 张，5 单体 + 1 全体） ---------- */
    { id: 'wz1', nick: '红炮',   name: '祝老火', category: '战斗', element: '火', target: 'single',
      damage: 16, desc: '对目标造成 16 点伤害',
      skill: { name: '烈焰斩', chance: 0.25, mult: 1.6 },
      talent: { name: '炮火轰鸣', desc: '战斗牌伤害 +15%', type: 'battlePct', value: 15 },
      hp: 3, skins: [{ id: 'default', name: '原版' }] },
    { id: 'wz2', nick: '过山虎', name: '傅寅',   category: '战斗', element: '火', target: 'single',
      damage: 15, desc: '对目标造成 15 点伤害，25% 附加 1 层燃烧',
      skill: { name: '灼烧附魔', chance: 0.25, burn: 1 },
      talent: { name: '猛虎开山', desc: '每回合第一张战斗牌伤害 +4', type: 'firstCardBonus', value: 4 },
      hp: 4, skins: [{ id: 'default', name: '原版' }] },
    { id: 'wz3', nick: '黑杀',   name: '萧靳',   category: '战斗', element: '火', target: 'single',
      damage: 15, desc: '对目标造成 15 点伤害，25% 本击暴击伤害 ×2',
      skill: { name: '夺命一击', chance: 0.25, critDmg: 2 },
      talent: { name: '杀心', desc: '暴击率 +15%', type: 'critRate', value: 15 },
      hp: 4, skins: [{ id: 'default', name: '原版' }] },
    { id: 'gs1', nick: '百步倒', name: '赵星',   category: '战斗', element: '木', target: 'single',
      damage: 14, desc: '对目标造成 14 点伤害，25% 追击（不耗天机再打一次）',
      skill: { name: '追风逐日', chance: 0.25, chase: true },
      talent: { name: '疾风起手', desc: '本场战斗首回合天机 +1', type: 'firstTurnTianji', value: 1 },
      hp: 5, skins: [{ id: 'default', name: '原版' }] },
    { id: 'gs2', nick: '草间溜', name: '徐梢',   category: '战斗', element: '木', target: 'all',
      damage: 10, desc: '对全体敌人造成 10 点伤害，25% 全体附加 1 层风蚀',
      skill: { name: '风卷残云', chance: 0.25, windAll: 1 },
      talent: { name: '风势', desc: '群体攻击伤害 +25%', type: 'aoePct', value: 25 },
      hp: 6, skins: [{ id: 'default', name: '原版' }] },
    { id: 'qb3', nick: '雪骡子', name: '慕容珩', category: '战斗', element: '金', target: 'single',
      damage: 12, desc: '对目标造成 12 点伤害，25% 冻结目标下次行动',
      skill: { name: '寒霜踏', chance: 0.25, freeze: true },
      talent: { name: '寒刃', desc: '暴击伤害 +50%', type: 'critDmg', value: 50 },
      hp: 8, skins: [{ id: 'default', name: '原版' }] },

    /* ---------- 护卫（4 张，3 自身 + 1 单体） ---------- */
    { id: 'qb1', nick: '破阵郎', name: '陈昊雷', category: '护卫', element: '金', target: 'self',
      defGain: 9, heal: 0, desc: '获得 9 点防御',
      talent: { name: '军旗', desc: '每回合天机 +1（3→4）', type: 'tianjiPerTurn', value: 1 },
      hp: 7, skins: [{ id: 'default', name: '原版' }, { id: 'beard', name: '蓄须' }] },
    { id: 'qb2', nick: '铁脚汉', name: '汪拦山', category: '护卫', element: '金', target: 'self',
      defGain: 6, heal: 3, desc: '获得 6 点防御，恢复 3 点血量',
      talent: { name: '金汤', desc: '开局自带 5 点防御', type: 'startDefense', value: 5 },
      hp: 8, skins: [{ id: 'gold', name: '金甲' }, { id: 'silver', name: '银甲' }] },
    { id: 'dw1', nick: '大山汉', name: '穆奎',   category: '护卫', element: '土', target: 'self',
      defGain: 10, heal: 0, desc: '获得 10 点防御',
      talent: { name: '不动如山', desc: '受击伤害 -20%', type: 'dmgReduce', value: 20 },
      hp: 14, skins: [{ id: 'default', name: '原版' }] },
    { id: 'dw2', nick: '闷嘴石', name: '王守岩', category: '护卫', element: '土', target: 'single',
      atkDown: 30, heal: 3, desc: '指定怪物伤害 -30%（可叠加至 -60%），恢复 3 点血量',
      talent: { name: '磐石吐纳', desc: '每回合结束恢复 2 点血量', type: 'endHeal', value: 2 },
      hp: 15, skins: [{ id: 'default', name: '原版' }] },

    /* ---------- 计谋（3 张，2 自身 + 1 单体） ---------- */
    { id: 'ms1', nick: '观星眼', name: '苏景澜', category: '计谋', element: '水', target: 'self',
      draw: 2, tianjiUp: 1, desc: '本场战斗天机上限 +1，抽 2 张',
      talent: { name: '观星', desc: '每回合多抽 1 张（起手 6 张）', type: 'drawBonus', value: 1 },
      hp: 9, skins: [{ id: 'default', name: '原版' }] },
    { id: 'ms2', nick: '冷算子', name: '希寒川', category: '计谋', element: '水', target: 'single',
      atkDown: 20, wind: 2, desc: '指定敌人攻击 -20%（可叠加），附加 2 层风蚀',
      talent: { name: '天算', desc: '每场战斗免死一次（致命伤保留 1 血）', type: 'onceSave' },
      hp: 10, skins: [{ id: 'default', name: '原版' }] },
    { id: 'bz1', nick: '白泽',   name: '玄机',   category: '计谋', element: '水', target: 'self',
      fillHand: true, desc: '将手牌抽满至 9 张（多出的回归卡包）',
      talent: { name: '神兽之智', desc: '起手 7 张', type: 'drawBonus', value: 2 },
      hp: 10, skins: [{ id: 'default', name: '原版' }] },

    /* ---------- v3.10 新卡（3 名新英雄，进卡池/招募所） ---------- */
    { id: 'wz4', nick: '开山斧', name: '雷震',   category: '战斗', element: '水', target: 'single',
      damage: 17, desc: '对目标造成 17 点伤害，30% 暴击伤害 ×1.5',
      skill: { name: '开山一击', chance: 0.3, critDmg: 1.5 },
      talent: { name: '威震', desc: '战斗牌伤害 +10%', type: 'battlePct', value: 10 },
      hp: 5, skins: [{ id: 'default', name: '原版' }] },
    { id: 'qb4', nick: '铁壁',   name: '庞磐',   category: '护卫', element: '木', target: 'self',
      defGain: 11, heal: 1, desc: '获得 11 点防御，恢复 1 点血量',
      talent: { name: '磐石', desc: '受击伤害 -10%', type: 'dmgReduce', value: 10 },
      hp: 13, skins: [{ id: 'default', name: '原版' }] },
    { id: 'ms3', nick: '点星笔', name: '文若',   category: '计谋', element: '木', target: 'self',
      draw: 3, desc: '抽 3 张牌',
      talent: { name: '神笔', desc: '每回合多抽 1 张（起手 6 张）', type: 'drawBonus', value: 1 },
      hp: 9, skins: [{ id: 'default', name: '原版' }] },

    /* ---------- v3.10 村民 ABC（雇佣兵初始队友：每局保证入包，不可当主将） ---------- */
    { id: 'cm1', nick: '阿大', name: '猎户阿大', category: '战斗', element: '木', target: 'single',
      damage: 8, desc: '对目标造成 8 点伤害，20% 暴击 ×1.5',
      skill: { name: '猎户一击', chance: 0.2, critDmg: 1.5 },
      talent: { name: '猎户本能', desc: '战斗牌伤害 +5%', type: 'battlePct', value: 5 },
      hp: 6, defense: 1, alignment: 2, speed: 5, range: 1, starter: true, friend: true, skins: [{ id: 'default', name: '原版' }] },
    { id: 'cm2', nick: '阿二', name: '药童阿二', category: '护卫', element: '木', target: 'self',
      defGain: 6, heal: 2, desc: '获得 6 点防御，恢复 2 点血量',
      talent: { name: '采药', desc: '每回合结束恢复 1 点血量', type: 'endHeal', value: 1 },
      hp: 8, defense: 2, alignment: 2, speed: 5, range: 1, starter: true, friend: true, skins: [{ id: 'default', name: '原版' }] },
    { id: 'cm3', nick: '阿三', name: '账房阿三', category: '计谋', element: '水', target: 'self',
      draw: 2, desc: '抽 2 张牌',
      talent: { name: '精打细算', desc: '每回合多抽 1 张（起手 6 张）', type: 'drawBonus', value: 1 },
      hp: 7, defense: 1, alignment: 2, speed: 5, range: 3, starter: true, skins: [{ id: 'default', name: '原版' }] },

    /* ---------- v4 金将：佣兵王·楚烈（通关奖励/金将挑战获得，不入常规卡池） ---------- */
    { id: 'g1', nick: '楚烈', name: '佣兵王·楚烈', category: '战斗', element: '火', target: 'single',
      damage: 22, desc: '对目标造成 22 点伤害，15% 暴击 ×1.5；邻位光环：左右相邻格英雄攻击 +10%',
      skill: { name: '佣兵王令', chance: 0.15, critDmg: 1.5 },
      aura: { atkPct: 10 }, // 邻位光环：影响左右相邻格
      talent: { name: '佣兵王令', desc: '邻位光环：左右相邻格英雄攻击 +10%', type: 'auraAtk', value: 10 },
      hp: 15, defense: 3, alignment: 5, speed: 6, range: 1, skins: [{ id: 'default', name: '原版' }] },

    /* ---------- v4 主角：中土遗孤·云归（固定主将，不进卡池/不可选/不可招募） ---------- */
    { id: 'mc1', nick: '云归', name: '中土遗孤·云归', category: '战斗', element: '木', target: 'single',
      damage: 14, desc: '对目标造成 14 点伤害，25% 伤害 ×1.5',
      skill: { name: '中土剑法', chance: 0.25, mult: 1.5 },
      talent: { name: '归乡执念', desc: '战斗牌伤害 +10%', type: 'battlePct', value: 10 },
      hp: 10, defense: 2, alignment: 0, speed: 5, range: 1,
      protagonist: true, skins: [{ id: 'default', name: '原版' }] }
  ];

  /** v4 稀有度（灰/绿/蓝/金）：村民=灰、老英雄=绿、新英雄+白泽+主角=蓝、楚烈=金 */
  var RARITY_BY_ID = {
    wz1: '绿', wz2: '绿', wz3: '绿', gs1: '绿', gs2: '绿',
    qb1: '绿', qb2: '绿', qb3: '绿', dw1: '绿', dw2: '绿', ms1: '绿', ms2: '绿',
    bz1: '蓝', wz4: '蓝', qb4: '蓝', ms3: '蓝', mc1: '蓝',
    cm1: '灰', cm2: '灰', cm3: '灰',
    g1: '金'
  };

  /** 稀有度 → 布阵点消耗 */
  var RARITY_COST = { '灰': 1, '绿': 2, '蓝': 3, '金': 4 };
  /** 稀有度 → 卡框颜色 */
  var RARITY_COLOR = { '灰': '#9e9e9e', '绿': '#4caf50', '蓝': '#42a5f5', '金': '#ffd700' };

  /**
   * 只读视图展开（v3.10 全角色卡牌模型：攻击/防御/种类/血量/技能/天赋/姓名/诨号/
   * 立绘/头像/关键数值/简介/五行/善恶值/速度/射程）。
   * 缺省值：攻击=damage，防御（护卫 2 / 其他 1），善恶=0，速度=5，射程（战斗 1 / 其他 3），
   * 立绘/头像=占位图路径。
   */
  var VIEW = HEROES.map(function (h) {
    var defaultRange = h.range !== undefined ? h.range : (h.category === '战斗' ? 1 : 3);
    var portrait = 'images/hero/' + h.id + '/default.png';
    var rarity = RARITY_BY_ID[h.id] || '绿';
    return {
      id: h.id, nick: h.nick, name: h.name,
      category: h.category, element: h.element, target: h.target,
      desc: h.desc, hp: h.hp,
      rarity: rarity,                             // v4 稀有度：灰/绿/蓝/金
      gold: rarity === '金',                      // 金将：不入常规卡池，靠奖励/事件获得
      deployCost: RARITY_COST[rarity],            // 布阵点消耗：灰1/绿2/蓝3/金4
      attack: h.damage || 0,                       // 攻击
      defense: h.defense !== undefined ? h.defense : (h.category === '护卫' ? 2 : 1), // 防御
      alignment: h.alignment !== undefined ? h.alignment : 0, // 善恶值（-10~+10）
      speed: h.speed || 5,                         // 速度
      range: defaultRange,                         // 射程
      aura: h.aura || null,                        // 邻位光环（影响左右相邻格）
      portrait: h.portrait || portrait,            // 立绘
      avatar: h.avatar || portrait,                // 头像
      damage: h.damage || 0,
      defGain: h.defGain || 0, heal: h.heal || 0,
      atkDown: h.atkDown || 0, wind: h.wind || 0, draw: h.draw || 0,
      tianjiUp: h.tianjiUp || 0, fillHand: !!h.fillHand,
      skill: h.skill || null,
      talent: h.talent,
      starter: !!h.starter,                        // 村民等初始角色：不入普通卡池
      friend: !!h.friend,                          // 教学战好友（阿大/阿二）
      protagonist: !!h.protagonist,                // 主角（固定主将）：不进卡池/不可选/不可招募
      skins: h.skins.map(function (s) { return { id: s.id, name: s.name, file: s.id + '.png' }; })
    };
  });

  function byId(id) {
    for (var i = 0; i < VIEW.length; i++) if (VIEW[i].id === id) return VIEW[i];
    return null;
  }

  function skinsOf(hero) { return hero.skins || []; }
  function defaultSkinId(hero) { var s = skinsOf(hero); return s.length ? s[0].id : 'default'; }
  function skinOf(hero, skinId) {
    var s = skinsOf(hero);
    for (var i = 0; i < s.length; i++) if (s[i].id === skinId) return s[i];
    return s[0] || null;
  }

  g.DSH_HEROES = {
    CATEGORY: CATEGORY,
    HEROES: VIEW,
    RARITY_BY_ID: RARITY_BY_ID,
    RARITY_COST: RARITY_COST,
    RARITY_COLOR: RARITY_COLOR,
    byId: byId,
    skinsOf: skinsOf,
    defaultSkinId: defaultSkinId,
    skinOf: skinOf,
    /** 初始队友（村民等 starter）：每局保证入包 */
    STARTERS: VIEW.filter(function (h) { return h.starter; }),
    /** 金将（通关奖励/事件获得，不入常规卡池） */
    GOLD_HEROES: VIEW.filter(function (h) { return h.gold; }),
    /** 教学战好友（灰色）：主角 + 好友 vs 流寇 */
    FRIENDS: VIEW.filter(function (h) { return h.friend; }),
    /** 主角（固定主将） */
    PROTAGONIST: VIEW.filter(function (h) { return h.protagonist; })[0] || null,
    /** 卡包牌型：主将之外的非 starter、非金将、非主角英雄（偏将=招式） */
    packHeroIds: function (commanderId) {
      return VIEW.filter(function (h) { return h.id !== commanderId && !h.starter && !h.gold && !h.protagonist; })
        .map(function (h) { return h.id; });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
