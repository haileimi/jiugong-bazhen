/**
 * cardRenderer.js — 英雄卡牌渲染（双框结构：数据 > 形象 > 内框）
 *
 * 层级（从底到顶）：
 *   内框(背景板, inset 10%, 五行底色) → 立绘(cover 占满外框, 透明处露出背景板)
 *   → 兜底(立绘缺失) → 数据层(浮于立绘之上, 半透明深色底)
 * 立绘路径：images/hero/<英雄id>/<皮肤id>.png（皮肤概念，见 heroes.js）
 * 多皮肤英雄在卡面左上角显示换肤按钮（🎭）。
 */
(function (g) {
  'use strict';

  var ROLE_ICON = { '武卒': '⚔', '骑兵': '🐎', '弓手': '🏹', '谋士': '🔮', '盾卫': '🛡' };

  /** 血条上次渲染值（用于受伤/回血的平滑过渡动画） */
  var prevHp = {};

  /**
   * 设置血条宽度：先跳到上次值，再过渡到当前值（CSS transition 生效）。
   * 我方绿条 / 敌方红条共用。
   */
  function setHpBar(fillEl, id, hp, maxHp) {
    if (!fillEl) return;
    var to = Math.max(0, Math.round(hp / maxHp * 100));
    var from = prevHp[id] !== undefined ? prevHp[id] : to;
    prevHp[id] = to;
    if (from !== to) {
      fillEl.style.width = from + '%';
      void fillEl.offsetWidth; // 强制重排，触发 transition 动画
      fillEl.style.width = to + '%';
    } else {
      fillEl.style.width = to + '%';
    }
  }

  /** 新开一局时重置血条动画缓存 */
  function resetHpBars() { prevHp = {}; }

  /** 皮肤立绘地址（皮肤概念：英雄id/皮肤id） */
  function imageSrc(hero, skinId) {
    return 'images/hero/' + hero.id + '/' + (skinId || 'default') + '.png?v=2';
  }

  /** 循环切换英雄皮肤（多皮肤英雄） */
  function cycleSkin(hero, state) {
    var skins = g.DSH_HEROES.skinsOf(hero);
    if (!skins || skins.length < 2) return;
    var cur = hero.skinId || skins[0].id;
    var idx = 0;
    for (var i = 0; i < skins.length; i++) if (skins[i].id === cur) { idx = i; break; }
    var next = skins[(idx + 1) % skins.length];
    hero.skinId = next.id;
    // 重新绘制九宫格（由 battleRenderer 提供）
    if (g.DSH_BattleRenderer) g.DSH_BattleRenderer.renderGrid(state);
  }

  /**
   * 创建英雄卡牌 DOM。
   * @param {object} hero 英雄数据（含当前 hp、skinId）
   * @param {object} state 对局状态
   * @param {number} slot 九宫格位置（可空）
   * @returns {HTMLElement}
   */
  function createHeroCard(hero, state, slot) {
    var card = document.createElement('div');
    card.className = 'hero-card' + (hero.hp <= 0 ? ' dead' : '');
    card.dataset.slot = slot !== undefined ? slot : '';
    card.dataset.heroId = hero.id;

    var frame = document.createElement('div');
    frame.className = 'hero-frame';
    card.appendChild(frame);

    // 内框（背景板，inset 10%，垫在立绘之下：立绘透明处露出五行底色）
    var inner = document.createElement('div');
    inner.className = 'hero-inner';
    inner.style.background = 'linear-gradient(180deg, ' + g.DSH_ELEMENTS.COLOR[hero.element] + 'cc, ' +
      g.DSH_ELEMENTS.COLOR[hero.element] + '99)';
    frame.appendChild(inner);

    // 形象（立绘，cover 占满外框）
    var img = document.createElement('img');
    img.className = 'hero-img';
    img.alt = hero.nick;
    img.draggable = false;
    img.src = imageSrc(hero, hero.skinId);
    img.onerror = function () {
      img.style.display = 'none';
      var fb = frame.querySelector('.hero-fallback');
      if (fb) fb.style.display = 'flex';
    };
    frame.appendChild(img);

    // 兜底（立绘缺失时显示）
    var fallback = document.createElement('div');
    fallback.className = 'hero-fallback';
    fallback.style.display = 'none';
    fallback.innerHTML = '<span class="hero-fallback-icon">' + (ROLE_ICON[hero.role] || '?') + '</span>';
    frame.appendChild(fallback);

    // 数据层：卡面下 1/3 渐变色块（五行色 → 深色），盖住立绘下半部，文字展示其上
    var data = document.createElement('div');
    data.className = 'hero-data';
    data.style.background = 'linear-gradient(180deg, ' + g.DSH_ELEMENTS.COLOR[hero.element] + '55 0%, ' +
      g.DSH_ELEMENTS.COLOR[hero.element] + 'cc 42%, #14100c 100%)';
    data.innerHTML =
      '<div class="hero-name">' + hero.nick + '</div>' +
      '<div class="hero-sub">' + hero.name + ' · ' + hero.role + '</div>' +
      '<div class="hero-skill">' + hero.skillName + '</div>';
    frame.appendChild(data);

    // 攻防圆形角标：左下红色=攻击，右下蓝色=防御（当前血量）
    var atkCircle = document.createElement('div');
    atkCircle.className = 'hero-stat-circle hero-atk-circle';
    atkCircle.title = '攻击 ' + hero.atk;
    atkCircle.textContent = hero.atk;
    card.appendChild(atkCircle);

    var defCircle = document.createElement('div');
    defCircle.className = 'hero-stat-circle hero-def-circle';
    defCircle.title = '防御 ' + hero.hp + '/' + hero.maxHp;
    defCircle.textContent = hero.hp;
    card.appendChild(defCircle);

    // 死亡遮罩（覆盖整卡）
    if (hero.hp <= 0) {
      var deadTag = document.createElement('div');
      deadTag.className = 'hero-dead-tag';
      deadTag.textContent = '已退场';
      card.appendChild(deadTag);
    }

    // 护盾角标（卡面右上）
    if (state && state.shield[hero.id] > 0) {
      var shield = document.createElement('div');
      shield.className = 'hero-shield';
      shield.textContent = '🛡' + state.shield[hero.id];
      card.appendChild(shield);
    }

    // 换肤按钮（多皮肤英雄，左上角）
    if (hero.skins && hero.skins.length > 1) {
      var skinBtn = document.createElement('button');
      skinBtn.type = 'button';
      skinBtn.className = 'hero-skin-btn';
      skinBtn.title = '切换皮肤（当前：' + (g.DSH_HEROES.skinOf(hero, hero.skinId) || {}).name + '）';
      skinBtn.textContent = '🎭';
      skinBtn.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation(); // 不触发拖动
        ev.preventDefault();
      });
      skinBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        cycleSkin(hero, state);
      });
      card.appendChild(skinBtn);
    }

    // 已行动角标
    if (state && state.usedThisTurn[hero.id]) {
      card.classList.add('acted');
    }

    return card;
  }

  /** 更新既有卡牌的护盾/行动/血量状态（轻量刷新） */
  function refreshHeroCard(card, hero, state) {
    if (!card) return;
    card.classList.toggle('dead', hero.hp <= 0);
    card.classList.toggle('acted', !!state.usedThisTurn[hero.id]);
    var fill = card.querySelector('.hero-hpbar-fill');
    if (fill) setHpBar(fill, hero.id, hero.hp, hero.maxHp);
    // 防御圆形角标随血量更新（防御数即血条）
    var defCircle = card.querySelector('.hero-def-circle');
    if (defCircle) {
      defCircle.textContent = hero.hp;
      defCircle.title = '防御 ' + hero.hp + '/' + hero.maxHp;
    }
    // 死亡遮罩
    var tag = card.querySelector('.hero-dead-tag');
    if (hero.hp <= 0 && !tag) {
      var t = document.createElement('div');
      t.className = 'hero-dead-tag';
      t.textContent = '已退场';
      card.appendChild(t);
    } else if (hero.hp > 0 && tag) {
      tag.remove();
    }
    // 护盾
    var oldShield = card.querySelector('.hero-shield');
    if (oldShield) oldShield.remove();
    if (state.shield[hero.id] > 0) {
      var s = document.createElement('div');
      s.className = 'hero-shield';
      s.textContent = '🛡' + state.shield[hero.id];
      card.appendChild(s);
    }
  }

  g.DSH_CardRenderer = {
    ROLE_ICON: ROLE_ICON,
    imageSrc: imageSrc,
    cycleSkin: cycleSkin,
    setHpBar: setHpBar,
    resetHpBars: resetHpBars,
    createHeroCard: createHeroCard,
    refreshHeroCard: refreshHeroCard
  };
})(typeof window !== 'undefined' ? window : globalThis);
