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
  /** 跨局 meta 同步（马蹄金/历史最高层/善恶值：战败清档后不丢） */
  function syncMeta() {
    g.DSH_SaveSystem.setMeta({
      gold: state.gold,
      bestLayer: state.bestLayer || 0,
      alignment: state.alignment || 0
    });
  }

  function handleBattleEnd() {
    if (state.over === 'win') {
      if (state.layer > state.bestLayer) state.bestLayer = state.layer;
      if (state.battleKind === 'tutorial') {
        // 新手教学（流寇）：给一点启动金，然后进入路线选择
        state.gold += 10;
        state.rewardApplied = true;
        g.DSH_SaveSystem.setMeta({ tutored: true });
        g.DSH_PopupRenderer.showMessage('🏠 村子得救',
          '你与村民阿大、阿二、阿三联手击退了流寇，村子保住了（+10 金）。\n佣兵之路正式开始——选择你的立场吧。',
          showRouteChoice);
        return;
      }
      if (!state.rewardApplied) state.lastReward = g.DSH_Economy.victoryRewards(state);
      syncMeta();
      g.DSH_PopupRenderer.showReward(state, state.lastReward, onRewardEnd);
    } else if (state.over === 'lose') {
      syncMeta();
      g.DSH_PopupRenderer.showResult(state, onLoseHome);
    }
  }

  /** 路线选择入口：善恶 ±10 时被通缉/被复仇，路线锁定（用户设定：打善boss → 下层层要打官军） */
  function showRouteChoice() {
    var forced = null;
    if (state.alignment < 0) {
      forced = { route: 'good', reason: '你杀了山河盟主，官军正通缉你——只能走对抗山河盟的路线' };
    } else if (state.alignment > 0) {
      forced = { route: 'evil', reason: '你杀了曜魔宗主，魔宗正悬赏你——只能走讨伐曜魔宗的路线' };
    }
    g.DSH_PopupRenderer.showRouteChoice(state, function (route) {
      state.route = route;
      g.DSH_GameState.pushLog(state, '🛤 本层路线：' + (route === 'good' ? '劫掠山河盟（对抗官军）' : '讨伐曜魔宗（对抗魔军）'));
      showMap();
    }, { forced: forced });
  }

  /** 奖励页「结束」：节点推进；魔王战胜利 → 善恶结算 + 开启下一层 */
  function onRewardEnd() {
    var node = firstUndoneNode();
    if (node) node.done = true;

    if (state.battleKind === 'boss') {
      // 善恶值：打善boss（杀善者=恶 -10）/ 打恶boss（杀恶者=善 +10）
      state.alignment = state.bossChoice === 'good' ? -10 : 10;
      state.layer += 1;
      state.mapNodes = g.DSH_GameState.buildMapNodes();
      state.runBuffs = { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0 };
      var settle = g.DSH_Economy.settleAlignment(state); // 周期结算：金币 + 下一层层 buff
      state.bossChoice = null;
      syncMeta();
      g.DSH_PopupRenderer.showMessage('🗺 第 ' + state.layer + ' 层 · ' + settle.title,
        settle.text, showRouteChoice);
      return;
    }
    showMap();
  }

  function onLoseHome() {
    syncMeta();
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
    if (type === 'monster' || type === 'boss') {
      // 军粮（体力）门槛：进战斗消耗 1，胜利返还
      if (!g.DSH_Economy.canEnterBattle(state)) {
        g.DSH_PopupRenderer.showMessage('🍚 军粮不足',
          '进入战斗需要 ' + g.DSH_Economy.BATTLE_RATION_COST + ' 军粮（每日 ' + g.DSH_Economy.RATIONS_MAX +
          ' 点）。可在首页「商店」补给，或明日再来。');
        return;
      }
      if (type === 'boss') {
        // 层末 boss 可选：善 boss（山河盟主）/ 恶 boss（曜魔宗主）—— 决定善恶值
        g.DSH_PopupRenderer.showBossChoice(state, function (choice) {
          state.bossChoice = choice;
          g.DSH_Economy.enterBattle(state);
          startBattle('boss');
        });
        return;
      }
      g.DSH_Economy.enterBattle(state);
      startBattle(type);
    }
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
  }

  function renderMap() {
    var layerEl = document.getElementById('map-layer');
    if (layerEl) {
      var foe = state.route === 'good' ? ' · 对抗山河盟（官军）' : (state.route === 'evil' ? ' · 讨伐曜魔宗（魔军）' : '');
      layerEl.textContent = '第 ' + state.layer + ' 层' + foe;
    }
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

    // 起始点：王下村（路径最下方）
    var start = document.createElement('div');
    start.className = 'map-node start';
    start.innerHTML = '<div class="map-node-icon">🏘</div>' +
      '<div class="map-node-label">王下村</div>' +
      '<div class="map-node-state">起点</div>';
    nodesEl.appendChild(start);
  }

  function showMap() {
    g.DSH_PopupRenderer.clear();
    renderMap();
    showPage('map');
  }

  /* ---------------- 首页 ---------------- */
  /** 只刷新首页数值（商店/招募关闭后调用，避免 renderHome 用旧存档覆盖军粮） */
  function refreshHomeStats() {
    var goldEl = document.getElementById('home-gold');
    if (goldEl) goldEl.textContent = state.gold;
    var rationsEl = document.getElementById('home-rations');
    if (rationsEl) rationsEl.textContent = state.rations + '/5';
    var alignEl = document.getElementById('home-align');
    if (alignEl) {
      alignEl.textContent = (state.alignment > 0 ? '+' : '') + (state.alignment || 0) +
        ' · ' + g.DSH_Economy.alignmentTitle(state.alignment);
    }
  }

  function renderHome() {
    // 军粮每次刷新/回首页即回满（避免 0 军粮卡死无法进游戏）
    state.rations = g.DSH_Economy.RATIONS_MAX;
    g.DSH_SaveSystem.setRations(state.rations);
    refreshHomeStats();
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
    // 保留 meta（金币/军粮/最高层/善恶），重置局内
    state.layer = 1;
    state.commander = null;
    state.pack = [];
    state.mapNodes = g.DSH_GameState.buildMapNodes();
    state.runBuffs = { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0 };
    state.route = null;
    state.bossChoice = null;
    g.DSH_SaveSystem.clear();
    g.DSH_PopupRenderer.showCommanderPick(function (heroId) {
      var def = g.DSH_HEROES.byId(heroId);
      var hp = def.hp * g.DSH_GameState.COMMANDER_HP_MULT;
      state.commander = { heroId: heroId, hp: hp, maxHp: hp, defense: 0, fabao: null };
      // 卡包 = 常规偏将 ×4 + 村民 ABC 各 1 张（雇佣兵初始队友，保证入包）
      var pack = g.DSH_GameState.buildPack(heroId);
      g.DSH_HEROES.STARTERS.forEach(function (h) {
        pack.push({ uid: h.id + '#x' + pack.length, heroId: h.id });
      });
      state.pack = pack;
      g.DSH_GameState.pushLog(state, '🏮 主将选定：' + def.nick + '（' + def.name + '）· 天赋『' + def.talent.name + '』');
      g.DSH_GameState.pushLog(state, '🏘 村民阿大、阿二、阿三加入队伍（各自招式卡 1 张入卡包）');
      // 新手教学（流寇战）：仅第一次跑（meta.tutored），之后直接选路线
      var meta = g.DSH_SaveSystem.getMeta();
      if (meta.tutored) {
        g.DSH_PopupRenderer.showMessage('⚔ 老练佣兵', '你已是走南闯北的老佣兵，直接选择本层的立场吧。', showRouteChoice);
      } else {
        g.DSH_PopupRenderer.showMessage('🏘 出生村·王下村',
          '你是云游四方的雇佣兵，途经王下村，与村民阿大、阿二、阿三结识。\n村外流寇作乱——先联手击退他们！（新手教学战，无军粮消耗）',
          function () { startBattle('tutorial'); });
      }
    });
  }

  function loadRun() {
    var d = g.DSH_SaveSystem.load();
    if (!d) { showHome(); return; }
    var meta = g.DSH_SaveSystem.getMeta();
    state.layer = d.layer;
    state.mapNodes = d.mapNodes;
    state.commander = d.commander;
    state.pack = d.pack;
    state.runBuffs = d.runBuffs || { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0 };
    state.route = d.route || null; // 旧档无路线 → 默认魔军
    state.gold = (meta.gold !== undefined) ? meta.gold : (d.gold || 0);
    state.rations = g.DSH_SaveSystem.rationsToday(); // 军粮为每日资源，以当日同步值为准
    state.bestLayer = meta.bestLayer || d.bestLayer || 0;
    state.alignment = (meta.alignment !== undefined) ? meta.alignment : 0;
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
          if (id === 'home-shop-btn') g.DSH_PopupRenderer.showShop(state, refreshHomeStats);
          else g.DSH_PopupRenderer.showRecruit(state, refreshHomeStats);
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
    // 跨局 meta：马蹄金 / 历史最高层 / 善恶值（战败清档后仍保留）
    var meta = g.DSH_SaveSystem.getMeta();
    if (meta.gold !== undefined) state.gold = meta.gold;
    if (meta.bestLayer) state.bestLayer = meta.bestLayer;
    if (meta.alignment !== undefined) state.alignment = meta.alignment;
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
    loadRun: loadRun,
    showRouteChoice: showRouteChoice,
    /** 测试用：强制当前战斗胜利（smoke-dom 走流程用） */
    forceWin: function () {
      state.enemies.forEach(function (e) { e.hp = 0; e.alive = false; });
      if (state.boss) { state.boss.hp = 0; state.boss.alive = false; }
      g.DSH_BattleSystem.checkWin(state);
      handleBattleEnd();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
