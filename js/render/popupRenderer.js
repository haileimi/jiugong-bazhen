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

  /** 开局选主将（16 名英雄任选其一） */
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

  /** 战斗胜利奖励页（数值化：真实结算的金币/军粮/英雄卡） */
  function showReward(state, reward, onEnd) {
    clear();
    var o = overlay('reward-modal');
    o.box.innerHTML = '<h2>🏆 战斗胜利</h2>' +
      '<p class="modal-sub">第 ' + state.layer + ' 层 · ' +
      (state.battleKind === 'boss' ? '魔王战' : '小怪战') + ' 胜利，获得战利品</p>';
    var row = document.createElement('div');
    row.className = 'reward-row';
    var items = [
      { icon: '💰', name: '马蹄金', value: '+ ' + ((reward && reward.gold) || 0), hint: '商店 / 招募所消费' },
      { icon: '🍚', name: '军粮', value: (reward && reward.rationGained > 0) ? '+ ' + reward.rationGained : '已满',
        hint: '每日 ' + g.DSH_Economy.RATIONS_MAX + ' 点' },
      { icon: '🃏', name: '英雄卡', value: (reward && reward.cards.length) ? '× ' + reward.cards.length : '无',
        hint: '卡包成长' }
    ];
    items.forEach(function (it) {
      var cell = document.createElement('div');
      cell.className = 'reward-cell';
      cell.innerHTML = '<div class="reward-icon">' + it.icon + '</div>' +
        '<div class="reward-name">' + it.name + '</div>' +
        '<div class="reward-value">' + it.value + '</div>' +
        '<div class="reward-hint">' + it.hint + '</div>';
      row.appendChild(cell);
    });
    o.box.appendChild(row);
    // 掉卡详情
    if (reward && reward.cards.length) {
      var names = reward.cards.map(function (hid) {
        var h = g.DSH_HEROES.byId(hid);
        return '『' + h.nick + ' · ' + h.name + '』';
      }).join('、');
      var drop = document.createElement('p');
      drop.className = 'reward-drop';
      drop.textContent = '🎁 获得新招式卡：' + names;
      o.box.appendChild(drop);
    }
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '结束';
    btn.addEventListener('click', function () { clear(); onEnd(); });
    o.box.appendChild(btn);
  }

  /** 商店：招式卡包 / 军粮补给（onClose 关闭时回调，用于刷新首页数值） */
  function showShop(state, onClose) {
    clear();
    var o = overlay('shop-modal');
    var box = o.box;
    function render(msg) {
      box.innerHTML = '';
      var title = document.createElement('h2');
      title.textContent = '🏪 商店';
      box.appendChild(title);
      var bal = document.createElement('div');
      bal.className = 'shop-balance';
      bal.innerHTML = '<span>💰 马蹄金 <b>' + state.gold + '</b></span>' +
        '<span>🍚 军粮 <b>' + state.rations + '/' + g.DSH_Economy.RATIONS_MAX + '</b></span>';
      box.appendChild(bal);
      var sub = document.createElement('p');
      sub.className = 'modal-sub';
      if (!g.DSH_Economy.hasRun(state)) {
        sub.textContent = '⚠ 还没有进行中的战斗，请先「开始战斗」。购买的卡牌将加入当前局的卡包。';
      } else {
        sub.textContent = '卡牌直接加入当前局卡包（可超 48 张成长）';
      }
      box.appendChild(sub);
      // 招式卡包
      var packBtn = document.createElement('button');
      packBtn.className = 'price-btn' + (g.DSH_Economy.hasRun(state) && state.gold >= g.DSH_Economy.PACK_CARD_PRICE ? '' : ' disabled');
      packBtn.innerHTML = '<span>🃏 招式卡包</span><span class="price">' + g.DSH_Economy.PACK_CARD_PRICE + ' 金</span>' +
        '<span class="price-sub">随机 1 名偏将的招式卡</span>';
      if (g.DSH_Economy.hasRun(state)) {
        packBtn.addEventListener('click', function () {
          render(g.DSH_Economy.buyPackCard(state).msg);
        });
      }
      box.appendChild(packBtn);
      // 军粮补给
      var rationBtn = document.createElement('button');
      rationBtn.className = 'price-btn' +
        (g.DSH_Economy.hasRun(state) && state.gold >= g.DSH_Economy.RATION_PRICE && state.rations < g.DSH_Economy.RATIONS_MAX ? '' : ' disabled');
      rationBtn.innerHTML = '<span>🍚 军粮补给</span><span class="price">' + g.DSH_Economy.RATION_PRICE + ' 金</span>' +
        '<span class="price-sub">军粮 +1（每日 ' + g.DSH_Economy.RATIONS_MAX + ' 点封顶）</span>';
      if (g.DSH_Economy.hasRun(state) && state.rations < g.DSH_Economy.RATIONS_MAX) {
        rationBtn.addEventListener('click', function () {
          render(g.DSH_Economy.buyRation(state).msg);
        });
      }
      box.appendChild(rationBtn);

      // 法宝（装备主将，替换旧法宝）
      var fabaoTitle = document.createElement('div');
      fabaoTitle.className = 'shop-section';
      fabaoTitle.textContent = '🧿 法宝（装备主将，战斗中生效）';
      box.appendChild(fabaoTitle);
      g.DSH_Economy.FABAOS.forEach(function (f) {
        var equipped = g.DSH_Economy.fabaoOf(state) && g.DSH_Economy.fabaoOf(state).id === f.id;
        var btn2 = document.createElement('button');
        btn2.className = 'price-btn' +
          (g.DSH_Economy.hasRun(state) && state.gold >= f.price ? '' : ' disabled');
        btn2.innerHTML = '<span>' + f.icon + ' ' + f.name + '</span>' +
          '<span class="price">' + (equipped ? '已装备' : f.price + ' 金') + '</span>' +
          '<span class="price-sub">' + f.desc + '</span>';
        if (g.DSH_Economy.hasRun(state)) {
          btn2.addEventListener('click', function () {
            render(g.DSH_Economy.buyFabao(state, f.id).msg);
          });
        }
        box.appendChild(btn2);
      });

      if (msg) {
        var line = document.createElement('p');
        line.className = 'shop-result';
        line.textContent = msg;
        box.appendChild(line);
      }
      var closeBtn = document.createElement('button');
      closeBtn.className = 'primary-btn';
      closeBtn.textContent = '关闭';
      closeBtn.addEventListener('click', function () { clear(); if (onClose) onClose(); });
      box.appendChild(closeBtn);
    }
    render(null);
  }

  /** 招募所：花金招募指定偏将招式卡（onClose 关闭时回调） */
  function showRecruit(state, onClose) {
    clear();
    var o = overlay('recruit-modal');
    var box = o.box;
    function render(msg) {
      box.innerHTML = '';
      var title = document.createElement('h2');
      title.textContent = '🏮 招募所';
      box.appendChild(title);
      var sub = document.createElement('p');
      sub.className = 'modal-sub';
      if (!g.DSH_Economy.hasRun(state)) {
        sub.textContent = '⚠ 还没有进行中的战斗，请先「开始战斗」。招募的招式卡将加入当前局卡包。';
      } else {
        sub.textContent = '花 ' + g.DSH_Economy.RECRUIT_PRICE + ' 金招募指定偏将招式卡 ×1（卡包可超 48 成长）';
      }
      box.appendChild(sub);
      var bal = document.createElement('div');
      bal.className = 'shop-balance';
      bal.innerHTML = '<span>💰 马蹄金 <b>' + state.gold + '</b></span>' +
        '<span>🃏 卡包 <b>' + state.pack.length + '</b> 张</span>';
      box.appendChild(bal);
      if (msg) {
        var line = document.createElement('p');
        line.className = 'shop-result';
        line.textContent = msg;
        box.appendChild(line);
      }
      var grid = document.createElement('div');
      grid.className = 'recruit-grid';
      g.DSH_HEROES.HEROES.forEach(function (h) {
        var isCommander = state.commander && h.id === state.commander.heroId;
        var affordable = g.DSH_Economy.hasRun(state) && !isCommander && state.gold >= g.DSH_Economy.RECRUIT_PRICE;
        var cell = document.createElement('button');
        cell.className = 'recruit-card recruit-cat-' + h.category +
          (isCommander ? ' commander' : '') + (affordable ? '' : ' unaffordable');
        cell.innerHTML =
          '<div class="recruit-icon">' + (g.DSH_CardRenderer.CAT_ICON[h.category] || '🏮') + '</div>' +
          '<div class="recruit-info">' +
          '<div class="recruit-name">' + h.nick + ' <span class="pack-sub">' + h.name + ' · ' + h.element + '</span></div>' +
          '<div class="recruit-desc">' + h.desc + '</div>' +
          '<div class="recruit-price">' + (isCommander ? '主将 · 不可招募' : g.DSH_Economy.RECRUIT_PRICE + ' 金 / 1 张') + '</div>' +
          '</div>';
        if (!isCommander && g.DSH_Economy.hasRun(state)) {
          cell.addEventListener('click', function () {
            render(g.DSH_Economy.recruitHero(state, h.id).msg);
          });
        }
        grid.appendChild(cell);
      });
      box.appendChild(grid);
      var closeBtn = document.createElement('button');
      closeBtn.className = 'primary-btn';
      closeBtn.textContent = '关闭';
      closeBtn.addEventListener('click', function () { clear(); if (onClose) onClose(); });
      box.appendChild(closeBtn);
    }
    render(null);
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

  /** 卡包检视：查看全部卡牌（每种英雄：卡包张数 / 手牌张数） */
  function showPack(state) {
    clear();
    var o = overlay('pack-modal');
    o.box.innerHTML = '<h2>🃏 卡包（' + state.pack.length + ' 张）</h2>' +
      '<p class="modal-sub">主将之外的英雄都是招式牌；点击手牌使用，用完回卡包</p>';
    var grid = document.createElement('div');
    grid.className = 'pack-grid';
    var heroIds = [];
    state.pack.forEach(function (c) { if (heroIds.indexOf(c.heroId) < 0) heroIds.push(c.heroId); });
    heroIds.forEach(function (hid) {
      var h = g.DSH_HEROES.byId(hid);
      if (!h) return;
      var copies = state.pack.filter(function (c) { return c.heroId === hid; }).length;
      var inHand = state.hand.filter(function (u) {
        var c = g.DSH_GameState.getCard(state, u);
        return c && c.heroId === hid;
      }).length;
      var cell = document.createElement('div');
      cell.className = 'pack-cell pack-cat-' + h.category;
      cell.innerHTML = '<div class="pack-icon">' + (g.DSH_CardRenderer.CAT_ICON[h.category] || '🏮') + '</div>' +
        '<div class="pack-name">' + h.nick + ' <span class="pack-sub">' + h.name + ' · ' + h.element + '</span></div>' +
        '<div class="pack-desc">' + h.desc + '</div>' +
        '<div class="pack-count">卡包 ' + copies + ' 张' + (inHand > 0 ? ' · 手牌 ' + inHand + ' 张' : '') + '</div>';
      grid.appendChild(cell);
    });
    o.box.appendChild(grid);
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '关闭';
    btn.addEventListener('click', function () { clear(); });
    o.box.appendChild(btn);
  }

  /** 确认弹窗（确定 / 取消） */
  function showConfirm(title, text, onOk, onCancel) {
    clear();
    var o = overlay();
    o.box.innerHTML = '<h2>' + title + '</h2><p>' + (text || '') + '</p>';
    var row = document.createElement('div');
    row.className = 'confirm-row';
    var okBtn = document.createElement('button');
    okBtn.className = 'primary-btn';
    okBtn.textContent = '确定';
    okBtn.addEventListener('click', function () { clear(); if (onOk) onOk(); });
    row.appendChild(okBtn);
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost-btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', function () { clear(); if (onCancel) onCancel(); });
    row.appendChild(cancelBtn);
    o.box.appendChild(row);
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
    showPack: showPack,
    showShop: showShop,
    showRecruit: showRecruit,
    showConfirm: showConfirm,
    showMessage: showMessage,
    clear: clear
  };
})(typeof window !== 'undefined' ? window : globalThis);
