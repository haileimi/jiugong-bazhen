/**
 * economySystem.js — 经济系统（v3.9 奖励页数值化）
 *
 * 资源模型：
 *   马蹄金（gold）—— 跨局持久货币：胜利获得，商店/招募所消费。
 *   军粮（rations）—— 每日 5 点（体力）：进入战斗消耗 1，胜利返还 1~2，可在商店补给。
 *   英雄卡 —— 胜利掉落/商店购买/招募所招募，直接加入当前局卡包（卡包可超 48 成长，uid 唯一）。
 *
 * 调用方：
 *   main.js         —— 进战斗前 canEnterBattle/enterBattle；胜利后 victoryRewards；
 *                      首页商店/招募所按钮 → showShop/showRecruit（渲染层）
 *   popupRenderer   —— 商店/招募所购买按钮 → buyPackCard/buyRation/recruitHero
 */
(function (g) {
  'use strict';

  /* ---------------- 平衡参数（可调） ---------------- */
  var RATIONS_MAX = 5;            // 军粮每日上限
  var BATTLE_RATION_COST = 1;     // 每次进入战斗消耗军粮
  var MONSTER_GOLD = 15;          // 小怪战胜利马蹄金
  var BOSS_GOLD = 40;             // 魔王战胜利马蹄金
  var MONSTER_RATIONS = 1;        // 小怪战胜利军粮返还
  var BOSS_RATIONS = 2;           // 魔王战胜利军粮返还
  var MONSTER_CARD_CHANCE = 0.35; // 小怪战掉落英雄卡概率
  var PACK_CARD_PRICE = 30;       // 商店：随机偏将招式卡
  var RATION_PRICE = 15;          // 商店：军粮 +1
  var RECRUIT_PRICE = 20;         // 招募所：指定偏将 1 张

  /** 是否已有进行中的一局（商店/招募的卡牌加入当前局卡包） */
  function hasRun(state) {
    return !!state.commander;
  }

  /** 能否进入战斗（军粮足够） */
  function canEnterBattle(state) {
    return hasRun(state) && state.rations >= BATTLE_RATION_COST;
  }

  /** 进入战斗：消耗军粮（main.js 在 startBattle 前调用） */
  function enterBattle(state) {
    if (state.rations < BATTLE_RATION_COST) return false;
    state.rations -= BATTLE_RATION_COST;
    g.DSH_SaveSystem.setRations(state.rations); // 军粮即日生效，实时同步
    g.DSH_GameState.pushLog(state, '🍚 消耗 ' + BATTLE_RATION_COST + ' 军粮（剩 ' + state.rations + '/' + RATIONS_MAX + '）');
    return true;
  }

  /** 随机一名偏将（主将之外的英雄） */
  function randomPackHero(state) {
    var pool = g.DSH_HEROES.packHeroIds(state.commander.heroId);
    return pool[Math.floor(state.rnd() * pool.length)];
  }

  /** 向卡包添加 1 张招式卡（uid 唯一；卡包可超 48 成长） */
  function addCardToPack(state, heroId) {
    var uid = heroId + '#x' + state.pack.length;
    while (state.pack.some(function (c) { return c.uid === uid; })) {
      uid = heroId + '#x' + state.pack.length + Math.floor(state.rnd() * 100000);
    }
    state.pack.push({ uid: uid, heroId: heroId });
    return uid;
  }

  /**
   * 战斗胜利结算：加金币 / 军粮（封顶每日上限）/ 掉落英雄卡（魔王战保底）。
   * 调用即生效；state.rewardApplied 防重复结算（handleBattleEnd 幂等）。
   * @returns {{gold:number, rationGained:number, cards:string[]}}
   */
  function victoryRewards(state) {
    var isBoss = state.battleKind === 'boss';
    var gold = isBoss ? BOSS_GOLD : MONSTER_GOLD;
    var rationBase = isBoss ? BOSS_RATIONS : MONSTER_RATIONS;
    var rationGained = Math.max(0, Math.min(RATIONS_MAX - state.rations, rationBase));
    var cards = [];
    var drop = isBoss || state.rnd() < MONSTER_CARD_CHANCE;
    if (drop) {
      var heroId = randomPackHero(state);
      addCardToPack(state, heroId);
      cards.push(heroId);
    }
    state.gold += gold;
    state.rations += rationGained;
    g.DSH_SaveSystem.setRations(state.rations); // 胜利返还军粮即日生效
    state.rewardApplied = true;
    return { gold: gold, rationGained: rationGained, cards: cards };
  }

  /** 商店：买随机偏将招式卡 */
  function buyPackCard(state) {
    if (!hasRun(state)) return { ok: false, msg: '还没有进行中的战斗，请先「开始战斗」' };
    if (state.gold < PACK_CARD_PRICE) return { ok: false, msg: '马蹄金不足（需要 ' + PACK_CARD_PRICE + '）' };
    state.gold -= PACK_CARD_PRICE;
    var heroId = randomPackHero(state);
    addCardToPack(state, heroId);
    var h = g.DSH_HEROES.byId(heroId);
    return { ok: true, msg: '获得『' + h.nick + ' · ' + h.name + '』招式卡 ×1', card: heroId };
  }

  /** 商店：军粮 +1（封顶每日上限） */
  function buyRation(state) {
    if (!hasRun(state)) return { ok: false, msg: '还没有进行中的战斗，请先「开始战斗」' };
    if (state.rations >= RATIONS_MAX) return { ok: false, msg: '军粮已满（每日 ' + RATIONS_MAX + ' 点），明日再补给' };
    if (state.gold < RATION_PRICE) return { ok: false, msg: '马蹄金不足（需要 ' + RATION_PRICE + '）' };
    state.gold -= RATION_PRICE;
    state.rations += 1;
    g.DSH_SaveSystem.setRations(state.rations); // 补给即日生效
    return { ok: true, msg: '军粮 +1（现 ' + state.rations + '/' + RATIONS_MAX + '）' };
  }

  /** 招募所：指定偏将招式卡 +1（主将不可招募） */
  function recruitHero(state, heroId) {
    if (!hasRun(state)) return { ok: false, msg: '还没有进行中的战斗，请先「开始战斗」' };
    if (heroId === state.commander.heroId) return { ok: false, msg: '主将是「你」，不可招募自己的招式' };
    if (state.gold < RECRUIT_PRICE) return { ok: false, msg: '马蹄金不足（需要 ' + RECRUIT_PRICE + '）' };
    state.gold -= RECRUIT_PRICE;
    addCardToPack(state, heroId);
    var h = g.DSH_HEROES.byId(heroId);
    return { ok: true, msg: '招募成功：『' + h.nick + ' · ' + h.name + '』招式卡 ×1', card: heroId };
  }

  g.DSH_Economy = {
    RATIONS_MAX: RATIONS_MAX,
    BATTLE_RATION_COST: BATTLE_RATION_COST,
    MONSTER_GOLD: MONSTER_GOLD,
    BOSS_GOLD: BOSS_GOLD,
    MONSTER_RATIONS: MONSTER_RATIONS,
    BOSS_RATIONS: BOSS_RATIONS,
    MONSTER_CARD_CHANCE: MONSTER_CARD_CHANCE,
    PACK_CARD_PRICE: PACK_CARD_PRICE,
    RATION_PRICE: RATION_PRICE,
    RECRUIT_PRICE: RECRUIT_PRICE,
    hasRun: hasRun,
    canEnterBattle: canEnterBattle,
    enterBattle: enterBattle,
    randomPackHero: randomPackHero,
    addCardToPack: addCardToPack,
    victoryRewards: victoryRewards,
    buyPackCard: buyPackCard,
    buyRation: buyRation,
    recruitHero: recruitHero
  };
})(typeof window !== 'undefined' ? window : globalThis);
