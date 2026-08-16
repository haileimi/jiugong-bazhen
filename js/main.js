/**
 * main.js — 页面路由与流程控制（v3：首页 → 地图 → 战斗 → 奖励）
 *
 * 首页：马蹄金 / 军粮（每日 5 点）展示；开始战斗（有存档变「继续战斗」）；商店/招募所（开发中）
 * 地图：第 N 层 · 小怪战斗点 → 营帐 → 随机事件 → 魔王战斗点（线性推进）；保存并退出 / 数据统计
 * 战斗：点手牌 → 放大摆动 → 点怪攻击；护卫/计谋点出即打；回合完毕 → 怪物打主将
 * 奖励：战斗胜利弹奖励页（样子），结束回地图；魔王战胜利开启下一层
 */
(function (g) {
  'use strict';

  var state = null;
  var events = null;
  var currentTab = '战斗日志';
  var pageEls = {};

  /* ---------------- 页面切换 ---------------- */
  function showPage(name) {
    Object.keys(pageEls).forEach(function (k) {
      pageEls[k].style.display = k === name ? '' : 'none';
    });
  }

  function renderDebugTab() {
    var content = document.getElementById('debug-content');
    if (!content) return;
    content.innerHTML = '';
    content.appendChild(g.DSH_BattleRenderer.debugContent(currentTab, state));
  }

  /* ---------------- 战斗流程 ---------------- */
  function handleBattleEnd() {
    if (state.over === 'win') {
      if (state.layer > state.bestLayer) state.bestLayer = state.layer;
      g.DSH_PopupRenderer.showReward(state, onRewardEnd);
    } else if (state.over === 'lose') {
      g.DSH_PopupRenderer.showResult(state, onLoseHome);
    }
  }

  /** 奖励页「结束」：节点推进；魔王战胜利 → 下一层 */
  function onRewardEnd() {
    var node = firstUndoneNode();
    if (node) node.done = true;

    if (state.battleKind === 'boss') {
      state.layer += 1;
      state.mapNodes = g.DSH_GameState.buildMapNodes();
      state.runBuffs = { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0 };
      g.DSH_PopupRenderer.showMessage('🗺 新地图开启', '魔王已伏诛，前方是第 ' + state.layer + ' 层！', showMap);
      return;
    }
    showMap();
  }

  function onLoseHome() {
    g.DSH_SaveSystem.clear();
    showHome();
  }

  /** 出牌回调（点击控制器 → 战斗系统） */
  function playCardCallback(uid, enemyId) {
    var r = g.DSH_BattleSystem.playCard(state, events, uid, enemyId);
    if (!r) return null;
    g.DSH_BattleRenderer.renderAll(state);
    g.DSH_BattleRenderer.applyHitFlashes(state);
    g.DSH_BattleRenderer.renderEnemyTargets(state);
    renderDebugTab();
    if (state.over) handleBattleEnd();
    return r;
  }

  function endTurn() {
    if (!state || state.phase !== 'player' || state.over) return;
    var btn = document.getElementById('end-turn-btn');
    if (btn) btn.disabled = true;
    g.DSH_TurnSystem.endPlayerTurn(state, events);
    g.DSH_BattleRenderer.renderAll(state);
    g.DSH_BattleRenderer.applyHitFlashes(state);
    g.DSH_BattleRenderer.renderEnemyTargets(state);
    renderDebugTab();
    if (btn) btn.disabled = false;
    if (state.over) handleBattleEnd();
  }

  function startBattle(kind) {
    g.DSH_CardRenderer.resetHpBars();
    g.DSH_TurnSystem.startBattle(state, events, kind);
    g.DSH_BattleRenderer.renderTabs(currentTab);
    g.DSH_BattleRenderer.renderAll(state);
    g.DSH_BattleRenderer.renderEnemyTargets(state);
    renderDebugTab();
    showPage('battle');
  }

  /* ---------------- 地图 ---------------- */
  function firstUndoneNode() {
    for (var i = 0; i < state.mapNodes.length; i++) {
      if (!state.mapNodes[i].done) return state.mapNodes[i];
    }
    return null;
  }

  function nodeAct(type) {
    if (type === 'monster') startBattle('monster');
    else if (type === 'camp') g.DSH_PopupRenderer.showCamp(state, function () {
      var n = firstUndoneNode();
      if (n) n.done = true;
      showMap();
    });
    else if (type === 'event') g.DSH_PopupRenderer.showEvent(state, function () {
      var n = firstUndoneNode();
      if (n) n.done = true;
      showMap();
    });
    else if (type === 'boss') startBattle('boss');
  }

  function renderMap() {
    var layerEl = document.getElementById('map-layer');
    if (layerEl) layerEl.textContent = '第 ' + state.layer + ' 层';
    var nodesEl = document.getElementById('map-nodes');
    if (!nodesEl) return;
    nodesEl.innerHTML = '';
    var current = firstUndoneNode();
    // 路径倒置展示：魔王战最上面（显示顺序 boss → 事件 → 营帐 → 小怪）
    state.mapNodes.slice().reverse().forEach(function (node) {
      var isCurrent = node === current;
      var item = document.createElement('div');
      item.className = 'map-node' + (node.done ? ' done' : '') + (isCurrent ? ' current' : '');
      var icon = { monster: '👹', camp: '⛺', event: '✨', boss: '👑' }[node.type] || '?';
      item.innerHTML = '<div class="map-node-icon">' + (node.done ? '✅' : icon) + '</div>' +
        '<div class="map-node-label">' + node.label + '</div>' +
        '<div class="map-node-state">' + (node.done ? '已完成' : (isCurrent ? '可进入' : '未解锁')) + '</div>';
      if (isCurrent) {
        item.classList.add('clickable');
        item.addEventListener('click', function () { nodeAct(node.type); });
      }
      nodesEl.appendChild(item);
      // 连接线
      var link = document.createElement('div');
      link.className = 'map-link' + (node.done ? ' done' : '');
      nodesEl.appendChild(link);
    });
  }

  function showMap() {
    g.DSH_PopupRenderer.clear();
    renderMap();
    showPage('map');
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    state.rations = g.DSH_SaveSystem.rationsToday();
    var goldEl = document.getElementById('home-gold');
    if (goldEl) goldEl.textContent = state.gold;
    var rationsEl = document.getElementById('home-rations');
    if (rationsEl) rationsEl.textContent = state.rations + '/5';
    var startBtn = document.getElementById('home-start-btn');
    if (startBtn) {
      var has = g.DSH_SaveSystem.hasSave();
      startBtn.textContent = has ? '继续战斗' : '开始战斗';
    }
  }

  function showHome() {
    g.DSH_PopupRenderer.clear();
    renderHome();
    showPage('home');
  }

  function newRun() {
    // 保留 meta（金币/军粮/最高层），重置局内
    state.layer = 1;
    state.commander = null;
    state.pack = [];
    state.mapNodes = g.DSH_GameState.buildMapNodes();
    state.runBuffs = { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0 };
    g.DSH_SaveSystem.clear();
    g.DSH_PopupRenderer.showCommanderPick(function (heroId) {
      var def = g.DSH_HEROES.byId(heroId);
      var hp = def.hp * g.DSH_GameState.COMMANDER_HP_MULT;
      state.commander = { heroId: heroId, hp: hp, maxHp: hp, defense: 0 };
      state.pack = g.DSH_GameState.buildPack(heroId);
      g.DSH_GameState.pushLog(state, '🏮 主将选定：' + def.nick + '（' + def.name + '）· 天赋『' + def.talent.name + '』');
      showMap();
    });
  }

  function loadRun() {
    var d = g.DSH_SaveSystem.load();
    if (!d) { showHome(); return; }
    state.layer = d.layer;
    state.mapNodes = d.mapNodes;
    state.commander = d.commander;
    state.pack = d.pack;
    state.runBuffs = d.runBuffs || { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0 };
    state.gold = d.gold || 0;
    state.rations = d.rations || g.DSH_SaveSystem.rationsToday();
    state.bestLayer = d.bestLayer || 0;
    showMap();
  }

  /* ---------------- 绑定 ---------------- */
  function bindUI() {
    var startBtn = document.getElementById('home-start-btn');
    if (startBtn && !startBtn.dataset.bound) {
      startBtn.dataset.bound = '1';
      startBtn.addEventListener('click', function () {
        if (g.DSH_SaveSystem.hasSave()) loadRun();
        else newRun();
      });
    }

    ['home-shop-btn', 'home-recruit-btn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', function () {
          g.DSH_PopupRenderer.showMessage('🚧 开发中', '商店/招募所正在建设中，敬请期待');
        });
      }
    });

    var endBtn = document.getElementById('end-turn-btn');
    if (endBtn && !endBtn.dataset.bound) {
      endBtn.dataset.bound = '1';
      endBtn.addEventListener('click', endTurn);
    }

    // 地图页顶栏：返回（保存并回首页）
    var mapBackBtn = document.getElementById('map-back-btn');
    if (mapBackBtn && !mapBackBtn.dataset.bound) {
      mapBackBtn.dataset.bound = '1';
      mapBackBtn.addEventListener('click', function () {
        g.DSH_SaveSystem.save(state);
        g.DSH_PopupRenderer.showMessage('💾 已保存', '进度已保存，返回首页', showHome);
      });
    }

    // 地图页顶栏：统计
    var statsBtn = document.getElementById('map-stats-btn');
    if (statsBtn && !statsBtn.dataset.bound) {
      statsBtn.dataset.bound = '1';
      statsBtn.addEventListener('click', function () {
        g.DSH_PopupRenderer.showStats(state.bestLayer, state.layer, function () {});
      });
    }

    // 战斗页顶栏：返回（确认后丢弃战斗数据）
    var battleBackBtn = document.getElementById('battle-back-btn');
    if (battleBackBtn && !battleBackBtn.dataset.bound) {
      battleBackBtn.dataset.bound = '1';
      battleBackBtn.addEventListener('click', function () {
        g.DSH_PopupRenderer.showConfirm('退出战斗', '当前战斗数据会丢失，确定退出？', function () {
          g.DSH_PopupRenderer.clear();
          showMap();
        });
      });
    }

    // 战斗页顶栏：卡包检视
    var packBtn = document.getElementById('battle-pack-btn');
    if (packBtn && !packBtn.dataset.bound) {
      packBtn.dataset.bound = '1';
      packBtn.addEventListener('click', function () {
        g.DSH_PopupRenderer.showPack(state);
      });
    }

    var bar = document.getElementById('debug-tabs');
    if (bar && !bar.dataset.bound) {
      bar.dataset.bound = '1';
      bar.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.debug-tab');
        if (!btn) return;
        currentTab = btn.dataset.tab;
        g.DSH_BattleRenderer.renderTabs(currentTab);
        renderDebugTab();
      });
    }

    g.DSH_ClickController.bind(state, events, playCardCallback);
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    events = new g.DSH_EventSystem();
    state = g.DSH_GameState.createState();
    g.DSH_CardRenderer.resetHpBars();

    pageEls = {
      home: document.getElementById('page-home'),
      map: document.getElementById('page-map'),
      battle: document.getElementById('page-battle')
    };

    bindUI();
    g.DSH_BattleRenderer.renderTabs(currentTab);
    renderDebugTab();
    showHome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 测试/调试钩子（smoke-dom 用）
  g.DSH_APP = {
    getState: function () { return state; },
    getEvents: function () { return events; },
    endTurn: endTurn,
    playCard: playCardCallback,
    startBattle: startBattle,
    showHome: showHome,
    showMap: showMap,
    newRun: newRun,
    loadRun: loadRun
  };
})(typeof window !== 'undefined' ? window : globalThis);
