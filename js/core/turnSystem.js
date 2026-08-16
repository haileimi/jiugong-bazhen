/**
 * turnSystem.js — 回合流转
 *
 * 开局：抽上卦 → 首抽 9 张（固定含萧靳 wz3）→ 重算卦象 → 注册规则 → 开战
 * 玩家回合 → 魔王行动（≤4 次）→ 结算（持续伤害、回牌库、重抽、重算卦象、天机回满）→ 下回合
 */
(function (g) {
  'use strict';

  function shuffle(state, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(state.rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** 从牌库抽 5 张上桌；首回合固定包含萧靳（wz3） */
  function drawBoard(state) {
    var GS = g.DSH_GameState;
    var pool = GS.aliveHeroes(state).map(function (h) { return h.id; });
    var picked = [];

    if (state.turn === 1 && pool.indexOf('wz3') >= 0) {
      picked.push('wz3');
      pool = pool.filter(function (id) { return id !== 'wz3'; });
    }
    pool = shuffle(state, pool);
    while (picked.length < GS.SLOT_COUNT && pool.length > 0) picked.push(pool.shift());

    // 随机布入 5 格（上 3 下 2）
    state.board = new Array(GS.SLOT_COUNT).fill(null);
    var slots = shuffle(state, [0, 1, 2, 3, 4].slice(0, GS.SLOT_COUNT));
    picked.forEach(function (id, i) { state.board[slots[i]] = id; });
  }

  /** 重算卦象并注册规则 */
  function recomputeHexagram(state, events) {
    var hex = g.DSH_HexSystem.resolveHexagram(state);
    g.DSH_RuleSystem.registerRules(state, events);
    return hex;
  }

  /** 开局：选定上卦后初始化（上卦选择由调用方先设置 state.upperTrigram） */
  function startGame(state, events) {
    var GS = g.DSH_GameState;
    state.phase = 'player';
    state.turn = 1;
    drawBoard(state);
    recomputeHexagram(state, events);
    events.emit('battleStart', { state: state });
    events.emit('turnStart', { state: state });
    GS.pushLog(state, '对战开始！当前卦象：' + state.currentHexagram.name +
      '（上' + state.currentHexagram.upperSymbol + '下' + state.currentHexagram.lowerSymbol + '）');
  }

  /** 玩家点击「回合完毕」 */
  function endPlayerTurn(state, events) {
    var GS = g.DSH_GameState;
    if (state.phase !== 'player' || state.over) return;

    // 1. 魔王行动（最多 4 次）
    g.DSH_BattleSystem.bossActPhase(state, events);
    if (state.over) return;

    // 2. 回合结算：持续伤害
    g.DSH_BattleSystem.applyDot(state, events);
    if (state.over) return;

    // 3. 桌面回牌库（血量保留），清空桌面
    state.board = new Array(9).fill(null);

    // 4. 天机回满，重置本回合标记
    state.tianji = state.maxTianji;
    state.usedThisTurn = {};
    state.frozen = {};
    state.stats.attackCountThisTurn = 0;
    state.stats.consecutiveAttacks = 0;
    state.stats.comboBonus = 0;
    state.stats.nextAttackCrit = false;
    state.turn += 1;

    // 5. 重新抽 9 张 → 重算卦象 → 注册规则
    drawBoard(state);
    recomputeHexagram(state, events);

    // 6. 回合开始规则（护盾/回复/灼烧）
    events.emit('turnStart', { state: state });

    state.phase = 'player';
    GS.pushLog(state, '—— 第 ' + state.turn + ' 回合，天机回满 ——');
  }

  g.DSH_TurnSystem = {
    shuffle: shuffle,
    drawBoard: drawBoard,
    recomputeHexagram: recomputeHexagram,
    startGame: startGame,
    endPlayerTurn: endPlayerTurn
  };
})(typeof window !== 'undefined' ? window : globalThis);
