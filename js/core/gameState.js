/**
 * gameState.js — 对局状态（战场/天机/牌库/魔王/卦象）
 *
 * 英雄血量保留在牌库；战死（血量归零）永久移出牌库。
 * 战场 = 5 格（上 3 下 2 两排，中宫 slot 1），每回合重抽。
 */
(function (g) {
  'use strict';

  var SLOT_COUNT = 5;
  var CENTER_SLOT = 1;

  /**
   * 新建一局。
   * @param {object} opts { random: function } 可注入随机源（测试用）
   */
  function createState(opts) {
    opts = opts || {};
    var rnd = opts.random || Math.random;

    var heroes = g.DSH_HEROES.HEROES.map(function (h) {
      return { id: h.id, role: h.role, element: h.element, nick: h.nick, name: h.name,
               yinYang: h.yinYang, atk: h.atk, hp: h.hp, maxHp: h.maxHp,
               skillName: h.skillName, skillMult: h.skillMult, skillChance: h.skillChance,
               skins: h.skins, skinId: g.DSH_HEROES.defaultSkinId(h) };
    });

    var enemies = g.DSH_ENEMIES.GENERALS.map(function (e) {
      return { id: e.id, name: e.name, element: e.element, hp: e.hp, maxHp: e.hp, atk: e.atk, aoe: e.aoe, alive: true };
    });
    var boss = { id: g.DSH_ENEMIES.BOSS.id, name: g.DSH_ENEMIES.BOSS.name,
                 element: g.DSH_ENEMIES.BOSS.element, hp: g.DSH_ENEMIES.BOSS.hp,
                 maxHp: g.DSH_ENEMIES.BOSS.hp, atk: g.DSH_ENEMIES.BOSS.atk, aoe: false, alive: true };

    return {
      heroes: heroes,            // 牌库（含当前血量，alive 由 hp>0 判定）
      board: new Array(SLOT_COUNT).fill(null), // slot -> heroId | null
      tianji: 4,
      maxTianji: 4,
      usedThisTurn: {},          // heroId -> true（本回合已行动）
      turn: 1,
      phase: 'opening',          // opening | player | boss | settle | over
      upperTrigram: null,        // 上卦 id（开局三选一，一局固定）
      lowerTrigram: null,        // 下卦 id（每回合随阵容重算）
      currentHexagram: null,     // 64 卦对象
      enemies: enemies,
      boss: boss,
      frozen: {},                // enemyId -> true（本回合被冻结，跳过行动）
      frozenNext: {},            // enemyId -> true（下次行动被冻结）
      burnStacks: {},            // enemyId -> 燃烧层数
      windBurnLayers: {},        // enemyId -> 风蚀层数
      shield: {},                // heroId -> 护盾值
      stats: {
        revived: false,          // revive 规则是否已用
        firstAttackDone: false,  // firstCrit 是否已用
        attackCountThisTurn: 0,  // 本回合攻击次数（comboCrit）
        consecutiveAttacks: 0,   // 连续攻击计数（empowNext / qiantian）
        comboBonus: 0,           // 连击增伤（empowNext）
        freezeCount: 0,          // 已冻结次数（jiji）
        lastAttackCrit: false,
        lastAttackFroze: false
      },
      openingDamageDone: false,
      lastHits: [], // 最近一次受击记录 [{kind:'hero'|'enemy', id, amount}]，渲染层标红抖动用
      log: [],
      rnd: rnd,
      over: null                 // 'win' | 'lose'
    };
  }

  /** 英雄是否存活（牌库视角） */
  function heroAlive(state, heroId) {
    var h = getHero(state, heroId);
    return !!h && h.hp > 0;
  }

  function getHero(state, heroId) {
    for (var i = 0; i < state.heroes.length; i++) if (state.heroes[i].id === heroId) return state.heroes[i];
    return null;
  }

  /** 牌库存活英雄 */
  function aliveHeroes(state) {
    return state.heroes.filter(function (h) { return h.hp > 0; });
  }

  /** 敌方存活单位（魔将 + 可攻击时的魔王本体） */
  function aliveEnemies(state) {
    var out = state.enemies.filter(function (e) { return e.alive && e.hp > 0; });
    if (allGeneralsDead(state)) out.push(state.boss);
    return out;
  }

  /** 所有魔将是否阵亡 */
  function allGeneralsDead(state) {
    return state.enemies.every(function (e) { return !e.alive || e.hp <= 0; });
  }

  /** 魔王本体是否可被攻击（魔将全灭解锁） */
  function bossUnlocked(state) { return allGeneralsDead(state); }

  /** 魔将是否存活 */
  function enemyAlive(state, enemyId) {
    if (enemyId === state.boss.id) return state.boss.alive && state.boss.hp > 0 && bossUnlocked(state);
    var e = getEnemy(state, enemyId);
    return !!e && e.alive && e.hp > 0;
  }

  function getEnemy(state, enemyId) {
    if (enemyId === state.boss.id) return state.boss;
    for (var i = 0; i < state.enemies.length; i++) if (state.enemies[i].id === enemyId) return state.enemies[i];
    return null;
  }

  /** 桌面存活英雄（slot -> hero） */
  function boardHeroes(state) {
    var out = [];
    for (var i = 0; i < state.board.length; i++) {
      var id = state.board[i];
      if (id && getHero(state, id).hp > 0) out.push({ slot: i, hero: getHero(state, id) });
    }
    return out;
  }

  function pushLog(state, text) {
    state.log.push({ turn: state.turn, phase: state.phase, text: text });
  }

  g.DSH_GameState = {
    SLOT_COUNT: SLOT_COUNT,
    CENTER_SLOT: CENTER_SLOT,
    createState: createState,
    getHero: getHero,
    getEnemy: getEnemy,
    heroAlive: heroAlive,
    aliveHeroes: aliveHeroes,
    aliveEnemies: aliveEnemies,
    allGeneralsDead: allGeneralsDead,
    bossUnlocked: bossUnlocked,
    enemyAlive: enemyAlive,
    boardHeroes: boardHeroes,
    pushLog: pushLog
  };
})(typeof window !== 'undefined' ? window : globalThis);
