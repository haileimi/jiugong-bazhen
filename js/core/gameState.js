/**
 * gameState.js — 对局状态（v3 主将制 + 卡包 + 爬塔）
 *
 * 层次：
 *   meta   —— 跨局持久：马蹄金 / 军粮（每日 5 点）/ 最高层数
 *   run    —— 本局进度：主将（血量+防御）/ 卡包（≤48 张偏将招式）/ 地图节点 / 层数
 *   battle —— 单场战斗：手牌（≤10）/ 天机 / 回合 / 敌方 / 卦象
 *
 * 主将：被打的就是他（防御先扣再扣血），主将死 = 输；恢复类一律恢复血量。
 * 防御：每场战斗开始归零。
 * 卡包：主将之外的 15 名英雄各 4 张 = 60 张；手牌上限 9（9宫格副将区限制）。
 */
(function (g) {
  'use strict';

  var HAND_MAX = 9;       // 手牌上限（9宫格副将区最多 9 格）
  var PACK_COPIES = 4;    // 每名偏将复制张数
  var BASE_DRAW = 5;      // 每回合起手
  var BASE_TIANJI = 3;    // 默认天机 3/3
  var DEFENSE_RESET = true; // 每场战斗防御归零
  var COMMANDER_HP_MULT = 4; // 主将血量倍率（原英雄血量×4，可调）

  /* ---- v4 布阵点（天机=布阵消耗） ---- */
  var DEPLOY_BASE = 3;      // 初始布阵点
  var DEPLOY_LAYER_GAIN = 1; // 每通关一层 +1
  var DEPLOY_LEVEL_CAP = 6;  // 顶级封顶 6 点
  var DEPLOY_CAP = 9;        // 加上法宝后最高 9 点

  /** 卡包构成：主将外的偏将英雄 × 4（uid 唯一）；v4 每张带战时等级 */
  function buildPack(commanderId) {
    var pack = [];
    g.DSH_HEROES.packHeroIds(commanderId).forEach(function (heroId) {
      for (var i = 0; i < PACK_COPIES; i++) {
        pack.push({ uid: heroId + '#' + i, heroId: heroId, warLevel: 0 });
      }
    });
    return pack;
  }

  /** 当前可用布阵点：3 + 每层+1（封顶 6），法宝加成后最高 9（v4） */
  function deployPoints(state) {
    var p = DEPLOY_BASE + Math.min(state.layer - 1, DEPLOY_LEVEL_CAP - DEPLOY_BASE);
    if (state.commander && state.commander.fabao && g.DSH_EconomySystem &&
        g.DSH_EconomySystem.FABAOS) {
      var f = g.DSH_EconomySystem.FABAOS[state.commander.fabao];
      if (f && f.deployBonus) p += f.deployBonus;
    }
    return Math.min(p, DEPLOY_CAP);
  }

  /** 战时等级后缀：0=无，1=+，2=++ */
  function warLevelSuffix(level) {
    var s = '';
    for (var i = 0; i < (level || 0); i++) s += '+';
    return s;
  }

  /** 地图节点：每层固定 4 个（小怪 → 营帐 → 随机事件 → 魔王） */
  function buildMapNodes() {
    return [
      { type: 'monster', label: '小怪战斗点', done: false },
      { type: 'camp',    label: '营帐',       done: false },
      { type: 'event',   label: '随机事件',   done: false },
      { type: 'boss',    label: '魔王战斗点', done: false }
    ];
  }

  /** 今日军粮（每日 5 点，按本地日期跨天重置） */
  function todayRations() {
    try {
      var raw = localStorage.getItem('jgbz_rations_v3');
      if (raw) {
        var d = JSON.parse(raw);
        var now = new Date();
        var m = String(now.getMonth() + 1);
        var day = String(now.getDate());
        if (m.length < 2) m = '0' + m;
        if (day.length < 2) day = '0' + day;
        var today = now.getFullYear() + '-' + m + '-' + day;
        if (d.date === today) return d.value;
      }
    } catch (e) { /* 忽略 */ }
    return 5;
  }

  /**
   * 新建一局。
   * @param {object} opts { random, meta } 可注入随机源（测试用）
   */
  function createState(opts) {
    opts = opts || {};
    var rnd = opts.random || Math.random;

    return {
      /* ---- meta ---- */
      gold: (opts.meta && opts.meta.gold !== undefined) ? opts.meta.gold : 0,
      rations: (opts.meta && opts.meta.rations !== undefined) ? opts.meta.rations : todayRations(),
      bestLayer: (opts.meta && opts.meta.bestLayer) || 0,
      alignment: (opts.meta && opts.meta.alignment !== undefined) ? opts.meta.alignment : 0, // 善恶 -10(恶)~+10(善)

      /* ---- run ---- */
      layer: 1,
      commander: null,          // { heroId, hp, maxHp, defense, fabao }
      pack: [],                 // [{ uid, heroId }]
      hand: [],                 // [uid]
      mapNodes: buildMapNodes(),
      runBuffs: { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0, drawBonus: 0, goldPct: 0, critPct: 0, startShield: 0 },
      route: null,              // 本层讨伐阵营：'good'(官军/山河盟) | 'evil'(曜魔宗军) | null(未选)
      saved: false,

      /* ---- battle ---- */
      battleKind: null,         // 'tutorial' | 'monster' | 'boss'
      bossChoice: null,         // boss 战选择：'good'(善boss=山河盟主) | 'evil'(恶boss=曜魔宗主)
      tianji: BASE_TIANJI,
      maxTianji: BASE_TIANJI,
      tianjiUpApplied: false,   // 观星眼能力：本场战斗天机上限 +1（每场最多一次）
      usedThisTurn: {},         // uid -> true
      firstCardPlayedThisTurn: false, // 傅寅天赋：每回合第一张战斗牌 +4
      freeChase: {},            // uid -> true（赵星追击：下次打出不耗天机）
      turn: 1,
      phase: 'home',            // home | pick | map | player | boss | reward | over
      upperTrigram: null,
      lowerTrigram: null,
      currentHexagram: null,
      enemies: [],
      boss: null,
      frozen: {},               // enemyId -> true（本回合被冻结）
      frozenNext: {},           // enemyId -> true（下次行动被冻结）
      burnStacks: {},           // enemyId -> 燃烧层数
      windBurnLayers: {},       // enemyId -> 风蚀层数
      atkDebuff: {},            // enemyId -> 攻击减益 %（闷嘴石 -30 / 冷算子 -20，封顶 60）
      stats: {
        revived: false,         // 复活规则是否已用
        firstAttackDone: false, // firstCrit 是否已用
        attackCountThisTurn: 0,
        consecutiveAttacks: 0,
        comboBonus: 0,
        nextAttackCrit: false,
        onceSaveUsed: false     // 希寒川主将天赋：免死是否已用
      },
      openingDamageDone: false, // 开局轰击规则是否已用
      lastHits: [],
      log: [],
      rnd: rnd,
      over: null,               // 'win' | 'lose'
      rewardApplied: false,     // 胜利结算是否已执行（防重复）
      lastReward: null          // 最近一次胜利结算摘要 { gold, rationGained, cards }
    };
  }

  /* ---------------- 卡牌/卡包 ---------------- */
  function getCard(state, uid) {
    for (var i = 0; i < state.pack.length; i++) if (state.pack[i].uid === uid) return state.pack[i];
    return null;
  }

  function cardDef(state, uid) {
    var c = getCard(state, uid);
    return c ? g.DSH_HEROES.byId(c.heroId) : null;
  }

  function cardInHand(state, uid) {
    return state.hand.indexOf(uid) >= 0;
  }

  /** 手牌中某英雄的卡数量（用于天赋判定等） */
  function countHeroInHand(state, heroId) {
    var n = 0;
    state.hand.forEach(function (uid) {
      var c = getCard(state, uid);
      if (c && c.heroId === heroId) n++;
    });
    return n;
  }

  /* ---------------- 主将 ---------------- */
  function commanderDef(state) {
    return state.commander ? g.DSH_HEROES.byId(state.commander.heroId) : null;
  }

  function commanderAlive(state) {
    return !!state.commander && state.commander.hp > 0;
  }

  /* ---------------- 敌方 ---------------- */
  function allGeneralsDead(state) {
    return state.enemies.every(function (e) { return !e.alive || e.hp <= 0; });
  }

  function bossUnlocked(state) {
    return state.battleKind === 'boss' && allGeneralsDead(state);
  }

  function aliveEnemies(state) {
    var out = state.enemies.filter(function (e) { return e.alive && e.hp > 0; });
    if (state.boss && bossUnlocked(state)) out.push(state.boss);
    return out;
  }

  function getEnemy(state, enemyId) {
    if (state.boss && enemyId === state.boss.id) return state.boss;
    for (var i = 0; i < state.enemies.length; i++) if (state.enemies[i].id === enemyId) return state.enemies[i];
    return null;
  }

  function enemyAlive(state, enemyId) {
    var e = getEnemy(state, enemyId);
    if (!e) return false;
    if (state.boss && enemyId === state.boss.id) return e.alive && e.hp > 0 && bossUnlocked(state);
    return e.alive && e.hp > 0;
  }

  /** 敌方单位实际攻击力（含减益：闷嘴石/冷算子） */
  function enemyAtk(state, enemy) {
    var debuff = state.atkDebuff[enemy.id] || 0;
    return Math.max(0, Math.floor(enemy.atk * (100 - debuff) / 100));
  }

  /* ---------------- 辅助 ---------------- */
  function pushLog(state, text) {
    state.log.push({ turn: state.turn, phase: state.phase, text: text });
  }

  function shuffle(state, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(state.rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  g.DSH_GameState = {
    HAND_MAX: HAND_MAX,
    PACK_COPIES: PACK_COPIES,
    BASE_DRAW: BASE_DRAW,
    BASE_TIANJI: BASE_TIANJI,
    DEFENSE_RESET: DEFENSE_RESET,
    COMMANDER_HP_MULT: COMMANDER_HP_MULT,
    DEPLOY_BASE: DEPLOY_BASE,
    DEPLOY_LAYER_GAIN: DEPLOY_LAYER_GAIN,
    DEPLOY_LEVEL_CAP: DEPLOY_LEVEL_CAP,
    DEPLOY_CAP: DEPLOY_CAP,
    deployPoints: deployPoints,
    warLevelSuffix: warLevelSuffix,
    createState: createState,
    buildPack: buildPack,
    buildMapNodes: buildMapNodes,
    todayRations: todayRations,
    getCard: getCard,
    cardDef: cardDef,
    cardInHand: cardInHand,
    countHeroInHand: countHeroInHand,
    commanderDef: commanderDef,
    commanderAlive: commanderAlive,
    allGeneralsDead: allGeneralsDead,
    bossUnlocked: bossUnlocked,
    aliveEnemies: aliveEnemies,
    getEnemy: getEnemy,
    enemyAlive: enemyAlive,
    enemyAtk: enemyAtk,
    pushLog: pushLog,
    shuffle: shuffle
  };
})(typeof window !== 'undefined' ? window : globalThis);
