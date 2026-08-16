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

  /** 招式卡（手牌） */
  function createHandCard(hero, state, uid) {
    var card = document.createElement('div');
    card.className = 'hero-card hand-card' + (state.usedThisTurn[uid] ? ' acted' : '');
    card.dataset.uid = uid;
    card.dataset.heroId = hero.id;
    card.dataset.target = hero.target;

    var frame = document.createElement('div');
    frame.className = 'hero-frame';
    card.appendChild(frame);

    var inner = document.createElement('div');
    inner.className = 'hero-inner';
    inner.style.background = 'linear-gradient(180deg, ' + g.DSH_ELEMENTS.COLOR[hero.element] + 'cc, ' +
      g.DSH_ELEMENTS.COLOR[hero.element] + '99)';
    frame.appendChild(inner);

    var img = document.createElement('img');
    img.className = 'hero-img';
    img.alt = hero.nick;
    img.draggable = false;
    img.src = imageSrc(hero, 'default');
    img.onerror = function () {
      img.style.display = 'none';
      var fb = frame.querySelector('.hero-fallback');
      if (fb) fb.style.display = 'flex';
    };
    frame.appendChild(img);

    var fallback = document.createElement('div');
    fallback.className = 'hero-fallback';
    fallback.style.display = 'none';
    fallback.innerHTML = '<span class="hero-fallback-icon">' + (CAT_ICON[hero.category] || '?') + '</span>';
    frame.appendChild(fallback);

    var data = document.createElement('div');
    data.className = 'hero-data';
    data.style.background = 'linear-gradient(180deg, ' + g.DSH_ELEMENTS.COLOR[hero.element] + '55 0%, ' +
      g.DSH_ELEMENTS.COLOR[hero.element] + 'cc 42%, #14100c 100%)';
    data.innerHTML =
      '<div class="hero-name">' + hero.nick + '</div>' +
      '<div class="hero-sub">' + hero.name + ' · ' + hero.category +
      '<span class="hero-target">' + (TARGET_TEXT[hero.target] || '') + '</span></div>' +
      '<div class="hero-skill">' + hero.desc + '</div>';
    frame.appendChild(data);

    // 类别角标（左上）
    var cat = document.createElement('div');
    cat.className = 'hero-cat-badge';
    cat.textContent = CAT_ICON[hero.category] || '';
    cat.title = hero.category;
    card.appendChild(cat);

    // 五行角标（右上）
    var elm = document.createElement('div');
    elm.className = 'hero-element-badge';
    elm.textContent = g.DSH_ELEMENTS.ICON[hero.element] || '';
    elm.title = hero.element;
    card.appendChild(elm);

    return card;
  }

  /** 主将卡（战场底部） */
  function createCommanderCard(state) {
    if (!state.commander) return null;
    var hero = g.DSH_HEROES.byId(state.commander.heroId);
    var card = document.createElement('div');
    card.className = 'commander-card';

    var head = document.createElement('div');
    head.className = 'commander-head';
    head.innerHTML = '<span class="commander-icon">' + (CAT_ICON[hero.category] || '🏮') + '</span>' +
      '<span class="commander-name">主将 · ' + hero.nick + '（' + hero.name + '）</span>' +
      '<span class="commander-talent" title="' + hero.talent.desc + '">' + hero.talent.name + '</span>';
    card.appendChild(head);

    var hpRow = document.createElement('div');
    hpRow.className = 'commander-bar-row';
    hpRow.innerHTML = '<span class="commander-bar-label">血</span>';
    var hpBar = document.createElement('div');
    hpBar.className = 'commander-bar hp-bar';
    var hpFill = document.createElement('div');
    hpFill.className = 'commander-bar-fill hp-fill';
    hpBar.appendChild(hpFill);
    hpRow.appendChild(hpBar);
    var hpText = document.createElement('span');
    hpText.className = 'commander-bar-text';
    hpText.textContent = state.commander.hp + '/' + state.commander.maxHp;
    hpRow.appendChild(hpText);
    card.appendChild(hpRow);
    setHpBar(hpFill, 'cmd-hp', state.commander.hp, state.commander.maxHp);

    var defRow = document.createElement('div');
    defRow.className = 'commander-bar-row';
    defRow.innerHTML = '<span class="commander-bar-label">防</span>';
    var defBar = document.createElement('div');
    defBar.className = 'commander-bar def-bar';
    var defFill = document.createElement('div');
    defFill.className = 'commander-bar-fill def-fill';
    defBar.appendChild(defFill);
    defRow.appendChild(defBar);
    var defText = document.createElement('span');
    defText.className = 'commander-bar-text';
    defText.textContent = state.commander.defense;
    defRow.appendChild(defText);
    card.appendChild(defRow);
    setHpBar(defFill, 'cmd-def', state.commander.defense, Math.max(state.commander.maxHp, 10));

    return card;
  }

  /** 轻量刷新主将卡 */
  function refreshCommanderCard(card, state) {
    if (!card || !state.commander) return;
    var hpFill = card.querySelector('.hp-fill');
    var hpText = card.querySelector('.commander-bar-text');
    if (hpFill) setHpBar(hpFill, 'cmd-hp', state.commander.hp, state.commander.maxHp);
    if (hpText) hpText.textContent = state.commander.hp + '/' + state.commander.maxHp;
    var defFill = card.querySelector('.def-fill');
    var defTexts = card.querySelectorAll('.commander-bar-text');
    if (defFill) setHpBar(defFill, 'cmd-def', state.commander.defense, Math.max(state.commander.maxHp, 10));
    if (defTexts.length > 1) defTexts[1].textContent = state.commander.defense;
  }

  g.DSH_CardRenderer = {
    CAT_ICON: CAT_ICON,
    TARGET_TEXT: TARGET_TEXT,
    imageSrc: imageSrc,
    setHpBar: setHpBar,
    resetHpBars: resetHpBars,
    createHandCard: createHandCard,
    createCommanderCard: createCommanderCard,
    refreshCommanderCard: refreshCommanderCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
