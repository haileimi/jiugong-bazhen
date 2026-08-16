/**
 * heroes.js — 12 名英雄 + 兵种特技 + 皮肤（skins）
 * 字段：攻/血（攻击力/血量=防御值）。血量保留在牌库，战死永久移出。
 * 阴阳（阳/阴）用于下卦合成：slot0=下爻, slot1=中爻, slot2=上爻。
 *
 * 皮肤（皮肤概念，为后续扩展预留）：
 *   skins: [{ id, name, file }]
 *   立绘目录：images/hero/<英雄id>/<皮肤id>.png（默认取第一项）
 */
(function (g) {
  'use strict';

  /** 兵种特技（攻击时 25% 概率触发） */
  var ROLES = {
    '武卒': { name: '烈焰斩', mult: 1.6 },
    '骑兵': { name: '破甲突袭', mult: 1.4 },
    '弓手': { name: '贯日箭', mult: 1.4 },
    '谋士': { name: '蚀骨计', mult: 1.3 },
    '盾卫': { name: '坚盾反击', mult: 1.8 }
  };
  var SKILL_CHANCE = 0.25;

  /** 12 名英雄：id, 兵种, 五行, 诨名, 名字, 阴阳, 攻/血, 皮肤列表 */
  var HEROES = [
    { id: 'wz1', role: '武卒', element: '火', nick: '红炮',   name: '祝老火', yinYang: '阳', atk: 16, hp: 3,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'wz2', role: '武卒', element: '火', nick: '过山虎', name: '傅寅',   yinYang: '阳', atk: 15, hp: 4,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'wz3', role: '武卒', element: '火', nick: '黑杀',   name: '萧靳',   yinYang: '阴', atk: 15, hp: 4,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'qb1', role: '骑兵', element: '金', nick: '破阵郎', name: '陈昊雷', yinYang: '阳', atk: 13, hp: 7,
      skins: [{ id: 'default', name: '原版' }, { id: 'beard', name: '蓄须' }] },
    { id: 'qb2', role: '骑兵', element: '金', nick: '铁脚汉', name: '汪拦山', yinYang: '阳', atk: 12, hp: 8,
      skins: [{ id: 'gold', name: '金甲' }, { id: 'silver', name: '银甲' }] },
    { id: 'qb3', role: '骑兵', element: '金', nick: '雪骡子', name: '慕容珩', yinYang: '阴', atk: 12, hp: 8,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'dw1', role: '盾卫', element: '土', nick: '大山汉', name: '穆奎',   yinYang: '阳', atk: 6,  hp: 14,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'dw2', role: '盾卫', element: '土', nick: '闷嘴石', name: '王守岩', yinYang: '阴', atk: 6,  hp: 15,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'gs1', role: '弓手', element: '木', nick: '百步倒', name: '赵星',   yinYang: '阳', atk: 14, hp: 5,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'gs2', role: '弓手', element: '木', nick: '草间溜', name: '徐梢',   yinYang: '阴', atk: 13, hp: 6,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'ms1', role: '谋士', element: '水', nick: '观星眼', name: '苏景澜', yinYang: '阳', atk: 10, hp: 9,
      skins: [{ id: 'default', name: '原版' }] },
    { id: 'ms2', role: '谋士', element: '水', nick: '冷算子', name: '希寒川', yinYang: '阴', atk: 9,  hp: 10,
      skins: [{ id: 'default', name: '原版' }] }
  ];

  /** 展开特技/皮肤字段（只读视图） */
  var VIEW = HEROES.map(function (h) {
    var skill = ROLES[h.role];
    return {
      id: h.id,
      role: h.role,
      element: h.element,
      nick: h.nick,
      name: h.name,
      yinYang: h.yinYang,
      atk: h.atk,
      hp: h.hp,
      maxHp: h.hp,
      skillName: skill.name,
      skillMult: skill.mult,
      skillChance: SKILL_CHANCE,
      skins: h.skins.map(function (s) { return { id: s.id, name: s.name, file: s.id + '.png' }; })
    };
  });

  /** 皮肤辅助 */
  function skinsOf(hero) { return hero.skins || []; }
  function defaultSkinId(hero) { var s = skinsOf(hero); return s.length ? s[0].id : 'default'; }
  function skinOf(hero, skinId) {
    var s = skinsOf(hero);
    for (var i = 0; i < s.length; i++) if (s[i].id === skinId) return s[i];
    return s[0] || null;
  }

  g.DSH_HEROES = {
    ROLES: ROLES,
    SKILL_CHANCE: SKILL_CHANCE,
    HEROES: VIEW,
    byId: function (id) {
      for (var i = 0; i < VIEW.length; i++) if (VIEW[i].id === id) return VIEW[i];
      return null;
    },
    skinsOf: skinsOf,
    defaultSkinId: defaultSkinId,
    skinOf: skinOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
