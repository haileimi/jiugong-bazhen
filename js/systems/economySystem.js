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
  var FABAO_PRICE = 60;           // 商店：法宝（装备主将，替换旧法宝）

  /* ---------------- 法宝（商店购买，装备主将，战斗生效） ---------------- */
  var FABAOS = [
    { id: 'huxinjing',  name: '玄铁护心镜', icon: '🛡️', desc: '主将受击伤害 -15%',  price: FABAO_PRICE },
    { id: 'chixiaojian', name: '赤霄剑',    icon: '⚔️', desc: '战斗牌伤害 +15%',    price: FABAO_PRICE },
    { id: 'hetuluoshu', name: '河图洛书',  icon: '📖', desc: '每回合多抽 1 张牌',  price: FABAO_PRICE }
  ];

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
    // 层 buff：营帐/奇遇 —— 战斗胜利金币加成
    if ((state.runBuffs.goldPct || 0) !== 0) gold = Math.round(gold * (100 + state.runBuffs.goldPct) / 100);
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

  /** 当前装备的法宝（无则 null） */
  function fabaoOf(state) {
    if (!state.commander || !state.commander.fabao) return null;
    for (var i = 0; i < FABAOS.length; i++) if (FABAOS[i].id === state.commander.fabao) return FABAOS[i];
    return null;
  }

  /** 商店：购买法宝（装备主将，替换旧法宝） */
  function buyFabao(state, fabaoId) {
    if (!hasRun(state)) return { ok: false, msg: '还没有进行中的战斗，请先「开始战斗」' };
    var f = null;
    for (var i = 0; i < FABAOS.length; i++) if (FABAOS[i].id === fabaoId) { f = FABAOS[i]; break; }
    if (!f) return { ok: false, msg: '未知法宝' };
    if (state.gold < f.price) return { ok: false, msg: '马蹄金不足（需要 ' + f.price + '）' };
    state.gold -= f.price;
    state.commander.fabao = f.id;
    return { ok: true, msg: '装备『' + f.name + '』：' + f.desc, fabao: f };
  }

  /* ---------------- 善恶值与周期结算（v3.10 世界观） ---------------- */

  /** 善恶名号：+10 义士 / -10 恶徒 / 0 中立 */
  function alignmentTitle(a) {
    a = a || 0;
    if (a > 0) return '义士 · 正义';
    if (a < 0) return '恶徒 · 邪恶';
    return '中立佣兵';
  }

  /**
   * 周期结算（每层 boss 战后、runBuffs 重置后调用）：按善恶值给不同奖励/惩罚。
   * 金币 + 下一层层 buff（在传入的 runBuffs 上叠加）。
   * 调用前需先由 main.js 根据 boss 选择设置 state.alignment（±10）。
   * @returns {{title:string, text:string}}
   */
  function settleAlignment(state) {
    var a = state.alignment || 0;
    if (a < 0) {
      state.gold += 60; // 掠夺民财，佣金更狠
      state.runBuffs.enemyAtkPct = (state.runBuffs.enemyAtkPct || 0) + 5; // 通缉：敌方攻击 +5%
      return {
        title: '☠ 恶名昭彰',
        text: '你杀了山河盟主，天下悬赏通缉你。掠夺所得 +60 金，但官军会愈发凶狠（下一层敌方攻击 +5%）。'
      };
    }
    if (a > 0) {
      state.gold += 40; // 民心支持
      state.runBuffs.battlePct = (state.runBuffs.battlePct || 0) + 5; // 民心：战斗牌伤害 +5%
      return {
        title: '🕊 义名远扬',
        text: '你除掉了曜魔宗主，百姓称颂。民心赠礼 +40 金，士气高涨（下一层战斗牌伤害 +5%）。'
      };
    }
    state.gold += 30;
    return {
      title: '⚔ 佣兵本色',
      text: '你不偏向任何一方，只认钱办事。佣金 +30 金。'
    };
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
    FABAO_PRICE: FABAO_PRICE,
    FABAOS: FABAOS,
    hasRun: hasRun,
    canEnterBattle: canEnterBattle,
    enterBattle: enterBattle,
    randomPackHero: randomPackHero,
    addCardToPack: addCardToPack,
    victoryRewards: victoryRewards,
    buyPackCard: buyPackCard,
    buyRation: buyRation,
    recruitHero: recruitHero,
    fabaoOf: fabaoOf,
    buyFabao: buyFabao,
    alignmentTitle: alignmentTitle,
    settleAlignment: settleAlignment
  };
})(typeof window !== 'undefined' ? window : globalThis);
