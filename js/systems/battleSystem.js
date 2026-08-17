/**
 * battleSystem.js — 战斗（v3：打出招式卡 / 怪物打主将 / 伤害结算 / 胜负判定）
 *
 * 打出卡牌（均耗 1 天机，用完回卡包）：
 *   战斗·单体：点卡 → 点怪物 → 造成伤害（五行克制 × 特技 × 主将天赋）
 *   战斗·全体：点卡直接打出，对全体敌人造成伤害
 *   护卫·自身：点卡直接打出，获得防御 / 恢复血量
 *   护卫·单体：点卡 → 点怪物 → 敌方攻击 -30%（可叠加至 60%）+ 恢复血量
 *   计谋·自身：点卡直接打出（天机上限 +1 并抽牌 / 手牌抽满至 10）
 *   计谋·单体：点卡 → 点怪物 → 敌方攻击 -20% + 风蚀
 *
 * 伤害公式：伤害 = max(2, round(攻击 × 克制系数 × 特技倍率 × 暴击倍率)) + 连击增伤
 * 暴击：10% 基础概率，×1.5
 */
(function (g) {
  'use strict';

  var GS = function () { return g.DSH_GameState; };
  var BASE_CRIT = 0.10;
  var CRIT_MULT = 1.5;
  var ATK_DEBUFF_CAP = 60;

  /** 纯伤害公式（供自检与战斗共用） */
  function calcDamage(atk, mult, crit, critMult, bonus) {
    var cm = crit ? (critMult || CRIT_MULT) : 1;
    return Math.max(2, Math.round(atk * mult * cm)) + (bonus || 0);
  }

  /* ---------------- 打出卡牌 ---------------- */

  /**
   * 打出卡牌。
   * @param {number} enemyId 单体指向时的目标；全体/自身可空
   * @returns {object|null} {kind, damage, killed, ...} 或 null（未执行）
   */
  function playCard(state, events, uid, enemyId) {
    if (state.phase !== 'player') { GS().pushLog(state, '当前不是玩家回合'); return null; }
    if (state.over) return null;
    var card = GS().getCard(state, uid);
    if (!card || !GS().cardInHand(state, uid)) { GS().pushLog(state, '该牌不在手牌中'); return null; }
    if (state.tianji <= 0 && !state.freeChase[uid]) { GS().pushLog(state, '天机不足，无法出牌'); return null; }

    var hero = GS().cardDef(state, uid);
    if (!hero) return null;

    // 单体指向必须给目标；全体/自身不需要
    if (hero.target === 'single' && !enemyId) { GS().pushLog(state, '请选择目标怪物'); return null; }
    if (hero.target === 'single') {
      var t = GS().getEnemy(state, enemyId);
      if (!t || !t.alive || t.hp <= 0) { GS().pushLog(state, '目标已阵亡'); return null; }
      if (state.boss && enemyId === state.boss.id && !GS().bossUnlocked(state)) {
        GS().pushLog(state, '魔王本体仍在守护中，无法攻击'); return null;
      }
    }

    // 打出即从手牌移除（用完回卡包）；追击时重新放回
    state.hand = state.hand.filter(function (u) { return u !== uid; });

    var result;
    if (hero.category === '战斗') result = attackWith(state, events, card, hero, enemyId);
    else if (hero.category === '护卫') result = guardWith(state, events, card, hero, enemyId);
    else result = schemeWith(state, events, card, hero, enemyId);
    if (!result) {
      state.hand.push(uid); // 未执行：放回手牌
      return null;
    }

    // 追击（赵星）：卡留手牌、本击不耗天机、可再打
    if (result.chased) {
      state.hand.push(uid);
      state.usedThisTurn[uid] = false;
      GS().pushLog(state, '⚡ 追击！' + hero.nick + ' 不耗天机再打一次');
      return result;
    }

    state.usedThisTurn[uid] = true;
    if (!state.freeChase[uid]) state.tianji -= 1;
    delete state.freeChase[uid];

    GS().pushLog(state, '打出『' + hero.nick + '·' + hero.name + '』（' + hero.category + '）' +
      (result.damage ? '，造成 ' + result.damage + ' 伤害' : ''));
    checkWin(state, events);
    return result;
  }

  /* ---------------- 战斗牌 ---------------- */

  function attackWith(state, events, card, hero, enemyId) {
    var payload = {
      state: state, attacker: { kind: 'card', uid: card.uid, heroId: hero.id, element: hero.element },
      target: enemyId ? GS().getEnemy(state, enemyId) : null,
      mult: 1, crit: false, bonus: 0
    };
    events.emit('beforeAttack', payload);

    // 主将天赋加成 + 层 buff
    var talent = GS().commanderDef(state).talent;
    if (talent && talent.type === 'battlePct') payload.mult *= (100 + talent.value) / 100;
    if (hero.target === 'all' && talent && talent.type === 'aoePct') payload.mult *= (100 + talent.value) / 100;
    if ((state.runBuffs.battlePct || 0) !== 0) payload.mult *= (100 + state.runBuffs.battlePct) / 100;
    // 法宝：赤霄剑 —— 战斗牌伤害 +15%
    if (state.commander.fabao === 'chixiaojian') payload.mult *= 1.15;
    if (!state.firstCardPlayedThisTurn) {
      if (talent && talent.type === 'firstCardBonus') payload.bonus += talent.value;
      state.firstCardPlayedThisTurn = true;
    }

    var dmg = 0;
    var skill = null;
    var killed = false;
    var last = null;

    function hitOne(enemy) {
      var crit = payload.crit;
      if (!crit && state.rnd() < (BASE_CRIT + (state.runBuffs.critPct || 0) / 100 +
        (talent && talent.type === 'critRate' ? talent.value / 100 : 0))) crit = true;
      var critMult = CRIT_MULT + (talent && talent.type === 'critDmg' ? talent.value / 100 : 0);
      var mult = payload.mult * g.DSH_ELEMENTS.counterMult(hero.element, enemy.element);
      var bonus = payload.bonus;

      // 特技
      if (hero.skill && state.rnd() < (hero.skill.chance || 0)) {
        skill = hero.skill;
        if (skill.mult) mult *= skill.mult;
        if (skill.critDmg) { crit = true; critMult = skill.critDmg + (talent && talent.type === 'critDmg' ? talent.value / 100 : 0); }
      }

      var damage = calcDamage(hero.damage, mult, crit, critMult, bonus);

      // 受击事件（敌方侧规则）
      var td = { state: state, victim: enemy, attacker: payload.attacker, amount: damage };
      events.emit('takeDamage', td);
      damage = Math.max(1, Math.round(td.amount));

      enemy.hp -= damage;
      var k = enemy.hp <= 0;
      if (k) { enemy.hp = 0; enemy.alive = false; }
      state.lastHits.push({ kind: 'enemy', id: enemy.id, amount: damage });

      // 特技附加
      if (skill && skill.burn) state.burnStacks[enemy.id] = (state.burnStacks[enemy.id] || 0) + skill.burn;
      if (skill && skill.windAll) state.windBurnLayers[enemy.id] = (state.windBurnLayers[enemy.id] || 0) + skill.windAll;
      if (skill && skill.freeze && enemy.alive) state.frozenNext[enemy.id] = true;

      var ap = { state: state, attacker: payload.attacker, target: enemy, damage: damage, killed: k };
      events.emit('afterAttack', ap);
      if (k) {
        var dp = { state: state, victim: enemy, cause: 'card-attack', prevent: false };
        events.emit('death', dp);
      }
      dmg += damage;
      killed = killed || k;
      last = { id: enemy.id, damage: damage, killed: k };
      GS().pushLog(state, hero.nick + ' 攻击 ' + enemy.name + (crit ? '【暴击】' : '') +
        (skill ? '【' + skill.name + '】' : '') + ' 造成 ' + damage + ' 伤害' + (k ? '，被击败！' : ''));
    }

    if (hero.target === 'all') {
      GS().aliveEnemies(state).forEach(hitOne);
    } else {
      hitOne(payload.target);
    }

    state.stats.attackCountThisTurn += 1;
    state.stats.consecutiveAttacks += 1;

    // 追击：单体会话中特技已掷骰，直接沿用该次结果
    var chased = !!(skill && skill.chase);

    return { kind: 'attack', damage: dmg, killed: killed, skill: skill, chased: chased, last: last };
  }

  /* ---------------- 护卫牌 ---------------- */

  function guardWith(state, events, card, hero, enemyId) {
    var talent = GS().commanderDef(state).talent;
    if (hero.target === 'single') {
      // 闷嘴石：敌方攻击 -30%（可叠加至 60%）+ 恢复 3 血量
      var e = GS().getEnemy(state, enemyId);
      var cur = state.atkDebuff[e.id] || 0;
      state.atkDebuff[e.id] = Math.min(ATK_DEBUFF_CAP, cur + hero.atkDown);
      GS().pushLog(state, '🛡 ' + hero.nick + ' 削弱 ' + e.name + ' 攻击 -' + hero.atkDown + '%（当前 -' + state.atkDebuff[e.id] + '%）');
      var h = healCommander(state, hero.heal);
      GS().pushLog(state, '♨ 恢复 ' + h + ' 点血量');
      return { kind: 'guard', heal: h };
    }
    // 自身：获得防御 + 恢复血量
    if (hero.defGain > 0) {
      state.commander.defense += hero.defGain;
      GS().pushLog(state, '🛡 获得 ' + hero.defGain + ' 点防御（当前 ' + state.commander.defense + '）');
    }
    var healed = hero.heal > 0 ? healCommander(state, hero.heal) : 0;
    return { kind: 'guard', defense: hero.defGain, heal: healed };
  }

  /* ---------------- 计谋牌 ---------------- */

  function schemeWith(state, events, card, hero, enemyId) {
    if (hero.fillHand) {
      // 白泽：手牌抽满至 9 张
      var want = GS().HAND_MAX - state.hand.length;
      if (want > 0) {
        var cards = g.DSH_TurnSystem.drawFromPack(state, want);
        state.hand = state.hand.concat(cards);
        GS().pushLog(state, '🃏 白泽显灵：手牌抽满至 ' + state.hand.length + ' 张');
      } else {
        GS().pushLog(state, '🃏 白泽显灵：手牌已满');
      }
      return { kind: 'scheme', draw: want };
    }
    if (hero.draw > 0) {
      var cards2 = g.DSH_TurnSystem.drawFromPack(state, hero.draw);
      state.hand = state.hand.concat(cards2);
      GS().pushLog(state, '🃏 抽 ' + cards2.length + ' 张');
    }
    if (hero.tianjiUp && !state.tianjiUpApplied) {
      state.tianjiUpApplied = true;
      state.maxTianji = g.DSH_TurnSystem.maxTianji(state);
      state.tianji += 1;
      GS().pushLog(state, '✦ 本场战斗天机上限 +1（' + state.maxTianji + '），并回复 1 点天机');
    }
    if (hero.atkDown > 0 && enemyId) {
      var e = GS().getEnemy(state, enemyId);
      var cur = state.atkDebuff[e.id] || 0;
      state.atkDebuff[e.id] = Math.min(ATK_DEBUFF_CAP, cur + hero.atkDown);
      state.windBurnLayers[e.id] = (state.windBurnLayers[e.id] || 0) + (hero.wind || 0);
      GS().pushLog(state, '🌀 ' + hero.nick + ' 削弱 ' + e.name + ' 攻击 -' + hero.atkDown + '%，附加 ' + (hero.wind || 0) + ' 层风蚀');
    }
    return { kind: 'scheme' };
  }

  /* ---------------- 主将受击 ---------------- */

  function healCommander(state, amount) {
    if (!state.commander || amount <= 0) return 0;
    var real = Math.min(state.commander.maxHp - state.commander.hp, Math.round(amount));
    state.commander.hp += real;
    if (real > 0) state.lastHits.push({ kind: 'commander-heal', amount: real });
    return real;
  }

  /**
   * 主将受击：规则减伤 → 主将天赋减伤 → 防御吸收 → 扣血（免死天赋/复活规则）
   */
  function damageCommander(state, events, amount, attacker) {
    if (!GS().commanderAlive(state)) return false;
    var td = { state: state, victim: state.commander, attacker: attacker, amount: amount };
    events.emit('takeDamage', td);
    var dmg = Math.max(0, Math.round(td.amount));

    var talent = GS().commanderDef(state).talent;
    if (talent && talent.type === 'dmgReduce') dmg = Math.round(dmg * (100 - talent.value) / 100);
    dmg = Math.round(dmg * (100 - (state.runBuffs.defPct || 0)) / 100);
    // 法宝：玄铁护心镜 —— 主将受击伤害 -15%
    if (state.commander.fabao === 'huxinjing') dmg = Math.round(dmg * 85 / 100);

    var absorbed = 0;
    if (state.commander.defense > 0) {
      absorbed = Math.min(state.commander.defense, dmg);
      state.commander.defense -= absorbed;
      dmg -= absorbed;
    }
    state.commander.hp -= dmg;
    if (absorbed + dmg > 0) state.lastHits.push({ kind: 'commander', amount: absorbed + dmg });

    if (state.commander.hp <= 0) {
      // 希寒川主将天赋：每场战斗免死一次
      if (talent && talent.type === 'onceSave' && !state.stats.onceSaveUsed) {
        state.stats.onceSaveUsed = true;
        state.commander.hp = 1;
        GS().pushLog(state, '☯ 主将天赋『' + talent.name + '』：死里逃生，保留 1 点血量！');
        return false;
      }
      var dp = { state: state, victim: state.commander, cause: 'enemy-attack', prevent: false };
      events.emit('death', dp);
      if (dp.prevent) return false; // 复活
      state.commander.hp = 0;
      GS().pushLog(state, '💀 主将 ' + state.commander.heroId + ' 战死！');
      state.over = 'lose';
      state.phase = 'over';
      return true;
    }
    return false;
  }

  /* ---------------- 敌方回合 ---------------- */

  /** 怪物行动：存活单位轮流攻击主将（上限 4 次） */
  function bossActPhase(state, events) {
    state.phase = 'boss';
    var cursor = 0;
    var acted = 0;
    var alive = GS().aliveEnemies(state);
    var maxActions = Math.min(4, alive.length);
    if (maxActions <= 0) { state.phase = 'player'; return 0; }

    for (var i = 0; i < maxActions; i++) {
      var attacker = null;
      for (var n = 0; n < state.enemies.length; n++) {
        var e = state.enemies[cursor % state.enemies.length];
        cursor++;
        if (e.alive && e.hp > 0) { attacker = e; break; }
      }
      if (!attacker && state.boss && state.boss.alive && state.boss.hp > 0) attacker = state.boss;
      if (!attacker) break;

      if (state.frozenNext[attacker.id]) { delete state.frozenNext[attacker.id]; acted++; continue; }
      if (state.frozen[attacker.id]) { delete state.frozen[attacker.id]; acted++; continue; }

      var base = GS().enemyAtk(state, attacker);
      base = Math.round(base * (100 + (state.runBuffs.enemyAtkPct || 0)) / 100);
      var bp = { state: state, attacker: attacker, targets: [state.commander], amount: base };
      events.emit('bossAct', bp);
      var amount = Math.max(0, Math.floor(bp.amount));

      GS().pushLog(state, attacker.name + ' 攻击主将，造成 ' + amount + ' 伤害' +
        (attacker.aoe ? '【全体】' : ''));
      damageCommander(state, events, amount, attacker);
      acted++;
      if (state.over) break;
    }

    if (!state.over) state.phase = 'player';
    return acted;
  }

  /* ---------------- 持续伤害 / 胜负 ---------------- */

  function applyDot(state, events) {
    GS().aliveEnemies(state).forEach(function (e) {
      var burn = state.burnStacks[e.id] || 0;
      var wind = state.windBurnLayers[e.id] || 0;
      var dot = burn * 1 + wind * 2;
      if (dot > 0) {
        GS().pushLog(state, e.name + ' 受到持续伤害 ' + dot + '（燃烧' + burn + '层/风蚀' + wind + '层）');
        damageEnemy(state, e.id, dot, '持续伤害');
      }
    });
  }

  /** 对单个敌方造成伤害（通用入口） */
  function damageEnemy(state, enemyId, amount, source) {
    var e = GS().getEnemy(state, enemyId);
    if (!e || !e.alive || e.hp <= 0) return false;
    e.hp -= amount;
    if (e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
      GS().pushLog(state, (source ? source + '：' : '') + e.name + ' 被击败！');
      checkWin(state);
      return true;
    }
    return false;
  }

  /** 对全体敌方造成伤害 */
  function damageAllEnemies(state, amount, source) {
    GS().aliveEnemies(state).forEach(function (e) { damageEnemy(state, e.id, amount, source); });
  }

  /** 胜负判定 */
  function checkWin(state) {
    if (state.over) return;
    var allDead = GS().allGeneralsDead(state);
    var bossDead = !state.boss || state.boss.hp <= 0;
    if (allDead && bossDead) {
      state.over = 'win';
      state.phase = 'over';
      GS().pushLog(state, '🎉 战斗胜利！');
      return;
    }
    if (!GS().commanderAlive(state)) {
      state.over = 'lose';
      state.phase = 'over';
      GS().pushLog(state, '💀 主将战死，败局已定……');
    }
  }

  g.DSH_BattleSystem = {
    BASE_CRIT: BASE_CRIT,
    CRIT_MULT: CRIT_MULT,
    ATK_DEBUFF_CAP: ATK_DEBUFF_CAP,
    calcDamage: calcDamage,
    playCard: playCard,
    healCommander: healCommander,
    damageCommander: damageCommander,
    bossActPhase: bossActPhase,
    applyDot: applyDot,
    damageEnemy: damageEnemy,
    damageAllEnemies: damageAllEnemies,
    checkWin: checkWin
  };
})(typeof window !== 'undefined' ? window : globalThis);
