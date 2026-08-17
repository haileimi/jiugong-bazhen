/**
 * cardRenderer.js — 招式卡渲染（v3.10 简约 1:1 方形卡）
 *
 * 招式卡（偏将）：手牌区 9 宫格放置，1:1 方形 —— 类别符号 + 诨名 + 效果描述（无立绘）。
 * 点选后放大 + 轻微摆动（CSS .selected）。主将/敌方卡渲染在 battleRenderer。
 */
(function (g) {
  'use strict';

  var CAT_ICON = { '战斗': '⚔', '护卫': '🛡', '计谋': '🔮' };
  var TARGET_TEXT = { single: '单体', all: '全体', self: '自身' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** 卡面右上角数值（攻击/防御/关键数） */
  function statNumber(hero) {
    if (hero.category === '战斗') return hero.damage;
    if (hero.category === '护卫') {
      if (hero.defGain > 0) return hero.defGain;
      if (hero.atkDown > 0) return hero.atkDown;
      if (hero.heal > 0) return hero.heal;
      return '';
    }
    if (hero.draw > 0) return hero.draw;
    if (hero.tianjiUp > 0) return '天+1';
    if (hero.atkDown > 0) return hero.atkDown;
    if (hero.fillHand) return 9;
    return '';
  }

  function statText(hero) {
    if (hero.category === '战斗') return '攻击 ' + hero.damage;
    if (hero.category === '护卫') {
      if (hero.defGain > 0) return '防御 +' + hero.defGain;
      if (hero.atkDown > 0) return '目标攻击 -' + hero.atkDown + '%';
      if (hero.heal > 0) return '恢复 ' + hero.heal + ' 点血量';
      return '';
    }
    if (hero.draw > 0) return '抽 ' + hero.draw + ' 张';
    if (hero.tianjiUp > 0) return '本场天机上限 +1';
    if (hero.atkDown > 0) return '目标攻击 -' + hero.atkDown + '%';
    if (hero.fillHand) return '手牌抽满至 9';
    return '';
  }

  /** 血条平滑动画缓存 */
  var prevBar = {};

  function setHpBar(fillEl, id, hp, maxHp) {
    if (!fillEl) return;
    var to = Math.max(0, Math.round(hp / maxHp * 100));
    var from = prevBar[id] !== undefined ? prevBar[id] : to;
    prevBar[id] = to;
    if (from !== to) {
      fillEl.style.width = from + '%';
      void fillEl.offsetWidth;
      fillEl.style.width = to + '%';
    } else {
      fillEl.style.width = to + '%';
    }
  }

  function resetHpBars() { prevBar = {}; }

  /** 招式卡（手牌，简约 1:1 方形：类别符号 + 诨名 + 效果） */
  function createHandCard(hero, state, uid) {
    var card = document.createElement('div');
    card.className = 'hero-card hand-card' + (state.usedThisTurn[uid] ? ' acted' : '');
    card.dataset.uid = uid;
    card.dataset.heroId = hero.id;
    card.dataset.target = hero.target;

    var symbol = el('div', 'sc-symbol', CAT_ICON[hero.category] || '?');
    card.appendChild(symbol);

    var name = el('div', 'sc-name', hero.nick);
    name.title = hero.name + ' · ' + hero.category + ' · ' + (TARGET_TEXT[hero.target] || '');
    card.appendChild(name);

    var stat = el('div', 'sc-stat', statText(hero));
    card.appendChild(stat);

    var desc = el('div', 'sc-desc', hero.desc);
    desc.title = hero.desc;
    card.appendChild(desc);

    return card;
  }

  g.DSH_CardRenderer = {
    CAT_ICON: CAT_ICON,
    TARGET_TEXT: TARGET_TEXT,
    statNumber: statNumber,
    statText: statText,
    setHpBar: setHpBar,
    resetHpBars: resetHpBars,
    createHandCard: createHandCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
