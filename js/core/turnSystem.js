/**
 * turnSystem.js — 回合流转（v3 主将制 + 卡包 + 每场重算卦象）
 *
 * 战斗流程：
 *   开局（选将后进入）→ 小怪战/魔王战 startBattle → 玩家回合（点卡出招）→
 *   回合完毕 → 怪物行动（打主将）→ 持续伤害 → 补手牌 5 张 → 天机回满 → 下回合
 * 卦象节奏（每场战斗重新算）：第 3 回合抽下卦 → 第 5 回合抽上卦 → 第 7 回合天命（64 卦）
 */
(function (g) {
  'use strict';

  var GS = function () { return g.DSH_GameState; };

  /** 从卡包随机抽 n 张入手的 uid（不重复） */
  function drawFromPack(state, n) {
    var pool = GS().shuffle(state, state.pack.map(function (c) { return c.uid; }));
    var picked = [];
    pool.forEach(function (uid) {
      if (picked.length >= n) return;
      if (state.hand.indexOf(uid) < 0) picked.push(uid);
    });
    return picked;
  }

  /** 起手/补手：抽到 5 张（+ 观星眼/白泽天赋多抽） */
  function drawHand(state) {
    var bonus = 0;
    var talent = GS().commanderDef(state) && GS().commanderDef(state).talent;
    if (talent && talent.type === 'drawBonus') bonus = talent.value;
    var want = GS().BASE_DRAW + bonus - state.hand.length;
    if (want > 0) {
      var cards = drawFromPack(state, want);
      state.hand = state.hand.concat(cards);
    }
    GS().pushLog(state, '🃏 手牌抽至 ' + state.hand.length + ' 张');
  }

  /** 每回合天机上限（基础 3 + 破阵郎主将天赋 + 观星眼能力 + 层 buff） */
  function maxTianji(state) {
    var m = GS().BASE_TIANJI;
    var talent = GS().commanderDef(state) && GS().commanderDef(state).talent;
    if (talent && talent.type === 'tianjiPerTurn') m += talent.value;
    if (state.tianjiUpApplied) m += 1;
    m += state.runBuffs.tianjiBonus || 0;
    return m;
  }

  /** 建敌方阵容：小怪战 2 只随机魔将；魔王战 5 魔将 + 本体；按层数成长 */
  function buildEnemies(state) {
    var gen = g.DSH_ENEMIES.GENERALS;
    var layer = state.layer;
    var hpMul = 1 + 0.3 * (layer - 1);
    var atkMul = 1 + 0.15 * (layer - 1);
    function scale(e) {
      return {
        id: e.id, name: e.name, element: e.element,
        hp: Math.round(e.hp * hpMul), maxHp: Math.round(e.hp * hpMul),
        atk: Math.round(e.atk * atkMul), aoe: e.aoe, alive: true,
        category: e.category || '战斗'
      };
    }
    var picked;
    if (state.battleKind === 'boss') {
      picked = gen.map(scale);
      var b = g.DSH_ENEMIES.BOSS;
      state.boss = {
        id: b.id, name: b.name, element: b.element,
        hp: Math.round(b.hp * (1 + 0.25 * (layer - 1))),
        maxHp: Math.round(b.hp * (1 + 0.25 * (layer - 1))),
        atk: Math.round(b.atk * (1 + 0.12 * (layer - 1))), aoe: false, alive: true,
        category: b.category || '战斗'
      };
    } else {
      var pool = GS().shuffle(state, gen.slice());
      picked = pool.slice(0, 2).map(scale);
      state.boss = null;
    }
    state.enemies = picked;
  }

  /** 开始一场战斗（小怪战/魔王战） */
  function startBattle(state, events, kind) {
    GS().pushLog(state, '—— 第 ' + state.layer + ' 层 ' + (kind === 'boss' ? '魔王战' : '小怪战') + ' 开始 ——');
    state.battleKind = kind;
    state.turn = 1;
    state.phase = 'player';
    state.upperTrigram = null;
    state.lowerTrigram = null;
    state.currentHexagram = null;
    state.tianjiUpApplied = false;
    state.usedThisTurn = {};
    state.firstCardPlayedThisTurn = false;
    state.freeChase = {};
    state.frozen = {};
    state.frozenNext = {};
    state.burnStacks = {};
    state.windBurnLayers = {};
    state.atkDebuff = {};
    state.stats = {
      revived: false, firstAttackDone: false, attackCountThisTurn: 0,
      consecutiveAttacks: 0, comboBonus: 0, nextAttackCrit: false, onceSaveUsed: false
    };
    state.lastHits = [];
    state.over = null;
    state.rewardApplied = false;
    state.lastReward = null;

    buildEnemies(state);

    // 防御每场归零；铁脚汉主将天赋开局自带防御
    state.commander.defense = 0;
    var talent = GS().commanderDef(state).talent;
    if (talent && talent.type === 'startDefense') {
      state.commander.defense += talent.value;
      GS().pushLog(state, '🛡 主将天赋『' + talent.name + '』：开局获得 ' + talent.value + ' 点防御');
    }

    state.tianji = maxTianji(state);
    state.maxTianji = state.tianji;

    events.clear(); // 第 7 回合前无卦象规则
    state.hand = [];
    drawHand(state);
    events.emit('battleStart', { state: state });
    events.emit('turnStart', { state: state });

    var names = state.enemies.map(function (e) { return e.name; }).join('、');
    if (state.boss) names += '、' + state.boss.name;
    GS().pushLog(state, '敌方：' + names);
  }

  /** 玩家点击「回合完毕」 */
  function endPlayerTurn(state, events) {
    if (state.phase !== 'player' || state.over) return;

    // 1. 怪物行动（打主将）
    g.DSH_BattleSystem.bossActPhase(state, events);
    if (state.over) return;

    // 2. 持续伤害
    g.DSH_BattleSystem.applyDot(state, events);
    if (state.over) return;

    // 3. 补手牌（旧手牌全部回卡包）
    state.hand = [];

    // 4. 天机回满 / 重置本回合标记
    state.usedThisTurn = {};
    state.firstCardPlayedThisTurn = false;
    state.freeChase = {};
    state.frozen = {};
    state.stats.attackCountThisTurn = 0;
    state.stats.consecutiveAttacks = 0;
    state.stats.comboBonus = 0;
    state.stats.nextAttackCrit = false;
    state.turn += 1;

    // 5. 卦象节奏（每场战斗重新算）
    if (state.turn === 3) g.DSH_HexSystem.drawLower(state);
    if (state.turn === 5) g.DSH_HexSystem.drawUpper(state);
    if (state.turn >= 7 && !state.currentHexagram) {
      var hex = g.DSH_HexSystem.resolveHexagram(state);
      if (hex) {
        g.DSH_RuleSystem.registerRules(state, events);
        GS().pushLog(state, '☯ 天命技能『' + hex.name + '』觉醒！' + hex.effectText);
      }
    }

    state.tianji = maxTianji(state);
    state.maxTianji = state.tianji;

    // 6. 回合开始规则（第 7 回合起有效）+ 主将天赋每回合回血
    events.emit('turnStart', { state: state });
    var talent = GS().commanderDef(state).talent;
    if (talent && talent.type === 'endHeal') {
      var healed = Math.min(state.commander.maxHp - state.commander.hp, talent.value);
      state.commander.hp += healed;
      GS().pushLog(state, '♨ 主将天赋『' + talent.name + '』恢复 ' + healed + ' 点血量');
    }

    drawHand(state);
    state.phase = 'player';
    GS().pushLog(state, '—— 第 ' + state.turn + ' 回合，天机回满 ——');
  }

  g.DSH_TurnSystem = {
    drawFromPack: drawFromPack,
    drawHand: drawHand,
    maxTianji: maxTianji,
    buildEnemies: buildEnemies,
    startBattle: startBattle,
    endPlayerTurn: endPlayerTurn
  };
})(typeof window !== 'undefined' ? window : globalThis);
