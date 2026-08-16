/**
 * popupRenderer.js — 弹窗（v3：选主将 / 战斗奖励 / 败局 / 营帐 / 随机事件 / 通用消息 / 数据统计）
 */
(function (g) {
  'use strict';

  var root = null;
  function getRoot() {
    if (!root) root = document.getElementById('modal-root');
    return root;
  }

  function clear() {
    var r = getRoot();
    if (r) r.innerHTML = '';
  }

  function overlay(boxClass) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var box = document.createElement('div');
    box.className = 'modal ' + (boxClass || '');
    overlay.appendChild(box);
    getRoot().appendChild(overlay);
    return { overlay: overlay, box: box };
  }

  /** 开局选主将（13 名英雄任选其一） */
  function showCommanderPick(onPick) {
    clear();
    var o = overlay('pick-modal');
    o.box.innerHTML = '<h2>🏮 选择主将</h2><p class="modal-sub">主将就是「你」：有血量、被怪物攻击，主将死 = 输。其余英雄将成为招式卡进卡包。</p>';
    var grid = document.createElement('div');
    grid.className = 'pick-grid';
    g.DSH_HEROES.HEROES.forEach(function (h) {
      var card = document.createElement('button');
      card.className = 'pick-card pick-cat-' + h.category;
      var cmdHp = h.hp * g.DSH_GameState.COMMANDER_HP_MULT;
      card.innerHTML =
        '<div class="pick-icon">' + (g.DSH_CardRenderer.CAT_ICON[h.category] || '🏮') + '</div>' +
        '<div class="pick-name">' + h.nick + '</div>' +
        '<div class="pick-sub">' + h.name + ' · ' + h.element + ' · 主将血' + cmdHp + '</div>' +
        '<div class="pick-talent">『' + h.talent.name + '』</div>' +
        '<div class="pick-desc">' + h.talent.desc + '</div>';
      card.addEventListener('click', function () {
        clear();
        onPick(h.id);
      });
      grid.appendChild(card);
    });
    o.box.appendChild(grid);
  }

  /** 战斗胜利奖励页（先做样子，数值/内容后续） */
  function showReward(state, onEnd) {
    clear();
    var o = overlay('reward-modal');
    o.box.innerHTML = '<h2>🏆 战斗胜利</h2>' +
      '<p class="modal-sub">第 ' + state.layer + ' 层 · ' +
      (state.battleKind === 'boss' ? '魔王战' : '小怪战') + ' 胜利，获得战利品</p>';
    var row = document.createElement('div');
    row.className = 'reward-row';
    var items = [
      { icon: '🃏', name: '英雄卡包', hint: '可获新英雄招式' },
      { icon: '💰', name: '马蹄金', hint: '用于购物' },
      { icon: '🍚', name: '军粮', hint: '体力，每日 5 点' },
      { icon: '🧿', name: '法宝', hint: '装备道具' }
    ];
    items.forEach(function (it) {
      var cell = document.createElement('div');
      cell.className = 'reward-cell';
      cell.innerHTML = '<div class="reward-icon">' + it.icon + '</div>' +
        '<div class="reward-name">' + it.name + '</div>' +
        '<div class="reward-hint">' + it.hint + '</div>';
      row.appendChild(cell);
    });
    o.box.appendChild(row);
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '结束';
    btn.addEventListener('click', function () { clear(); onEnd(); });
    o.box.appendChild(btn);
  }

  /** 败局弹窗 */
  function showResult(state, onHome) {
    clear();
    var o = overlay('result-modal lose');
    o.box.innerHTML = '<h2>💀 主将战死……</h2>' +
      '<p>坚持到第 ' + state.turn + ' 回合，倒在 ' + state.layer + ' 层。</p>' +
      '<p class="modal-sub">本局结束，返回首页重新出发</p>';
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '回到首页';
    btn.addEventListener('click', function () { clear(); onHome(); });
    o.box.appendChild(btn);
  }

  /** 营帐：休息 + 随机 buff（本层生效） */
  function showCamp(state, onDone) {
    clear();
    var o = overlay('camp-modal');
    o.box.innerHTML = '<h2>⛺ 营帐</h2><p class="modal-sub">扎营休息：恢复全部血量，并获得一个本层 buff</p>';
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '扎营休息';
    btn.addEventListener('click', function () {
      state.commander.hp = state.commander.maxHp;
      var pool = [
        { key: 'battlePct', value: 10, text: '本层战斗牌伤害 +10%' },
        { key: 'defPct', value: 10, text: '本层主将受击伤害 -10%' },
        { key: 'tianjiBonus', value: 1, text: '本层每回合天机 +1' }
      ];
      var pick = pool[Math.floor(state.rnd() * pool.length)];
      state.runBuffs[pick.key] = (state.runBuffs[pick.key] || 0) + pick.value;
      clear();
      g.DSH_PopupRenderer.showMessage('⛺ 休整完毕', '血量已回满。获得 buff：' + pick.text, onDone);
    });
    o.box.appendChild(btn);
  }

  /** 随机事件：buff 或 debuff */
  function showEvent(state, onDone) {
    clear();
    var good = [
      { key: 'battlePct', value: 15, text: '本层战斗牌伤害 +15%' },
      { key: 'defPct', value: 10, text: '本层主将受击伤害 -10%' },
      { key: 'heal', value: 10, text: '立即恢复 10 点血量' }
    ];
    var bad = [
      { key: 'enemyAtkPct', value: 10, text: '本层怪物攻击 +10%' },
      { key: 'loseHp', value: 8, text: '失去 8 点血量' },
      { key: 'battlePct', value: -10, text: '本层战斗牌伤害 -10%' }
    ];
    var isGood = state.rnd() < 0.5;
    var pool = isGood ? good : bad;
    var pick = pool[Math.floor(state.rnd() * pool.length)];
    var title = isGood ? '✨ 奇遇（增益）' : '🌑 凶兆（减益）';

    if (pick.key === 'heal') {
      var real = Math.min(state.commander.maxHp - state.commander.hp, pick.value);
      state.commander.hp += real;
      g.DSH_PopupRenderer.showMessage(title, pick.text, onDone);
      return;
    }
    if (pick.key === 'loseHp') {
      state.commander.hp = Math.max(1, state.commander.hp - pick.value);
      g.DSH_PopupRenderer.showMessage(title, pick.text + '（剩余 ' + state.commander.hp + ' 血）', onDone);
      return;
    }
    state.runBuffs[pick.key] = (state.runBuffs[pick.key] || 0) + pick.value;
    g.DSH_PopupRenderer.showMessage(title, pick.text, onDone);
  }

  /** 数据统计浮层（点击空白/退出按钮关闭） */
  function showStats(bestLayer, layer, onClose) {
    clear();
    var o = overlay('stats-modal');
    o.box.innerHTML = '<h2>📊 数据统计</h2>' +
      '<div class="stats-row"><span class="stats-label">历史最高层数</span><span class="stats-value">' +
      bestLayer + ' 层</span></div>' +
      '<div class="stats-row"><span class="stats-label">当前层数</span><span class="stats-value">' +
      layer + ' 层</span></div>';
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '退出';
    btn.addEventListener('click', function () { clear(); onClose(); });
    o.box.appendChild(btn);
    o.overlay.addEventListener('click', function (ev) {
      if (ev.target === o.overlay) { clear(); onClose(); }
    });
  }

  /** 通用消息弹窗 */
  function showMessage(title, text, onClose) {
    clear();
    var o = overlay();
    o.box.innerHTML = '<h2>' + title + '</h2><p>' + (text || '') + '</p>';
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '确定';
    btn.addEventListener('click', function () {
      clear();
      if (onClose) onClose();
    });
    o.box.appendChild(btn);
  }

  g.DSH_PopupRenderer = {
    showCommanderPick: showCommanderPick,
    showReward: showReward,
    showResult: showResult,
    showCamp: showCamp,
    showEvent: showEvent,
    showStats: showStats,
    showMessage: showMessage,
    clear: clear
  };
})(typeof window !== 'undefined' ? window : globalThis);
