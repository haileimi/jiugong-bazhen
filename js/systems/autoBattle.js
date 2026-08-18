/**
 * autoBattle.js — v4 自动战斗引擎（大巴扎式：布阵 → 自动开打）
 *
 * 流程：setupBattle（抽 9 候选 + 敌方布位）→ [deploy 布阵] → startFight（掷格子加成）
 *   → advanceRound（一轮：全场按速度从高到低行动一次）→ 胜负判定 → 卦象 3/5 三选一、7 天命
 *
 * 我方 3×3（0-2 近战 ⚔️ / 3-5 远程 🏹 / 6-8 谋略 🪶）；
 * 敌方 3×3 镜像（0-2 谋略 / 3-5 远程 / 6-8 近战）；魔王本体独立在敌方之上。
 * 主角（主将）固定底部单位：不占格子、不耗布阵点、自动参战，主角死 = 输。
 *
 * 单位属性：战斗血 = 英雄血量 × 4；攻击 = 英雄攻击 × 战时等级（+15%/+30%）；
 *   五行克制 ×1.3/×0.7、暴击 10% ×1.5；格子加成（随机：攻+10% / 倍率×2 / 防+10%）；
 *   邻位光环（楚烈：左右相邻格 +10% 攻）；谋略每 2 回合放技能，冷却中 0.6× 普攻。
 */
