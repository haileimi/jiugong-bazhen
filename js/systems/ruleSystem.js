/**
 * ruleSystem.js — 卦象规则引擎（24 种规则，事件驱动，v3 适配主将/招式卡）
 *
 * 事件：battleStart / turnStart / beforeAttack / afterAttack /
 *       takeDamage / death / bossAct
 * 第 7 回合天命觉醒后：events.clear() 清空全部规则监听，再按当前 64 卦规则重新注册。
 *
 * beforeAttack payload: { state, attacker: 招式卡 {kind:'card',uid,heroId,element}, target: 敌方, mult, crit, bonus }
 * takeDamage payload:   { state, victim: 主将或敌方, attacker, amount } (amount 可被规则改写)
 * death payload:        { state, victim, cause, prevent }
 * bossAct payload:      { state, attacker: 敌方, targets, amount } (amount 可被规则改写)
 *
 * 敌方判定：victim.alive !== undefined；主将判定：victim.heroId !== undefined 且 victim.kind !== 'card'
 */
(function (g) {
  'use strict';

  var FORMAT_KEYS = { chase: 1, freezeSkill: 1, windBurn: 1, stunHit: 1, lifesteal: 1, critChance: 1, healAll: 1 };

  function isEnemy(x) { return !!x && x.alive !== undefined; }
  function isCommander(x) { return !!x && x.heroId !== undefined && x.kind !== 'card'; }

  /** 概率判定 */
  function chance(state, percent) { return state.rnd() * 100 < percent; }

  function registerRules(state, events) {
    events.clear();
    var rules = state.currentHexagram.rules;
    rules.forEach(function (rule) { applyRule(state, events, rule); });
  }

  function applyRule(state, events, rule) {
    var k = rule.key;
    var v = rule.value || 0;

    switch (k) {
      case 'atkPct': // 全队攻击 +X%
        events.on('beforeAttack', function (p) { p.mult *= (100 + v) / 100; });
        break;

      case 'defPct': // 主将受击伤害 -X%
        events.on('takeDamage', function (p) {
          if (isCommander(p.victim)) p.amount *= (100 - v) / 100;
        });
        break;

      case 'bossAtkDown': // 魔王攻击 -X%
        events.on('bossAct', function (p) {
          if (p.attacker) p.amount = Math.floor(p.amount * (100 - v) / 100);
        });
        break;

      case 'opening': // 开战对敌方造成 X 点伤害（仅一次）
        events.on('battleStart', function () {
          if (state.openingDamageDone) return;
          state.openingDamageDone = true;
          g.DSH_BattleSystem.damageAllEnemies(state, v, '开局轰击');
        });
        break;

      case 'shieldAll': // 主将防御 +X
        events.on('turnStart', function () {
          state.commander.defense += v;
          g.DSH_GameState.pushLog(state, '🛡 坚阵：主将防御 +' + v);
        });
        break;

      case 'healAll': // 主将回复 X% 血量
        events.on('turnStart', function () {
          var real = Math.min(state.commander.maxHp - state.commander.hp,
            Math.round(state.commander.maxHp * v / 100));
          state.commander.hp += real;
          if (real > 0) g.DSH_GameState.pushLog(state, '♨ 回春：主将恢复 ' + real + ' 点血量');
        });
        break;

      case 'burnRound': // 每回合灼烧敌方 X 点
        events.on('turnStart', function () {
          g.DSH_BattleSystem.damageAllEnemies(state, v, '灼烧');
        });
        break;

      case 'firstCrit': // 本局首次攻击必暴击
        events.on('beforeAttack', function (p) {
          if (!state.stats.firstAttackDone) { p.crit = true; state.stats.firstAttackDone = true; }
        });
        break;

      case 'comboCrit': // 每回合第二次攻击必暴击
        events.on('beforeAttack', function (p) {
          if (state.stats.attackCountThisTurn === 2) p.crit = true;
        });
        break;

      case 'lifesteal': // 攻击吸血 X%
        events.on('afterAttack', function (p) {
          var heal = Math.round(p.damage * v / 100);
          g.DSH_BattleSystem.healCommander(state, heal);
        });
        break;

      case 'dmgShield': // 主将受伤 X% 转防御
        events.on('takeDamage', function (p) {
          if (isCommander(p.victim)) {
            var s = Math.round(p.amount * v / 100);
            if (s > 0) state.commander.defense += s;
          }
        });
        break;

      case 'revive': // 主将死亡一次复活（50% 血量 + 3 防御）
        events.on('death', function (p) {
          if (!isCommander(p.victim) || state.stats.revived || p.prevent) return;
          state.stats.revived = true;
          p.victim.hp = Math.round(p.victim.maxHp * 0.5);
          state.commander.defense += 3;
          p.prevent = true;
          g.DSH_GameState.pushLog(state, '【涅槃】主将死而复生！(50% 血量 + 3 防御)');
        });
        break;

      case 'freezeSkill': // X% 概率冻结敌方行动
        events.on('beforeAttack', function (p) {
          if (chance(state, v) && isEnemy(p.target)) {
            state.frozenNext[p.target.id] = true;
            state.stats.nextAttackCrit = true;
            g.DSH_GameState.pushLog(state, '【凝滞】' + p.target.name + ' 被冻结！');
          }
        });
        break;

      case 'burnOnHit': // 攻击附加燃烧层数
        events.on('afterAttack', function (p) {
          if (!isEnemy(p.target)) return;
          state.burnStacks[p.target.id] = (state.burnStacks[p.target.id] || 0) + 1;
        });
        break;

      case 'windBurn': // 攻击 X% 概率附加风蚀
        events.on('afterAttack', function (p) {
          if (!isEnemy(p.target)) return;
          if (chance(state, v)) state.windBurnLayers[p.target.id] = (state.windBurnLayers[p.target.id] || 0) + 1;
        });
        break;

      case 'chase': // 攻击 X% 概率获得额外行动（不耗天机）
        events.on('afterAttack', function (p) {
          if (chance(state, v)) {
            state.usedThisTurn[p.attacker.uid] = false;
            g.DSH_GameState.pushLog(state, '【追击】' + p.attacker.heroId + ' 获得额外行动！');
          }
        });
        break;

      case 'thorns': // 主将受击反弹 X 点伤害
        events.on('takeDamage', function (p) {
          if (isCommander(p.victim) && isEnemy(p.attacker)) {
            g.DSH_BattleSystem.damageEnemy(state, p.attacker.id, v, '荆棘反伤');
          }
        });
        break;

      case 'dmgReduce': // 主将受伤 -X%
        events.on('takeDamage', function (p) {
          if (isCommander(p.victim)) p.amount *= (100 - v) / 100;
        });
        break;

      case 'critChance': // 暴击率 +X%
        events.on('beforeAttack', function (p) {
          if (chance(state, v)) p.crit = true;
        });
        break;

      case 'stunHit': // 攻击 X% 概率冻结敌方下次行动
        events.on('beforeAttack', function (p) {
          if (chance(state, v) && isEnemy(p.target)) {
            state.frozenNext[p.target.id] = true;
            state.stats.nextAttackCrit = true;
            g.DSH_GameState.pushLog(state, '【破势】' + p.target.name + ' 下次行动被冻结！');
          }
        });
        break;

      case 'healOnHit': // 攻击回复 X 点血量
        events.on('afterAttack', function (p) {
          g.DSH_BattleSystem.healCommander(state, v);
        });
        break;

      case 'empowNext': // 连击增伤
        events.on('beforeAttack', function (p) { p.bonus += state.stats.comboBonus; });
        events.on('afterAttack', function () { state.stats.comboBonus += 1; });
        break;

      case 'qiantian': // 连续三次攻击后获得额外行动
        events.on('afterAttack', function (p) {
          state.stats.consecutiveAttacks += 1;
          if (state.stats.consecutiveAttacks >= 3) {
            state.stats.consecutiveAttacks = 0;
            state.usedThisTurn[p.attacker.uid] = false;
            g.DSH_GameState.pushLog(state, '【乾天】三连后获得额外行动！');
          }
        });
        break;

      case 'jiji': // 冻结目标后，下次攻击必暴击
        events.on('beforeAttack', function (p) {
          if (state.stats.nextAttackCrit) { p.crit = true; state.stats.nextAttackCrit = false; }
        });
        break;

      case 'weiji': // 攻击增加，但主将受到伤害增加
        events.on('beforeAttack', function (p) { p.mult *= (100 + v) / 100; });
        events.on('takeDamage', function (p) {
          if (isCommander(p.victim)) p.amount *= (100 + v) / 100;
        });
        break;

      default:
        break;
    }
  }

  g.DSH_RuleSystem = {
    registerRules: registerRules,
    applyRule: applyRule,
    FORMAT_KEYS: FORMAT_KEYS
  };
})(typeof window !== 'undefined' ? window : globalThis);
