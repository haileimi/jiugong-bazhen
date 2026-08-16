/**
 * battleSystem.js — 战斗（天机耗卡攻击、魔王出牌、伤害结算、胜负判定）
 *
 * 伤害公式：伤害 = max(2, round(攻击 × 克制系数 × 暴击倍率 × 兵种特技倍率)) + 连击增伤
 * 暴击：10% 基础概率，×1.5
 * 护盾优先吸收伤害，溢出扣血量；血量归零即退场。
 */
(function (g) {
  'use strict';

  var BASE_CRIT = 0.10;
  var CRIT_MULT = 1.5;

  /**
   * 纯伤害公式：伤害 = max(2, round(攻击 × 倍率 × 暴击倍率)) + 连击增伤
   * （供自检与战斗共用）
   */
  function calcDamage(atk, mult, crit, bonus) {
    return Math.max(2, Math.round(atk * mult * (crit ? CRIT_MULT : 1))) + (bonus || 0);
  }

  /**
   * 英雄拖动攻击：slot 上的英雄攻击敌方单位。
   * @returns {object|null} {damage, crit, skill, killed, hexName} 或 null(未执行)
   */
  function attackHeroToEnemy(state, events, slot, enemyId) {
    var GS = g.DSH_GameState;
    if (state.phase !== 'player') { GS.pushLog(state, '当前不是玩家回合'); return null; }
    if (state.tianji <= 0) { GS.pushLog(state, '天机不足，本回合无法再出卡'); return null; }

    var hero = state.board[slot] ? GS.getHero(state, state.board[slot]) : null;
    if (!hero || hero.hp <= 0) { GS.pushLog(state, '该位置没有可用英雄'); return null; }
    if (state.usedThisTurn[hero.id]) { GS.pushLog(state, hero.name + ' 本回合已行动'); return null; }

    var target = GS.getEnemy(state, enemyId);
    if (!target || !target.alive || target.hp <= 0) { GS.pushLog(state, '目标已阵亡'); return null; }
    if (enemyId === state.boss.id && !GS.bossUnlocked(state)) { GS.pushLog(state, '魔王本体仍在守护中，无法攻击'); return null; }

    state.stats.attackCountThisTurn += 1;
    state.stats.consecutiveAttacks += 1;

    // 规则前置（可改 mult/crit/bonus）
    var payload = { state: state, attacker: hero, target: target, mult: 1, crit: false, bonus: 0 };
    events.emit('beforeAttack', payload);

    var crit = payload.crit;
    if (!crit && state.rnd() < BASE_CRIT) crit = true;
    var mult = payload.mult;

    // 五行克制
    mult *= g.DSH_ELEMENTS.counterMult(hero.element, target.element);

    // 兵种特技（25%）
    var skill = false;
    if (state.rnd() < hero.skillChance) { mult *= hero.skillMult; skill = true; }

    var dmg = calcDamage(hero.atk, mult, crit, payload.bonus);

    // 受击事件（敌方侧规则）
    var td = { state: state, victim: target, attacker: hero, amount: dmg };
    events.emit('takeDamage', td);
    dmg = Math.max(1, Math.round(td.amount));

    target.hp -= dmg;
    var killed = target.hp <= 0;
    if (killed) { target.hp = 0; target.alive = false; }

    // 受击记录（渲染层标红抖动）
    state.lastHits.push({ kind: 'enemy', id: target.id, amount: dmg });

    state.tianji -= 1;
    state.usedThisTurn[hero.id] = true;

    var ap = { state: state, attacker: hero, target: target, damage: dmg, killed: killed };
    events.emit('afterAttack', ap);

    GS.pushLog(state, hero.nick + '(' + hero.name + ') 攻击 ' + target.name +
      (crit ? '【暴击】' : '') + (skill ? '【' + hero.skillName + '】' : '') +
      ' 造成 ' + dmg + ' 伤害' + (killed ? '，' + target.name + ' 被击败！' : ''));

    if (killed) {
      var dp = { state: state, victim: target, cause: 'hero-attack', prevent: false };
      events.emit('death', dp);
      if (target.id === state.boss.id) { /* 本体死亡，由胜负判定处理 */ }
      checkWin(state, events);
    }

    return { damage: dmg, crit: crit, skill: skill, killed: killed,
             hexName: state.currentHexagram ? state.currentHexagram.name : '' };
  }

  /** 对单个敌方单位造成伤害（规则/灼烧等通用入口，可致死） */
  function damageEnemy(state, enemyId, amount, source) {
    var GS = g.DSH_GameState;
    var e = GS.getEnemy(state, enemyId);
    if (!e || !e.alive || e.hp <= 0) return false;
    e.hp -= amount;
    if (e.hp <= 0) {
      e.hp = 0;
      e.alive = false;
      GS.pushLog(state, (source ? source + '：' : '') + e.name + ' 被击败！');
      checkWin(state);
      return true;
    }
    return false;
  }

  /** 对所有存活敌方（含本体）造成伤害 */
  function damageAllEnemies(state, amount, source) {
    var GS = g.DSH_GameState;
    var targets = GS.aliveEnemies(state);
    targets.forEach(function (e) { damageEnemy(state, e.id, amount, source); });
  }

  /** 对英雄造成伤害：护盾优先吸收；触发 takeDamage 规则；死亡事件 */
  function damageHero(state, events, hero, amount, attacker) {
    var GS = g.DSH_GameState;
    if (hero.hp <= 0) return false;

    var td = { state: state, victim: hero, attacker: attacker, amount: amount };
    events.emit('takeDamage', td);
    var dmg = Math.max(0, Math.round(td.amount));

    // 护盾吸收
    var absorbed = 0;
    var shield = state.shield[hero.id] || 0;
    if (shield > 0) {
      absorbed = Math.min(shield, dmg);
      shield -= absorbed;
      state.shield[hero.id] = shield;
      dmg -= absorbed;
    }

    hero.hp -= dmg;
    // 受击记录（渲染层标红抖动）
    if (absorbed + dmg > 0) state.lastHits.push({ kind: 'hero', id: hero.id, amount: absorbed + dmg });
    if (hero.hp <= 0) {
      hero.hp = 0;
      var dp = { state: state, victim: hero, cause: 'enemy-attack', prevent: false };
      events.emit('death', dp);
      if (dp.prevent) return false; // 复活
      // 从桌面移除；血量保留（0），永久退出牌库
      for (var i = 0; i < state.board.length; i++) {
        if (state.board[i] === hero.id) state.board[i] = null;
      }
      GS.pushLog(state, hero.nick + '(' + hero.name + ') 战死退场！');
      return true;
    }
    return false;
  }

  /** 魔王回合：最多 4 次行动（4 天机），魔将按牌序循环（跳过阵亡），全灭后本体 */
  function bossActPhase(state, events) {
    var GS = g.DSH_GameState;
    state.phase = 'boss';
    var cursor = 0;
    var acted = 0;
    var maxActions = 4;

    for (var i = 0; i < maxActions; i++) {
      // 找下一个存活魔将（循环），全灭则本体
      var attacker = null;
      for (var n = 0; n < state.enemies.length; n++) {
        var e = state.enemies[cursor % state.enemies.length];
        cursor++;
        if (e.alive && e.hp > 0) { attacker = e; break; }
      }
      if (!attacker) attacker = state.boss;

      // 冻结判定（冻结跳过本次行动）
      if (state.frozenNext[attacker.id]) {
        delete state.frozenNext[attacker.id];
        GS.pushLog(state, attacker.name + ' 被冻结，跳过行动！');
        acted++;
        continue;
      }
      if (state.frozen[attacker.id]) {
        delete state.frozen[attacker.id];
        acted++;
        continue;
      }

      // 目标：全体攻击 = 所有桌面英雄；单体 = 随机一名
      var boardHeroes = GS.boardHeroes(state);
      if (boardHeroes.length === 0) break;

      var base = attacker.atk;
      var bp = { state: state, attacker: attacker, targets: boardHeroes.map(function (b) { return b.hero; }), amount: base };
      events.emit('bossAct', bp);
      var amount = Math.max(0, Math.floor(bp.amount));

      if (attacker.aoe) {
        boardHeroes.forEach(function (b) {
          GS.pushLog(state, attacker.name + '【全体攻击】对 ' + b.hero.name + ' 造成 ' + amount + ' 伤害');
          damageHero(state, events, b.hero, amount, attacker);
        });
      } else {
        var victim = boardHeroes[Math.floor(state.rnd() * boardHeroes.length)].hero;
        GS.pushLog(state, attacker.name + ' 攻击 ' + victim.name + '，造成 ' + amount + ' 伤害');
        damageHero(state, events, victim, amount, attacker);
      }
      acted++;
    }

    // 胜负判定（我方全灭）
    if (GS.aliveHeroes(state).length === 0 && !state.over) {
      state.over = 'lose';
      state.phase = 'over';
    }
    return acted;
  }

  /** 回合结算：燃烧/风蚀持续伤害 + 胜负判定 */
  function applyDot(state, events) {
    var GS = g.DSH_GameState;
    var enemies = GS.aliveEnemies(state);
    enemies.forEach(function (e) {
      var burn = state.burnStacks[e.id] || 0;
      var wind = state.windBurnLayers[e.id] || 0;
      var dot = burn * 1 + wind * 2;
      if (dot > 0) {
        GS.pushLog(state, e.name + ' 受到持续伤害 ' + dot + '（燃烧' + burn + '层/风蚀' + wind + '层）');
        damageEnemy(state, e.id, dot, '持续伤害');
      }
    });
  }

  /** 胜负判定：胜 = 7 魔将全灭且本体血归零；负 = 我方 12 英雄全灭 */
  function checkWin(state) {
    var GS = g.DSH_GameState;
    if (state.over) return;
    if (GS.allGeneralsDead(state) && state.boss.hp <= 0) {
      state.over = 'win';
      state.phase = 'over';
      GS.pushLog(state, '🎉 魔将全灭，混沌·六爻魔已被击败，天命降临，胜！');
      return;
    }
    if (GS.aliveHeroes(state).length === 0) {
      state.over = 'lose';
      state.phase = 'over';
      GS.pushLog(state, '💀 我方英雄全灭，败局已定……');
    }
  }

  g.DSH_BattleSystem = {
    BASE_CRIT: BASE_CRIT,
    CRIT_MULT: CRIT_MULT,
    calcDamage: calcDamage,
    attackHeroToEnemy: attackHeroToEnemy,
    damageEnemy: damageEnemy,
    damageAllEnemies: damageAllEnemies,
    damageHero: damageHero,
    bossActPhase: bossActPhase,
    applyDot: applyDot,
    checkWin: checkWin
  };
})(typeof window !== 'undefined' ? window : globalThis);