(function (g) {
  'use strict';

  var GS = function () { return g.DSH_GameState; };
  var UNIT_HP_MULT = 4;      // 单位战斗血 = 英雄血 ×4
  var SCHEME_COOLDOWN = 1;   // 谋略技能冷却回合（1 = 隔回合放一次）
  var SCHEME_ATK_MULT = 0.6; // 谋略冷却中普攻倍率
  var BASE_CRIT = 0.10;
  var CRIT_MULT = 1.5;

  /* ---------------- 类别 → 排 ---------------- */
  function playerRowOf(cat) { return cat === '战斗' ? 0 : (cat === '护卫' ? 1 : 2); }
  function enemyRowOf(cat) { return cat === '计谋' ? 0 : (cat === '护卫' ? 1 : 2); }

  /* ---------------- 敌方布位（镜像 3×3，同部门排内居中） ---------------- */
  function assignEnemySlots(state) {
    state.enemySlot = {};
    var byRow = [[], [], []];
    state.enemies.forEach(function (e) {
      byRow[enemyRowOf(e.category || '战斗')].push(e.id);
    });
    byRow.forEach(function (ids, row) {
      var cols = [1];
      if (ids.length === 2) cols = [0, 2];
      if (ids.length >= 3) cols = [0, 1, 2];
      ids.forEach(function (id, i) {
        state.enemySlot[id] = row * 3 + (cols[i % cols.length]);
      });
    });
  }

  /* ---------------- 单位辅助 ---------------- */
  function formationUnits(state) {
    var out = [];
    state.formation.forEach(function (u, slot) {
      if (u && u.hp > 0) out.push({ uid: u.uid, heroId: u.heroId, hp: u.hp, maxHp: u.maxHp,
        warLevel: u.warLevel || 0, slot: slot });
    });
    return out;
  }

  function unitDef(state, heroId) {
    var h = g.DSH_HEROES.byId(heroId);
    return h ? (h.defense !== undefined ? h.defense : 1) : 1;
  }

  function enemyAtSlot(state, slot) {
    for (var id in state.enemySlot) {
      if (state.enemySlot[id] === slot) {
        var e = GS().getEnemy(state, id);
        if (e && e.alive && e.hp > 0) return e;
      }
    }
    return null;
  }

  /** 该格加成（type: atk% / mult× / def%） */
  function slotBuff(list, slot) {
    return list[slot] || null;
  }

  /** 邻位光环：楚烈（aura.atkPct）同排左右相邻格 */
  function auraBonus(state, slot) {
    var bonus = 0;
    [slot - 1, slot + 1].forEach(function (adj) {
      if (adj < 0 || adj > 8 || Math.floor(adj / 3) !== Math.floor(slot / 3)) return;
      var u = state.formation[adj];
      if (!u || u.hp <= 0) return;
      var h = g.DSH_HEROES.byId(u.heroId);
      if (h && h.aura && h.aura.atkPct) bonus += h.aura.atkPct;
    });
    return bonus;
  }

  /** 我方单位攻击力（战时等级 × 格子攻/倍率加成 × 邻位光环 × 谋略回气） */
  function playerUnitAtk(state, unit) {
    var h = g.DSH_HEROES.byId(unit.heroId);
    if (!h) return 0;
    var war = [1, 1.15, 1.3][Math.min(2, unit.warLevel || 0)];
    var atk = h.damage * war + (state.atkBuff[unit.uid] || 0);
    var buff = slotBuff(state.playerBuffs, unit.slot);
    if (buff && buff.type === 'atk') atk *= (100 + buff.value) / 100;
    if (buff && buff.type === 'mult') atk *= buff.value;
    atk *= (100 + auraBonus(state, unit.slot)) / 100;
    return Math.round(atk);
  }

  /** 主角攻击力（天赋 + 赤霄剑法宝） */
  function protagonistAtk(state) {
    var def = GS().commanderDef(state);
    if (!def) return 0;
    var atk = def.damage;
    var talent = def.talent;
    if (talent && talent.type === 'battlePct') atk *= (100 + talent.value) / 100;
    if (state.commander && state.commander.fabao === 'chixiaojian') atk *= 1.15;
    return Math.round(atk);
  }

  /** 敌方攻击力（减益 × 格子加成 × 层 buff） */
  function enemyAtkFull(state, enemy, slot) {
    var atk = GS().enemyAtk(state, enemy); // 含 atkDebuff
    var buff = slotBuff(state.enemyBuffs, slot);
    if (buff && buff.type === 'atk') atk *= (100 + buff.value) / 100;
    if (buff && buff.type === 'mult') atk *= buff.value;
    if (state.runBuffs.enemyAtkPct) atk *= (100 + state.runBuffs.enemyAtkPct) / 100;
    return Math.round(atk);
  }

  /* ---------------- 伤害 ---------------- */
  function rollCrit(hero, state) {
    var crit = state.rnd() < BASE_CRIT;
    var critMult = CRIT_MULT;
    if (hero && hero.skill && hero.skill.critDmg && state.rnd() < (hero.skill.chance || 0)) {
      crit = true;
      critMult = hero.skill.critDmg;
    }
    return { crit: crit, mult: critMult };
  }

  /** 我方单位打敌方 */
  function playerHitEnemy(state, events, unit, hero, enemy) {
    var raw = playerUnitAtk(state, unit);
    var c = rollCrit(hero, state);
    var mult = g.DSH_ELEMENTS.counterMult(hero.element, enemy.element) * (c.crit ? c.mult : 1);
    var dmg = Math.max(1, Math.round(raw * mult) - (enemy.defense || 0));
    enemy.hp -= dmg;
    state.lastHits.push({ kind: 'enemy', id: enemy.id, amount: dmg });
    var killed = enemy.hp <= 0;
    if (killed) { enemy.hp = 0; enemy.alive = false; }
    GS().pushLog(state, (unit.heroId === 'mc1' ? '主角' : hero.nick) + ' 攻击 ' + enemy.name +
      (c.crit ? '【暴击】' : '') + ' ' + dmg + ' 伤' + (killed ? '，击倒！' : ''));
    return killed;
  }

  /** 敌方打我方单位（主角走防御吸收） */
  function enemyHitPlayer(state, events, enemy, targetUnit) {
    var slot = targetUnit.slot;
    var raw = enemyAtkFull(state, enemy, state.enemySlot[enemy.id] !== undefined ? state.enemySlot[enemy.id] : 0);
    var hero = g.DSH_HEROES.byId(targetUnit.heroId);
    var c = rollCrit(null, state);
    var mult = g.DSH_ELEMENTS.counterMult(enemy.element, hero.element) * (c.crit ? c.mult : 1);
    var dmg = Math.max(1, Math.round(raw * mult));
    // 格子防御减伤
    var buff = slotBuff(state.playerBuffs, slot);
    if (buff && buff.type === 'def') dmg = Math.round(dmg * (100 - buff.value) / 100);
    dmg = Math.max(1, dmg - unitDef(state, targetUnit.heroId));
    targetUnit.hp -= dmg;
    state.lastHits.push({ kind: 'hero', id: targetUnit.uid, amount: dmg });
    if (targetUnit.hp <= 0) {
      targetUnit.hp = 0;
      GS().pushLog(state, hero.nick + ' 战死退场！');
    } else {
      GS().pushLog(state, enemy.name + ' 攻击 ' + hero.nick + '，' + dmg + ' 伤');
    }
  }

  /** 敌方打主角（防御吸收） */
  function enemyHitProtagonist(state, events, enemy) {
    var raw = enemyAtkFull(state, enemy, 0);
    var def = GS().commanderDef(state);
    var c = rollCrit(null, state);
    var mult = g.DSH_ELEMENTS.counterMult(enemy.element, def.element) * (c.crit ? c.mult : 1);
    var dmg = Math.max(1, Math.round(raw * mult));
    var talent = def.talent;
    if (talent && talent.type === 'dmgReduce') dmg = Math.round(dmg * (100 - talent.value) / 100);
    var absorbed = 0;
    if (state.commander.defense > 0) {
      absorbed = Math.min(state.commander.defense, dmg);
      state.commander.defense -= absorbed;
      dmg -= absorbed;
    }
    state.commander.hp -= dmg;
    if (absorbed + dmg > 0) state.lastHits.push({ kind: 'commander', amount: absorbed + dmg });
    if (state.commander.hp <= 0) {
      state.commander.hp = 0;
      GS().pushLog(state, '💀 主角战死！');
      state.over = 'lose';
      state.phase = 'over';
    } else {
      GS().pushLog(state, enemy.name + ' 攻击主角，' + dmg + ' 伤（防挡 ' + absorbed + '）');
    }
  }

  /* ---------------- 索敌 ---------------- */
  /** 敌方同列按排序找目标（rows 优先级），找不到返回 null */
  function findEnemy(state, col, rows) {
    for (var r = 0; r < rows.length; r++) {
      var e = enemyAtSlot(state, rows[r] * 3 + col);
      if (e) return e;
    }
    return null;
  }
  function findAnyEnemy(state, rows) {
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < 3; c++) {
        var e = enemyAtSlot(state, rows[r] * 3 + c);
        if (e) return e;
      }
    }
    return null;
  }
  function findPlayer(state, col, rows) {
    for (var r = 0; r < rows.length; r++) {
      var u = state.formation[rows[r] * 3 + col];
      if (u && u.hp > 0) return u;
    }
    return null;
  }
  function findAnyPlayer(state, rows) {
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < 3; c++) {
        var u = state.formation[rows[r] * 3 + c];
        if (u && u.hp > 0) return u;
      }
    }
    return null;
  }

  /* ---------------- 谋略技能 ---------------- */
  function schemeAct(state, events, unit, hero) {
    var col = unit.slot % 3;
    var target = findEnemy(state, col, [2, 1, 0]) || findAnyEnemy(state, [2, 1, 0]);
    if (hero.atkDown > 0 && target) {
      state.atkDebuff[target.id] = Math.min(60, (state.atkDebuff[target.id] || 0) + hero.atkDown);
      if (hero.wind) state.windBurnLayers[target.id] = (state.windBurnLayers[target.id] || 0) + hero.wind;
      GS().pushLog(state, hero.nick + ' 施计：' + target.name + ' 攻击 -' + hero.atkDown + '%' +
        (hero.wind ? '，风蚀 ' + hero.wind + ' 层' : ''));
      return;
    }
    // 无减益技能（抽牌/回气类）：回气 —— 自疗 25% + 本场攻击 +2
    var heal = Math.round(unit.maxHp * 0.25);
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    state.atkBuff[unit.uid] = (state.atkBuff[unit.uid] || 0) + 2;
    GS().pushLog(state, hero.nick + ' 回气：自疗 ' + heal + '，本场攻击 +2');
  }

  function enemySchemeAct(state, events, enemy, slot) {
    var col = slot % 3;
    var target = findPlayer(state, col, [0, 1, 2]) || findAnyPlayer(state, [0, 1, 2]);
    if (target) {
      state.atkDebuffPlayer = state.atkDebuffPlayer || {};
      state.atkDebuffPlayer[target.uid] = (state.atkDebuffPlayer[target.uid] || 0) + 20;
      GS().pushLog(state, enemy.name + ' 施术：' + (GS().cardDef(state, target.uid) || {}).nick + ' 攻击 -20%');
      return;
    }
  }

  /* ---------------- 行动 ---------------- */
  function actPlayerUnit(state, events, unit) {
    var hero = g.DSH_HEROES.byId(unit.heroId);
    var col = unit.slot % 3;
    var row = Math.floor(unit.slot / 3);
    if (row === 2 && hero.category === '计谋') {
      var cd = state.skillCd[unit.uid] || 0;
      if (cd > 0) { state.skillCd[unit.uid] = cd - 1; }
      else {
        state.skillCd[unit.uid] = SCHEME_COOLDOWN;
        schemeAct(state, events, unit, hero);
        return;
      }
      // 冷却中 → 0.6× 普攻
      var t = findEnemy(state, col, [2, 1, 0]) || findAnyEnemy(state, [2, 1, 0]);
      if (t) playerHitEnemy(state, events, unit, hero, t);
      return;
    }
    if (row === 0) { // 近战：同列最近（敌方近战排优先）
      var target = findEnemy(state, col, [2, 1, 0]) || findAnyEnemy(state, [2, 1, 0]);
      if (target) playerHitEnemy(state, events, unit, hero, target);
    } else { // 远程：同列任意（优先后排谋略）
      var target2 = findEnemy(state, col, [0, 1, 2]) || findAnyEnemy(state, [0, 1, 2]);
      if (target2) playerHitEnemy(state, events, unit, hero, target2);
    }
  }

  function actEnemy(state, events, enemy) {
    var slot = state.enemySlot[enemy.id];
    var col = slot % 3;
    var row = Math.floor(slot / 3);
    if (row === 0) { // 敌方谋略：技能
      var cd = state.skillCd[enemy.id] || 0;
      if (cd > 0) { state.skillCd[enemy.id] = cd - 1; }
      else {
        state.skillCd[enemy.id] = SCHEME_COOLDOWN;
        enemySchemeAct(state, events, enemy, slot);
        return;
      }
      var t = findPlayer(state, col, [0, 1, 2]) || findAnyPlayer(state, [0, 1, 2]);
      if (t) enemyHitPlayer(state, events, enemy, t);
      return;
    }
    var target;
    if (row === 2) target = findPlayer(state, col, [0, 1, 2]) || findAnyPlayer(state, [0, 1, 2]);
    else target = findPlayer(state, col, [2, 1, 0]) || findAnyPlayer(state, [2, 1, 0]);
    if (target) enemyHitPlayer(state, events, enemy, target);
    else if (GS().commanderAlive(state)) enemyHitProtagonist(state, events, enemy);
  }

  function actBoss(state, events) {
    var boss = state.boss;
    if (!boss || !boss.alive || boss.hp <= 0) return;
    // 随机打我方单位或主角
    var players = formationUnits(state);
    if (players.length === 0 && !GS().commanderAlive(state)) return;
    if (players.length > 0 && state.rnd() < 0.7) {
      var unit = players[Math.floor(state.rnd() * players.length)];
      enemyHitPlayer(state, events, boss, unit);
    } else if (GS().commanderAlive(state)) {
      enemyHitProtagonist(state, events, boss);
    }
  }

  function actProtagonist(state, events) {
    if (!GS().commanderAlive(state)) return;
    var hero = GS().commanderDef(state);
    var enemy = findAnyEnemy(state, [2, 1, 0]);
    if (!enemy) enemy = GS().aliveEnemies(state)[0];
    if (!enemy) return;
    var unit = { uid: 'mc1', heroId: 'mc1', hp: state.commander.hp, maxHp: state.commander.maxHp, slot: -1 };
    var raw = protagonistAtk(state);
    var c = rollCrit(hero, state);
    var mult = g.DSH_ELEMENTS.counterMult(hero.element, enemy.element) * (c.crit ? c.mult : 1);
    var dmg = Math.max(1, Math.round(raw * mult) - (enemy.defense || 0));
    enemy.hp -= dmg;
    state.lastHits.push({ kind: 'enemy', id: enemy.id, amount: dmg });
    var killed = enemy.hp <= 0;
    if (killed) { enemy.hp = 0; enemy.alive = false; }
    GS().pushLog(state, '主角 攻击 ' + enemy.name + (c.crit ? '【暴击】' : '') + ' ' + dmg + ' 伤' +
      (killed ? '，击倒！' : ''));
  }

  /* ---------------- 回合推进 ---------------- */
  function advanceRound(state, events) {
    if (state.phase !== 'fight' || state.over) return;

    // 1. 收集行动者（速度从高到低，同速我方先手）
    var actors = [];
    formationUnits(state).forEach(function (u) {
      var h = g.DSH_HEROES.byId(u.heroId);
      actors.push({ side: 'p', unit: u, speed: h.speed });
    });
    if (GS().commanderAlive(state)) {
      actors.push({ side: 'mc', speed: GS().commanderDef(state).speed || 5 });
    }
    state.enemies.forEach(function (e) {
      if (e.alive && e.hp > 0) actors.push({ side: 'e', enemy: e, speed: e.speed || 5 });
    });
    if (state.boss && state.boss.alive && state.boss.hp > 0 && GS().bossUnlocked(state)) {
      actors.push({ side: 'boss', speed: state.boss.speed || 5 });
    }
    actors.sort(function (a, b) { return b.speed - a.speed || (a.side === 'p' || a.side === 'mc' ? -1 : 1); });

    // 2. 行动（冻结跳过）
    actors.forEach(function (a) {
      if (state.over) return;
      if (a.side === 'p') {
        if (state.frozenNext[a.unit.uid]) { delete state.frozenNext[a.unit.uid]; return; }
        actPlayerUnit(state, events, a.unit);
      } else if (a.side === 'mc') {
        actProtagonist(state, events);
      } else if (a.side === 'e') {
        if (state.frozenNext[a.enemy.id]) { delete state.frozenNext[a.enemy.id]; return; }
        if (state.frozen[a.enemy.id]) { delete state.frozen[a.enemy.id]; return; }
        actEnemy(state, events, a.enemy);
      } else if (a.side === 'boss') {
        actBoss(state, events);
      }
    });
    if (state.over) return;

    // 3. 持续伤害 + 胜负判定
    g.DSH_BattleSystem.applyDot(state, events);
    checkWin(state);
    if (state.over) return;

    // 4. 回合 +1 → 卦象节奏（3/5 三选一挂起，7 天命自动）
    state.turn += 1;
    if (state.turn === 3 || state.turn === 5) {
      var kind = state.turn === 3 ? 'lower' : 'upper';
      state.pendingHex = { kind: kind, candidates: g.DSH_HexSystem.pickCandidates(state) };
      state.phase = 'pickHex';
      return;
    }
    if (state.turn >= 7 && !state.currentHexagram) {
      var hex = g.DSH_HexSystem.resolveHexagram(state);
      if (hex) {
        g.DSH_RuleSystem.registerRules(state, events);
        GS().pushLog(state, '☯ 天命技能『' + hex.name + '』觉醒！' + hex.effectText);
      }
    }

    GS().pushLog(state, '—— 第 ' + state.turn + ' 回合 ——');
  }

  /** 卦象三选一确认（main 弹窗回调） */
  function chooseHex(state, events, trigramId) {
    if (!state.pendingHex) return;
    if (state.pendingHex.kind === 'lower') state.lowerTrigram = trigramId;
    else state.upperTrigram = trigramId;
    var t = g.DSH_TRIGRAMS.byId(trigramId);
    GS().pushLog(state, '☯ 玩家选择' + (state.pendingHex.kind === 'lower' ? '下卦' : '上卦') + '『' + t.name + '』');
    state.pendingHex = null;
    state.phase = 'fight';
  }

  /* ---------------- 布阵 ---------------- */
  /** 掷 9 格加成（攻+10% / 倍率×2 / 防+10% 随机一种） */
  function rollSlotBuffs(state) {
    var types = ['atk', 'mult', 'def'];
    var vals = { atk: 10, mult: 2, def: 10 };
    for (var i = 0; i < 9; i++) {
      var t = types[Math.floor(state.rnd() * 3)];
      state.playerBuffs[i] = { type: t, value: vals[t] };
      var t2 = types[Math.floor(state.rnd() * 3)];
      state.enemyBuffs[i] = { type: t2, value: vals[t2] };
    }
  }

  /**
   * 开局：抽 9 候选 + 敌方布位 + 布阵点。
   * @param {object} opts { autoDeploy: true 教学战固定阵容 }
   */
  function setupBattle(state, events, kind, opts) {
    opts = opts || {};
    GS().pushLog(state, '—— 第 ' + state.layer + ' 层 ' +
      (kind === 'boss' ? '魔王战' : (kind === 'tutorial' ? '流寇战（新手教学）' : '小怪战')) + ' ——');
    state.battleKind = kind;
    state.turn = 1;
    state.upperTrigram = null;
    state.lowerTrigram = null;
    state.currentHexagram = null;
    state.enemies = [];
    state.boss = null;
    state.frozen = {};
    state.frozenNext = {};
    state.burnStacks = {};
    state.windBurnLayers = {};
    state.atkDebuff = {};
    state.atkBuff = {};
    state.skillCd = {};
    state.atkDebuffPlayer = {};
    state.pendingHex = null;
    state.lastHits = [];
    state.over = null;
    state.rewardApplied = false;
    state.lastReward = null;
    state.commander.defense = 0;

    g.DSH_TurnSystem.buildEnemies(state);
    assignEnemySlots(state);

    // 布阵候选：从卡包抽 9（教学战固定 阿大+阿二 进候选，卡包没有则补一张）
    var pool = g.DSH_TurnSystem.drawFromPack(state, 9);
    if (kind === 'tutorial') {
      ['cm1', 'cm2'].forEach(function (hid) {
        var c = state.pack.filter(function (x) { return x.heroId === hid; })[0];
        if (!c) {
          state.pack.push({ uid: hid + '#tut', heroId: hid, warLevel: 0 });
          c = state.pack[state.pack.length - 1];
        }
        if (pool.indexOf(c.uid) < 0) {
          // 替换最后一个普通候选（不重复 pop 弹掉教学卡）
          for (var i = pool.length - 1; i >= 0; i--) {
            var cc = GS().getCard(state, pool[i]);
            if (cc && cc.heroId !== hid && pool[i].indexOf('#tut') < 0) {
              pool[i] = c.uid;
              break;
            }
          }
        }
      });
    }
    state.candidates = pool;
    state.formation = new Array(9).fill(null);
    state.deployLeft = GS().deployPoints(state);
    state.phase = 'deploy';

    if (opts.autoDeploy) {
      // 教学战：自动布阵 阿大(0) + 阿二(4)
      deployUnit(state, null, findCandidate(state, 'cm1'), 0);
      deployUnit(state, null, findCandidate(state, 'cm2'), 4);
      startFight(state, events);
    }
  }

  function findCandidate(state, heroId) {
    for (var i = 0; i < state.candidates.length; i++) {
      var c = GS().getCard(state, state.candidates[i]);
      if (c && c.heroId === heroId) return state.candidates[i];
    }
    return null;
  }

  /** 布阵：把候选放上格子（排须与类别匹配，扣布阵点） */
  function deployUnit(state, events, uid, slot) {
    if (state.phase !== 'deploy') return { ok: false, msg: '当前不在布阵阶段' };
    if (state.candidates.indexOf(uid) < 0) return { ok: false, msg: '候选里没有这张卡' };
    if (state.formation[slot]) return { ok: false, msg: '该格已有人' };
    var c = GS().getCard(state, uid);
    var h = g.DSH_HEROES.byId(c.heroId);
    var expectedRow = playerRowOf(h.category);
    if (Math.floor(slot / 3) !== expectedRow) {
      return { ok: false, msg: h.nick + ' 是' + (expectedRow === 0 ? '近战' : expectedRow === 1 ? '远程' : '谋略') + '，应放对应排' };
    }
    if (state.deployLeft < h.deployCost) return { ok: false, msg: '布阵点不足（需要 ' + h.deployCost + '，剩 ' + state.deployLeft + '）' };
    state.formation[slot] = { uid: uid, heroId: c.heroId, hp: h.hp * UNIT_HP_MULT, maxHp: h.hp * UNIT_HP_MULT, warLevel: c.warLevel || 0 };
    state.deployLeft -= h.deployCost;
    state.candidates = state.candidates.filter(function (u) { return u !== uid; });
    GS().pushLog(state, '⚑ 布阵：' + h.nick + '（-' + h.deployCost + ' 点，剩 ' + state.deployLeft + '）');
    return { ok: true };
  }

  /** 撤阵：返回候选并退点 */
  function undeployUnit(state, uid) {
    for (var s = 0; s < 9; s++) {
      var u = state.formation[s];
      if (u && u.uid === uid) {
        var h = g.DSH_HEROES.byId(u.heroId);
        state.formation[s] = null;
        state.deployLeft += h.deployCost;
        state.candidates.push(uid);
        return { ok: true };
      }
    }
    return { ok: false, msg: '未找到该单位' };
  }

  /** 开战：掷格子加成，进入自动战斗 */
  function startFight(state, events) {
    rollSlotBuffs(state);
    state.phase = 'fight';
    events.clear();
    events.emit('battleStart', { state: state });
    GS().pushLog(state, '⚔ 开战！布阵点剩余 ' + state.deployLeft);
  }

  /* ---------------- 胜负 ---------------- */
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
      GS().pushLog(state, '💀 主角战死，败局已定……');
    }
  }

  g.DSH_AutoBattle = {
    UNIT_HP_MULT: UNIT_HP_MULT,
    playerRowOf: playerRowOf,
    enemyRowOf: enemyRowOf,
    assignEnemySlots: assignEnemySlots,
    formationUnits: formationUnits,
    enemyAtSlot: enemyAtSlot,
    slotBuff: slotBuff,
    auraBonus: auraBonus,
    playerUnitAtk: playerUnitAtk,
    setupBattle: setupBattle,
    deployUnit: deployUnit,
    undeployUnit: undeployUnit,
    startFight: startFight,
    advanceRound: advanceRound,
    chooseHex: chooseHex,
    checkWin: checkWin
  };
})(typeof window !== 'undefined' ? window : globalThis);
