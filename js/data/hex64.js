/**
 * hex64.js — 64 卦表 + 规则库 RULE_TEXT
 *
 * 64 卦 = 上卦 × 下卦。每卦特效由「下卦规则 + 上卦规则」组合推导（文档 4.1：
 * 特效随下卦重算而变化；上卦开局三选一、一局固定）。
 * 同名规则合并：数值型相加（概率封顶 60%），取 max 型取较大值。
 *
 * 卦名采用通行《周易》六十四卦名（上卦/下卦 唯一映射）。
 */
(function (g) {
  'use strict';

  /** 24 种规则文案库（调试面板「规则」标签展示） */
  var RULE_TEXT = {
    atkPct:        { name: '全队攻击',        text: '全队攻击 +X%' },
    defPct:        { name: '全队防御',        text: '全队防御 +X%（受击伤害 -X%）' },
    bossAtkDown:   { name: '魔王威压',        text: '魔王攻击 -X%（向下取整）' },
    opening:       { name: '开局轰击',        text: '开战对敌方造成 X 点伤害（仅一次）' },
    shieldAll:     { name: '坚阵',            text: '全队护盾 +X' },
    healAll:       { name: '回春',            text: '全队回复 X% 防御' },
    burnRound:     { name: '灼地',            text: '每回合灼烧敌方 X 点' },
    firstCrit:     { name: '先机',            text: '本局首次攻击必暴击' },
    comboCrit:     { name: '二连',            text: '每回合第二次攻击必暴击' },
    lifesteal:     { name: '嗜血',            text: '攻击吸血 X%' },
    dmgShield:     { name: '化伤为盾',        text: '受伤 X% 转护盾' },
    revive:        { name: '涅槃',            text: '队伍死亡一次复活（50% 防御 + 3 盾）' },
    freezeSkill:   { name: '凝滞',            text: 'X% 概率冻结敌方行动' },
    burnOnHit:     { name: '焚身',            text: '攻击附加燃烧层数（每层每回合 1 伤，递增）' },
    windBurn:      { name: '风蚀',            text: '攻击 X% 概率附加风蚀（每层每回合 2 伤）' },
    chase:         { name: '追击',            text: '攻击 X% 概率获得额外行动' },
    thorns:        { name: '荆棘',            text: '受击反弹 X 点伤害' },
    dmgReduce:     { name: '铁壁',            text: '全队受伤 -X%' },
    critChance:    { name: '锐目',            text: '暴击率 +X%' },
    stunHit:       { name: '破势',            text: '攻击 X% 概率冻结敌方下次行动' },
    healOnHit:     { name: '汲命',            text: '攻击回复 X 点防御' },
    empowNext:     { name: '蓄势',            text: '连击增伤（每次攻击后下次 +1）' },
    qiantian:      { name: '乾天',            text: '连续三次攻击后获得额外行动' },
    jiji:          { name: '既济',            text: '冻结目标后，下次攻击必暴击' },
    weiji:         { name: '未济',            text: '攻击增加，但受到伤害增加' }
  };

  /** 上卦/下卦 → 卦名（通行六十四卦名） */
  var NAME_MAP = {
    qian: { qian: '乾为天', dui: '天泽履', li: '天火同人', zhen: '天雷无妄', xun: '天风姤', kan: '天水讼', gen: '天山遁', kun: '天地否' },
    dui:  { qian: '泽天夬', dui: '兑为泽', li: '泽火革',   zhen: '泽雷随',   xun: '泽风大过', kan: '泽水困', gen: '泽山咸', kun: '泽地萃' },
    li:   { qian: '火天大有', dui: '火泽睽', li: '离为火', zhen: '火雷噬嗑', xun: '火风鼎', kan: '火水未济', gen: '火山旅', kun: '火地晋' },
    zhen: { qian: '雷天大壮', dui: '雷泽归妹', li: '雷火丰', zhen: '震为雷', xun: '雷风恒', kan: '雷水解', gen: '雷山小过', kun: '雷地豫' },
    xun:  { qian: '风天小畜', dui: '风泽中孚', li: '风火家人', zhen: '风雷益', xun: '巽为风', kan: '风水涣', gen: '风山渐', kun: '风地观' },
    kan:  { qian: '水天需', dui: '水泽节', li: '水火既济', zhen: '水雷屯', xun: '水风井', kan: '坎为水', gen: '水山蹇', kun: '水地比' },
    gen:  { qian: '山天大畜', dui: '山泽损', li: '山火贲', zhen: '山雷颐', xun: '山风蛊', kan: '山水蒙', gen: '艮为山', kun: '山地剥' },
    kun:  { qian: '地天泰', dui: '地泽临', li: '地火明夷', zhen: '地雷复', xun: '地风升', kan: '地水师', gen: '地山谦', kun: '坤为地' }
  };

  /** 概率类规则合并封顶 */
  var PROB_KEYS = { chase: 1, freezeSkill: 1, windBurn: 1, stunHit: 1, lifesteal: 1, critChance: 1, healAll: 1, bossAtkDown: 1 };
  var PROB_CAP = 60;

  /**
   * 合并规则数组（下卦规则 + 上卦规则）。
   * 同 key 数值相加；概率类封顶 60%；数值相同键叠加。
   */
  function mergeRules(listA, listB) {
    var acc = {};
    function push(list) {
      list.forEach(function (r) {
        if (acc[r.key] === undefined) {
          acc[r.key] = { key: r.key, value: r.value === undefined ? 0 : r.value };
        } else {
          acc[r.key].value = (acc[r.key].value || 0) + (r.value === undefined ? 0 : r.value);
        }
      });
    }
    push(listA);
    push(listB);
    var out = [];
    for (var k in acc) {
      var v = acc[k].value;
      if (PROB_KEYS[k] && v > PROB_CAP) v = PROB_CAP;
      if (k === 'dmgReduce' && v > 70) v = 70; // 减伤封顶 70%
      out.push({ key: k, value: v });
    }
    return out;
  }

  /** 生成 64 卦表：flat 列表 + upper/lower 索引 */
  var trigrams = g.DSH_TRIGRAMS.TRIGRAMS;
  var LIST = [];
  var BY_PAIR = {};

  trigrams.forEach(function (upper) {
    trigrams.forEach(function (lower) {
      var name = NAME_MAP[upper.id][lower.id];
      var rules = mergeRules(lower.rules, upper.rules);
      var hex = {
        name: name,
        upper: upper.id,
        lower: lower.id,
        upperSymbol: upper.symbol,
        lowerSymbol: lower.symbol,
        rules: rules,
        /** 界面展示文案 */
        effectText: rules.map(function (r) {
          var t = RULE_TEXT[r.key];
          if (!t) return r.key;
          return (t.name + (r.value ? ' +' + r.value : ''));
        }).join('，')
      };
      LIST.push(hex);
      BY_PAIR[upper.id + '-' + lower.id] = hex;
    });
  });

  g.DSH_HEX64 = {
    RULE_TEXT: RULE_TEXT,
    LIST: LIST,
    /** 按 上卦-下卦 查 64 卦 */
    byPair: function (upperId, lowerId) { return BY_PAIR[upperId + '-' + lowerId] || null; },
    count: LIST.length
  };
})(typeof window !== 'undefined' ? window : globalThis);
