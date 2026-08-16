/**
 * cardRenderer.js — 招式卡 / 主将卡渲染（v3）
 *
 * 招式卡（偏将）：手牌区重叠排列，点选后放大 20% + 轻微摆动（CSS .selected）。
 * 主将卡：战场底部，显示血量 + 防御两条条。
 * 立绘路径：images/hero/<英雄id>/<皮肤id>.png（缺失降级为类别图标）。
 */
(function (g) {
  'use strict';

  var CAT_ICON = { '战斗': '⚔', '护卫': '🛡', '计谋': '🔮' };
  var TARGET_TEXT = { single: '单体', all: '全体', self: '自身' };

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

  function imageSrc(hero, skinId) {
    return 'images/hero/' + hero.id + '/' + (skinId || 'default') + '.png?v=3';
  }

  /** 招式卡（手牌，王国之战卡牌风：青横幅/金角标/插画区/棕木信息板） */
  function createHandCard(hero, state, uid) {
    var card = document.createElement('div');
    card.className = 'hero-card hand-card kc-card' + (state.usedThisTurn[uid] ? ' acted' : '');
    card.dataset.uid = uid;
    card.dataset.heroId = hero.id;
    card.dataset.target = hero.target;

    // 顶部青色名称横幅（诨名）
    var banner = document.createElement('div');
    banner.className = 'kc-banner';
    banner.textContent = hero.nick;
    banner.title = hero.name + ' · ' + hero.category + ' · ' + (TARGET_TEXT[hero.target] || '');
    card.appendChild(banner);

    // 金色角标（五行）
    var badge = document.createElement('div');
    badge.className = 'kc-badge';
    badge.textContent = g.DSH_ELEMENTS.ICON[hero.element] || '';
    badge.title = hero.element;
    card.appendChild(badge);

    // 插画区（黑底 + 立绘 + 纹理 + 光）
    var art = document.createElement('div');
    art.className = 'kc-art';
    var img = document.createElement('img');
    img.className = 'kc-art-img';
    img.alt = hero.nick;
    img.draggable = false;
    img.src = imageSrc(hero, 'default');
    img.onerror = function () {
      img.style.display = 'none';
      var fb = document.createElement('div');
      fb.className = 'kc-art-fb';
      fb.textContent = CAT_ICON[hero.category] || '?';
      art.appendChild(fb);
    };
    art.appendChild(img);
    card.appendChild(art);

    // 底部棕木信息板（效果描述）
    var plate = document.createElement('div');
    plate.className = 'kc-plate';
    var plateText = document.createElement('span');
    plateText.textContent = hero.desc;
    plate.appendChild(plateText);
    plate.title = hero.desc;
    card.appendChild(plate);

    return card;
  }

  g.DSH_CardRenderer = {
    CAT_ICON: CAT_ICON,
    TARGET_TEXT: TARGET_TEXT,
    imageSrc: imageSrc,
    setHpBar: setHpBar,
    resetHpBars: resetHpBars,
    createHandCard: createHandCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
