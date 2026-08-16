/**
 * trigram.js — 八卦数据与规则贡献
 * 爻序：下/中/上（下爻=slot0, 中爻=slot1, 上爻=slot2）
 * 阳=1, 阴=0
 *
 * 注意：文档 4.3 中「巽」的爻序写作「阴阴阳」与「艮」重复，
 * 按标准卦象修正为「阴阳阳」（巽 ☴ = 下阴中阳上阳）。
 * 每条八卦携带规则贡献（rules），64 卦特效由 上卦规则 + 下卦规则 组合推导。
 */
(function (g) {
  'use strict';

  var TRIGRAMS = [
    { id: 'qian', name: '乾', symbol: '☰', lines: ['阳', '阳', '阳'],
      desc: '首击必暴击 · 连击增伤',
      rules: [{ key: 'firstCrit' }, { key: 'empowNext' }] },
    { id: 'dui',  name: '兑', symbol: '☱', lines: ['阳', '阳', '阴'],
      desc: '全队回复 12% · 吸血 20%',
      rules: [{ key: 'healAll', value: 12 }, { key: 'lifesteal', value: 20 }] },
    { id: 'li',   name: '离', symbol: '☲', lines: ['阳', '阴', '阳'],
      desc: '攻击附燃烧 · 持续增伤',
      rules: [{ key: 'burnOnHit', value: 1 }] },
    { id: 'zhen', name: '震', symbol: '☳', lines: ['阳', '阴', '阴'],
      desc: '雷动追击 · 20% 额外行动',
      rules: [{ key: 'chase', value: 20 }] },
    { id: 'xun',  name: '巽', symbol: '☴', lines: ['阴', '阳', '阳'],
      desc: '风蚀 · 30% 附加持续伤害',
      rules: [{ key: 'windBurn', value: 30 }] },
    { id: 'kan',  name: '坎', symbol: '☵', lines: ['阴', '阳', '阴'],
      desc: '魔王攻 -8% · 15% 冻结',
      rules: [{ key: 'bossAtkDown', value: 8 }, { key: 'freezeSkill', value: 15 }] },
    { id: 'gen',  name: '艮', symbol: '☶', lines: ['阴', '阴', '阳'],
      desc: '全队盾 +3 · 受伤 -10%',
      rules: [{ key: 'shieldAll', value: 3 }, { key: 'dmgReduce', value: 10 }] },
    { id: 'kun',  name: '坤', symbol: '☷', lines: ['阴', '阴', '阴'],
      desc: '受伤转盾 · 死一次复活',
      rules: [{ key: 'dmgShield', value: 50 }, { key: 'revive' }] }
  ];

  /** 爻序字符串 → 卦（用于下卦合成） */
  var BY_LINES = {};
  TRIGRAMS.forEach(function (t) { BY_LINES[t.lines.join('')] = t; });

  g.DSH_TRIGRAMS = {
    TRIGRAMS: TRIGRAMS,
    byId: function (id) {
      for (var i = 0; i < TRIGRAMS.length; i++) if (TRIGRAMS[i].id === id) return TRIGRAMS[i];
      return null;
    },
    byLines: function (lines) { return BY_LINES[lines.join('')] || null; },
    /** 由三个爻（'阳'|'阴'）合成下卦 */
    composeLower: function (yao0, yao1, yao2) {
      return BY_LINES[yao0 + yao1 + yao2] || null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
