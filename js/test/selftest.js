/**
 * selftest.js — 规则自检（v3：五行克制 / 八卦 / 64 卦 / 英雄数据 / 卡包 / 出牌 /
 *               主将受击 / 卦象节奏 / 伤害公式 / 规则库 / 战斗集成）
 * 浏览器与 Node（tools/run-selftest.js）双环境可跑。
 */
(function (g) {
  'use strict';

  var assert = [];
  var ok = 0;
  var fail = 0;
  var details = [];

  function check(name, cond, msg) {
    assert.push({ name: name, pass: !!cond, msg: msg || '' });
    if (cond) ok++; else fail++;
  }

  /** 序列随机源 */
  function seqRng(seq) {
    var i = 0;
    return function () {
      var v = i < seq.length ? seq[i] : 0.5;
      i++;
      return v;
    };
  }

  /** 结构性测试用：跑完整 startBattle（小怪战） */
  function setupMonsterBattle(seq) {
    var GS = g.DSH_GameState;
    var st = GS.createState({ random: seqRng(seq || [0.5]) });
    st.commander = { heroId: 'dw1', hp: 14, maxHp: 14, defense: 0 };
    st.pack = GS.buildPack('dw1');
    var ev = new g.DSH_EventSystem();
    g.DSH_TurnSystem.startBattle(st, ev, 'monster');
    return { st: st, ev: ev };
  }

  /**
   * 确定性出牌测试用：手搭战场（不跑 startBattle，避免随机序列被抽牌消耗）。
   * 手牌由调用方指定（hand[0] = 'wz1#0' 等）。
   */
  function setupPlay(seq) {
    var GS = g.DSH_GameState;
    var EN = g.DSH_ENEMIES;
    var st = GS.createState({ random: seqRng(seq || [0.5]) });
    st.commander = { heroId: 'dw1', hp: 14, maxHp: 14, defense: 0 };
    st.pack = GS.buildPack('dw1');
    st.enemies = EN.GENERALS.slice(0, 2).map(function (e) {
      return { id: e.id, name: e.name, element: e.element, hp: e.hp, maxHp: e.hp, atk: e.atk, aoe: e.aoe, alive: true };
    });
    st.boss = null;
    st.battleKind = 'monster';
    st.phase = 'player';
    st.turn = 1;
    st.tianji = 3;
    st.maxTianji = 3;
    st.hand = [];
    st.usedThisTurn = {};
    st.firstCardPlayedThisTurn = false;
    st.freeChase = {};
    st.tianjiUpApplied = false;
    st.runBuffs = { battlePct: 0, defPct: 0, enemyAtkPct: 0, tianjiBonus: 0 };
    st.stats = { revived: false, firstAttackDone: false, attackCountThisTurn: 0,
      consecutiveAttacks: 0, comboBonus: 0, nextAttackCrit: false, onceSaveUsed: false };
    st.over = null;
    var ev = new g.DSH_EventSystem();
    return { st: st, ev: ev };
  }

  /** 经济系统测试用：手搭状态（不消耗随机序列，rnd 供结算掷骰） */
  function setupEconomy(seq) {
    var GS = g.DSH_GameState;
    var st = GS.createState({ random: seqRng(seq || [0.5]) });
    st.commander = { heroId: 'dw1', hp: 14, maxHp: 14, defense: 0 };
    st.pack = GS.buildPack('dw1');
    st.battleKind = 'monster';
    return { st: st };
  }

  function run() {
    ok = 0; fail = 0; details = [];
    var E = g.DSH_ELEMENTS;
    var H = g.DSH_HEROES;
    var T = g.DSH_TRIGRAMS;
    var HX = g.DSH_HEX64;
    var EN = g.DSH_ENEMIES;
    var GS = g.DSH_GameState;
    var BS = g.DSH_BattleSystem;
    var TS = g.DSH_TurnSystem;
    var SS = g.DSH_SaveSystem;
    var EC = g.DSH_Economy;

    /* ============ 1. 五行克制（25 项） ============ */
    var expect = {
      '金木': 1.3, '金土': 1.0, '金水': 1.0, '金火': 0.7, '金金': 1.0,
      '木土': 1.3, '木水': 1.0, '木火': 1.0, '木金': 0.7, '木木': 1.0,
      '土水': 1.3, '土火': 1.0, '土金': 1.0, '土木': 0.7, '土土': 1.0,
      '水火': 1.3, '水金': 1.0, '水木': 1.0, '水土': 0.7, '水水': 1.0,
      '火金': 1.3, '火木': 1.0, '火土': 1.0, '火水': 0.7, '火火': 1.0
    };
    E.RING.forEach(function (att) {
      E.RING.forEach(function (def) {
        var m = E.counterMult(att, def);
        check('五行克制 ' + att + '攻' + def + ' = ' + expect[att + def], m === expect[att + def], 'got ' + m);
      });
    });

    /* ============ 2. 克制环（5 项） ============ */
    check('金克木', E.BEATS['金'] === '木');
    check('木克土', E.BEATS['木'] === '土');
    check('土克水', E.BEATS['土'] === '水');
    check('水克火', E.BEATS['水'] === '火');
    check('火克金', E.BEATS['火'] === '金');

    /* ============ 3. 八卦成卦（24 + 8 + 4） ============ */
    var linesExpect = {
      qian: ['阳', '阳', '阳'], dui: ['阳', '阳', '阴'], li: ['阳', '阴', '阳'],
      zhen: ['阳', '阴', '阴'], xun: ['阴', '阳', '阳'], kan: ['阴', '阳', '阴'],
      gen: ['阴', '阴', '阳'], kun: ['阴', '阴', '阴']
    };
    T.TRIGRAMS.forEach(function (t) {
      var exp = linesExpect[t.id];
      check('八卦 ' + t.name + ' 下爻=' + exp[0], t.lines[0] === exp[0]);
      check('八卦 ' + t.name + ' 中爻=' + exp[1], t.lines[1] === exp[1]);
      check('八卦 ' + t.name + ' 上爻=' + exp[2], t.lines[2] === exp[2]);
      check('八卦 ' + t.name + ' 有规则', t.rules.length >= 1);
    });
    check('巽爻序修正为阴阳阳', T.byId('xun').lines.join('') === '阴阳阳');
    check('由爻序可反推八卦', T.composeLower('阳', '阳', '阳').id === 'qian');
    check('由爻序可反推坤', T.composeLower('阴', '阴', '阴').id === 'kun');
    check('由爻序可反推坎', T.composeLower('阴', '阳', '阴').id === 'kan');

    /* ============ 4. 64 卦完整性（192 + 1） ============ */
    T.TRIGRAMS.forEach(function (up) {
      T.TRIGRAMS.forEach(function (lo) {
        var hex = HX.byPair(up.id, lo.id);
        check('64卦存在 上' + up.name + '下' + lo.name, !!hex, 'missing');
        if (hex) {
          check('64卦命名 上' + up.name + '下' + lo.name, hex.name.length >= 2);
          check('64卦规则 上' + up.name + '下' + lo.name, hex.rules.length >= 1);
        }
      });
    });
    check('64 卦总数 = 64', HX.count === 64, 'got ' + HX.count);

    /* ============ 5. 英雄数据 v3（13 名，约 70 项） ============ */
    var validCats = ['战斗', '护卫', '计谋'];
    var validTargets = ['single', 'all', 'self'];
    var catSet = {};
    H.HEROES.forEach(function (h) {
      check('英雄 ' + h.id + ' 有id', !!h.id);
      check('英雄 ' + h.id + ' 类别合法', validCats.indexOf(h.category) >= 0);
      check('英雄 ' + h.id + ' 五行合法', E.isValid(h.element));
      check('英雄 ' + h.id + ' 指向合法', validTargets.indexOf(h.target) >= 0);
      check('英雄 ' + h.id + ' 有主将天赋', !!h.talent && !!h.talent.name && !!h.talent.type);
      check('英雄 ' + h.id + ' 主将血量>0', h.hp > 0);
      catSet[h.category] = true;
    });
    check('英雄共 13 名', H.HEROES.length === 13);
    check('英雄 id 唯一', new Set(H.HEROES.map(function (h) { return h.id; })).size === 13);
    check('三类齐全：战斗', catSet['战斗'] === true);
    check('三类齐全：护卫', catSet['护卫'] === true);
    check('三类齐全：计谋', catSet['计谋'] === true);
    check('战斗牌 ≥5 张', H.HEROES.filter(function (h) { return h.category === '战斗'; }).length >= 5);
    check('护卫牌 ≥4 张', H.HEROES.filter(function (h) { return h.category === '护卫'; }).length >= 4);
    check('计谋牌 ≥3 张', H.HEROES.filter(function (h) { return h.category === '计谋'; }).length >= 3);
    check('新增白泽·玄机在册', !!H.byId('bz1'));
    check('白泽为计谋/自身', H.byId('bz1').category === '计谋' && H.byId('bz1').target === 'self');
    check('白泽特技=抽满手牌', H.byId('bz1').fillHand === true);

    /* ============ 6. 魔王数据（50 项） ============ */
    var enemies = EN.GENERALS.concat([EN.BOSS]);
    enemies.forEach(function (e) {
      check('敌方 ' + e.name + ' 有id', !!e.id);
      check('敌方 ' + e.name + ' 五行合法', E.isValid(e.element));
      check('敌方 ' + e.name + ' 血量>0', e.hp > 0);
      check('敌方 ' + e.name + ' 攻击>0', e.atk > 0);
      check('敌方 ' + e.name + ' 有名字', e.name.length >= 2);
    });
    check('五魔将 id 唯一', new Set(EN.GENERALS.map(function (e) { return e.id; })).size === 5);
    check('魔将共 5 名', EN.GENERALS.length === 5);
    check('魔王本体血量=100', EN.BOSS.hp === 100);

    /* ============ 7. 伤害公式（10 项） ============ */
    check('普通 10x1.0', BS.calcDamage(10, 1, false, null, 0) === 10);
    check('暴击 10x1.5', BS.calcDamage(10, 1, true, 1.5, 0) === 15);
    check('黑杀特技 15x2.0', BS.calcDamage(15, 1, true, 2, 0) === 30);
    check('克制 10x1.3', BS.calcDamage(10, 1.3, false, null, 0) === 13);
    check('被克 6x0.7', BS.calcDamage(6, 0.7, false, null, 0) === 4);
    check('下限保护 max(2,1)', BS.calcDamage(1, 1, false, null, 0) === 2);
    check('连击增伤 +3', BS.calcDamage(10, 1, false, null, 3) === 13);
    check('暴击+克制 10x1.3x1.5', BS.calcDamage(10, 1.3, true, 1.5, 0) === 20);
    check('慕容珩天赋 12x2.0', BS.calcDamage(12, 1, true, 2.0, 0) === 24);
    check('草间溜全体 10x1.3', BS.calcDamage(10, 1.3, false, null, 0) === 13);

    /* ============ 8. 规则库（25 种，50 项） ============ */
    var ruleKeys = Object.keys(HX.RULE_TEXT);
    check('规则库共 25 种', ruleKeys.length === 25, 'got ' + ruleKeys.length);
    var requiredKeys = ['atkPct', 'defPct', 'bossAtkDown', 'opening', 'shieldAll', 'healAll',
      'burnRound', 'firstCrit', 'comboCrit', 'lifesteal', 'dmgShield', 'revive',
      'freezeSkill', 'burnOnHit', 'windBurn', 'chase', 'thorns', 'dmgReduce',
      'critChance', 'stunHit', 'healOnHit', 'empowNext', 'qiantian', 'jiji', 'weiji'];
    requiredKeys.forEach(function (k) {
      check('规则 ' + k + ' 存在', !!HX.RULE_TEXT[k]);
      check('规则 ' + k + ' 有名称', HX.RULE_TEXT[k].name.length >= 2);
    });

    /* ============ 9. 事件系统（4 项） ============ */
    var ev = new g.DSH_EventSystem();
    var fired = 0;
    var h1 = function () { fired++; };
    ev.on('test', h1);
    ev.emit('test', {});
    check('事件触发', fired === 1);
    ev.off('test', h1);
    ev.emit('test', {});
    check('事件移除', fired === 1);
    ev.on('t2', h1);
    ev.clear('t2');
    ev.emit('t2', {});
    check('事件清空类型', fired === 1);
    ev.on('t3', h1);
    ev.clear();
    ev.emit('t3', {});
    check('事件清空全部', fired === 1);

    /* ============ 10. 状态默认（8 项） ============ */
    var st = GS.createState({ random: seqRng([0.5]) });
    check('初始天机 3', st.tianji === 3);
    check('默认天机上限 3', st.maxTianji === 3);
    check('手牌上限 10（不可改）', GS.HAND_MAX === 10);
    check('初始阶段 home', st.phase === 'home');
    check('初始层数 1', st.layer === 1);
    check('地图节点 4 个', st.mapNodes.length === 4);
    check('节点顺序 小怪/营帐/事件/魔王', st.mapNodes.map(function (n) { return n.type; }).join(',') === 'monster,camp,event,boss');
    check('初始无主将/无卡包', st.commander === null && st.pack.length === 0);

    /* ============ 11. 卡包构建（8 项） ============ */
    var pack = GS.buildPack('wz1');
    check('卡包 48 张（上限）', pack.length === 48);
    check('主将不出现在卡包', pack.every(function (c) { return c.heroId !== 'wz1'; }));
    check('卡包含 12 种偏将', new Set(pack.map(function (c) { return c.heroId; })).size === 12);
    check('每种 4 张', pack.filter(function (c) { return c.heroId === 'gs1'; }).length === 4);
    check('uid 唯一', new Set(pack.map(function (c) { return c.uid; })).size === 48);
    check('卡包含新增白泽', pack.some(function (c) { return c.heroId === 'bz1'; }));
    check('白泽当主将时卡包满 48', GS.buildPack('bz1').length === 48);
    check('白泽主将时不含白泽', GS.buildPack('bz1').every(function (c) { return c.heroId !== 'bz1'; }));

    /* ============ 12. 战斗开始（9 项） ============ */
    var b1 = setupMonsterBattle([0.5]);
    check('小怪战敌方 2 个', b1.st.enemies.length === 2);
    check('小怪战无魔王本体', b1.st.boss === null);
    check('起手 5 张手牌', b1.st.hand.length === 5);
    check('手牌不超上限', b1.st.hand.length <= GS.HAND_MAX);
    check('手牌全部来自卡包', b1.st.hand.every(function (u) { return GS.cardInHand(b1.st, u); }));
    check('开局防御归零', b1.st.commander.defense === 0);
    check('开局进入玩家回合', b1.st.phase === 'player' && b1.st.turn === 1);
    check('开局无卦象', b1.st.lowerTrigram === null && b1.st.currentHexagram === null);
    check('天机 3/3', b1.st.tianji === 3 && b1.st.maxTianji === 3);

    // 白泽主将天赋：起手 7 张
    var stBz = GS.createState({ random: seqRng([0.5]) });
    stBz.commander = { heroId: 'bz1', hp: 10, maxHp: 10, defense: 0 };
    stBz.pack = GS.buildPack('bz1');
    g.DSH_TurnSystem.startBattle(stBz, new g.DSH_EventSystem(), 'monster');
    check('白泽主将起手 7 张', stBz.hand.length === 7);
    check('白泽天赋不改手牌上限', GS.HAND_MAX === 10);

    /* ============ 13. 出牌：单体战斗（8 项） ============ */
    var b2 = setupPlay([0.99, 0.99]); // 不暴击、不特技
    b2.st.hand = ['wz1#0'];
    var targetEnemy = b2.st.enemies[0];
    check('单体卡不给目标返回 null', BS.playCard(b2.st, b2.ev, 'wz1#0', null) === null);
    var before = targetEnemy.hp;
    var r = BS.playCard(b2.st, b2.ev, 'wz1#0', targetEnemy.id);
    check('单体攻击执行成功', !!r);
    var expectDmg = Math.max(2, Math.round(16 * E.counterMult('火', targetEnemy.element)));
    check('伤害 = 攻击×五行克制（' + expectDmg + '）', r && r.damage === expectDmg, 'got ' + (r && r.damage));
    check('敌方扣血正确', targetEnemy.hp === before - expectDmg);
    check('天机 3→2', b2.st.tianji === 2);
    check('手牌移除该卡', !GS.cardInHand(b2.st, 'wz1#0'));
    check('标记已使用', b2.st.usedThisTurn['wz1#0'] === true);
    check('卡包仍 48 张（用完回卡包）', b2.st.pack.length === 48);

    /* ============ 14. 出牌：全体战斗（3 项） ============ */
    var b3 = setupPlay([0.99, 0.99, 0.99, 0.99]);
    b3.st.hand = ['gs2#0'];
    var beforeHps = b3.st.enemies.map(function (e) { return e.hp; });
    var r3 = BS.playCard(b3.st, b3.ev, 'gs2#0', null);
    check('全体卡无需目标可打出', !!r3);
    check('全体伤害命中所有敌人', b3.st.enemies.every(function (e, i) { return e.hp < beforeHps[i]; }));
    check('全体卡耗 1 天机', b3.st.tianji === 2);

    /* ============ 15. 出牌：护卫（3 项） ============ */
    var b4 = setupPlay([0.5]);
    b4.st.hand = ['qb1#0'];
    var r4 = BS.playCard(b4.st, b4.ev, 'qb1#0', null);
    check('护卫卡直接打出', !!r4);
    check('获得 9 点防御', b4.st.commander.defense === 9);
    check('护卫卡耗 1 天机', b4.st.tianji === 2);

    /* ============ 16. 出牌：计谋（4 项） ============ */
    var b5 = setupPlay([0.5]);
    b5.st.hand = ['ms1#0'];
    var handLen0 = b5.st.hand.length;
    BS.playCard(b5.st, b5.ev, 'ms1#0', null);
    check('观星眼：天机上限 +1', b5.st.tianjiUpApplied === true && b5.st.maxTianji === 4);
    check('观星眼：抽 2 张', b5.st.hand.length === handLen0 - 1 + 2);

    var b6 = setupPlay([0.5]);
    b6.st.hand = ['bz1#0'];
    BS.playCard(b6.st, b6.ev, 'bz1#0', null);
    check('白泽：手牌抽满至 10', b6.st.hand.length === GS.HAND_MAX);
    check('白泽：不超过 10（多出的回卡包）', b6.st.hand.length <= GS.HAND_MAX);

    /* ============ 17. 单体指向：护卫/计谋减益（4 项） ============ */
    var b7 = setupPlay([0.5]);
    b7.st.hand = ['dw2#0'];
    b7.st.commander.hp = 10; // 留出回血空间
    var e0 = b7.st.enemies[0];
    var e0atk = GS.enemyAtk(b7.st, e0);
    var hp0 = b7.st.commander.hp;
    BS.playCard(b7.st, b7.ev, 'dw2#0', e0.id);
    check('闷嘴石：敌方攻击 -30%', b7.st.atkDebuff[e0.id] === 30);
    check('闷嘴石：敌方攻击力下降', GS.enemyAtk(b7.st, e0) === Math.floor(e0atk * 0.7));
    check('闷嘴石：恢复 3 点血量', b7.st.commander.hp === hp0 + 3);
    b7.st.atkDebuff[e0.id] = 40;
    b7.st.hand = ['ms2#0'];
    BS.playCard(b7.st, b7.ev, 'ms2#0', e0.id);
    check('冷算子：减益封顶 60%', b7.st.atkDebuff[e0.id] === 60);

    /* ============ 18. 主将受击（6 项） ============ */
    var b8 = setupPlay([0.5]);
    b8.st.commander = { heroId: 'wz1', hp: 3, maxHp: 3, defense: 5 }; // 红炮无减伤天赋
    var died = BS.damageCommander(b8.st, b8.ev, 7, null);
    check('防御优先吸收：防5血扣2', b8.st.commander.defense === 0 && b8.st.commander.hp === 1);
    check('未致死', died === false);
    BS.damageCommander(b8.st, b8.ev, 12, null);
    check('血量归零判负', b8.st.over === 'lose' && b8.st.commander.hp === 0);

    var b9 = setupPlay([0.5]);
    b9.st.commander = { heroId: 'ms2', hp: 1, maxHp: 10, defense: 0 }; // 希寒川：免死
    var died9 = BS.damageCommander(b9.st, b9.ev, 9, null);
    check('希寒川天赋：免死留 1 血', died9 === false && b9.st.commander.hp === 1 && b9.st.stats.onceSaveUsed === true);
    BS.damageCommander(b9.st, b9.ev, 9, null);
    check('免死用尽后战死', b9.st.over === 'lose');

    /* ============ 19. 卦象节奏：每场重算 3/5/7（6 项） ============ */
    var b10 = setupMonsterBattle([0.5]);
    b10.st.commander.hp = 999; // 撑住回合推进
    while (b10.st.turn < 3 && !b10.st.over) g.DSH_TurnSystem.endPlayerTurn(b10.st, b10.ev);
    check('第 3 回合抽下卦', b10.st.lowerTrigram !== null && b10.st.upperTrigram === null);
    while (b10.st.turn < 5 && !b10.st.over) g.DSH_TurnSystem.endPlayerTurn(b10.st, b10.ev);
    check('第 5 回合抽上卦', b10.st.upperTrigram !== null);
    check('第 7 回合前无天命', b10.st.currentHexagram === null);
    while (b10.st.turn < 7 && !b10.st.over) g.DSH_TurnSystem.endPlayerTurn(b10.st, b10.ev);
    check('第 7 回合天命觉醒', b10.st.currentHexagram !== null);
    check('天命 = 上×下 64 卦', b10.st.currentHexagram &&
      HX.byPair(b10.st.upperTrigram, b10.st.lowerTrigram).name === b10.st.currentHexagram.name);
    check('每场战斗重新算：新开一场卦象清零', (function () {
      var b = setupMonsterBattle([0.5]);
      return b.st.lowerTrigram === null && b.st.upperTrigram === null && b.st.currentHexagram === null;
    })());

    /* ============ 20. 战斗胜利/失败判定（5 项） ============ */
    var b11 = setupMonsterBattle([0.5]);
    b11.st.enemies.forEach(function (e) { e.hp = 0; e.alive = false; });
    BS.checkWin(b11.st);
    check('小怪全灭即胜', b11.st.over === 'win');

    var b12 = GS.createState({ random: seqRng([0.5]) });
    b12.commander = { heroId: 'dw1', hp: 14, maxHp: 14, defense: 0 };
    b12.pack = GS.buildPack('dw1');
    g.DSH_TurnSystem.startBattle(b12, new g.DSH_EventSystem(), 'boss');
    check('魔王战敌方 5+1', b12.enemies.length === 5 && !!b12.boss);
    check('魔王未解锁时本体不可攻击', !GS.enemyAlive(b12, 'boss'));
    b12.enemies.forEach(function (e) { e.hp = 0; e.alive = false; });
    check('魔将全灭后本体解锁', GS.bossUnlocked(b12) && GS.enemyAlive(b12, 'boss'));
    b12.boss.hp = 0;
    b12.boss.alive = false;
    BS.checkWin(b12);
    check('魔王战全灭判胜', b12.over === 'win');

    /* ============ 21. 追击（2 项） ============ */
    var b13 = setupPlay([0.99, 0.05]); // 不暴击、特技触发（gs1 追击）
    b13.st.hand = ['gs1#0'];
    var tj0 = b13.st.tianji;
    var r13 = BS.playCard(b13.st, b13.ev, 'gs1#0', b13.st.enemies[0].id);
    check('追击触发（特技掷骰命中）', !!r13 && r13.chased === true);
    check('追击不耗天机且卡留手牌', b13.st.tianji === tj0 && GS.cardInHand(b13.st, 'gs1#0'));

    /* ============ 22. 黑杀暴击特技（2 项） ============ */
    var b14 = setupPlay([0.99, 0.05]); // 不基础暴击、特技触发
    b14.st.hand = ['wz3#0'];
    var e14 = b14.st.enemies[0];
    var r14 = BS.playCard(b14.st, b14.ev, 'wz3#0', e14.id);
    check('黑杀特技=暴击伤害×2', r14 && r14.damage === Math.max(2, Math.round(15 * E.counterMult('火', e14.element) * 2)));

    /* ============ 23. 存档序列化（3 项） ============ */
    var b15 = GS.createState({ random: seqRng([0.5]) });
    b15.commander = { heroId: 'dw1', hp: 10, maxHp: 14, defense: 3 };
    b15.pack = GS.buildPack('dw1');
    b15.layer = 2;
    var s = SS.serialize(b15);
    check('存档含层数/主将/卡包', s.layer === 2 && s.commander.heroId === 'dw1' && s.pack.length === 48);
    check('存档不含战斗状态', s.hand === undefined && s.turn === undefined);
    check('存档版本 v3', s.v === 3);

    /* ============ 24. 层数成长（3 项） ============ */
    check('小怪战血量按层成长', (function () {
      var a = GS.createState({ random: seqRng([0.5]) });
      a.layer = 3;
      a.commander = { heroId: 'dw1', hp: 14, maxHp: 14, defense: 0 };
      a.pack = GS.buildPack('dw1');
      g.DSH_TurnSystem.startBattle(a, new g.DSH_EventSystem(), 'monster');
      var base = EN.byId(a.enemies[0].id);
      return a.enemies[0].maxHp === Math.round(base.hp * 1.6);
    })());
    check('怪物攻击按层成长', (function () {
      var a = GS.createState({ random: seqRng([0.5]) });
      a.layer = 2;
      a.commander = { heroId: 'dw1', hp: 14, maxHp: 14, defense: 0 };
      a.pack = GS.buildPack('dw1');
      g.DSH_TurnSystem.startBattle(a, new g.DSH_EventSystem(), 'monster');
      var base = EN.byId(a.enemies[0].id);
      return a.enemies[0].atk === Math.round(base.atk * 1.15);
    })());

    /* ============ 25. 经济系统：奖励结算 / 商店 / 招募 / 军粮（16 项） ============ */
    check('军粮每日上限 5 点', EC.RATIONS_MAX === 5);

    // 小怪战胜利：+15 金、+1 军粮、掷骰掉卡（rnd 0.1 < 0.35 掉）
    var e1 = setupEconomy([0.1, 0.3]);
    e1.st.gold = 0; e1.st.rations = 3;
    var rw1 = EC.victoryRewards(e1.st);
    check('小怪战 +15 马蹄金', rw1.gold === EC.MONSTER_GOLD && e1.st.gold === EC.MONSTER_GOLD);
    check('小怪战军粮 +1（3→4）', rw1.rationGained === 1 && e1.st.rations === 4);
    check('小怪战掷骰命中掉 1 卡（卡包 49）', rw1.cards.length === 1 && e1.st.pack.length === 49);
    check('奖励已标记防重复', e1.st.rewardApplied === true);

    // 小怪战掷骰不中不掉卡（rnd 0.5 ≥ 0.35）
    var e2 = setupEconomy([0.5]);
    e2.st.gold = 0;
    var rw2 = EC.victoryRewards(e2.st);
    check('小怪战掷骰不中不掉卡（卡包仍 48）', rw2.cards.length === 0 && e2.st.pack.length === 48);

    // 魔王战：+40 金、军粮封顶、保底掉卡
    var e3 = setupEconomy([0.0]);
    e3.st.battleKind = 'boss';
    e3.st.gold = 0; e3.st.rations = 5;
    var rw3 = EC.victoryRewards(e3.st);
    check('魔王战 +40 马蹄金', rw3.gold === EC.BOSS_GOLD && e3.st.gold === EC.BOSS_GOLD);
    check('魔王战军粮封顶（满 5 不加）', rw3.rationGained === 0 && e3.st.rations === 5);
    check('魔王战保底掉卡（卡包 49）', rw3.cards.length === 1 && e3.st.pack.length === 49);

    // 卡包成长 uid 唯一
    check('成长卡 uid 唯一（连续加 2 张）', (function () {
      var s = GS.createState({ random: seqRng([0.5]) });
      s.commander = { heroId: 'dw1', hp: 14, maxHp: 14, defense: 0 };
      s.pack = GS.buildPack('dw1');
      EC.addCardToPack(s, 'wz1');
      EC.addCardToPack(s, 'wz1');
      return s.pack.length === 50 && new Set(s.pack.map(function (c) { return c.uid; })).size === 50;
    })());

    // 商店：买招式卡包
    var e4 = setupEconomy([0.5]);
    e4.st.gold = 100;
    var buy1 = EC.buyPackCard(e4.st);
    check('商店买卡成功：-30 金、卡包 +1', buy1.ok && e4.st.gold === 70 && e4.st.pack.length === 49);
    e4.st.gold = 10;
    var buy2 = EC.buyPackCard(e4.st);
    check('金币不足买卡失败', !buy2.ok && e4.st.gold === 10 && e4.st.pack.length === 49);

    // 商店：军粮补给
    var e5 = setupEconomy([0.5]);
    e5.st.gold = 100; e5.st.rations = 5;
    check('军粮满时不可补给', !EC.buyRation(e5.st).ok);
    e5.st.rations = 4;
    var buyR = EC.buyRation(e5.st);
    check('军粮补给 +1、-15 金（4→5）', buyR.ok && e5.st.rations === 5 && e5.st.gold === 85);

    // 招募所
    var e6 = setupEconomy([0.5]);
    e6.st.gold = 100;
    var rec1 = EC.recruitHero(e6.st, 'gs1');
    check('招募偏将成功：-20 金、卡包 +1', rec1.ok && e6.st.gold === 80 && e6.st.pack.length === 49);
    check('不可招募主将自己', !EC.recruitHero(e6.st, 'dw1').ok);

    // 军粮消耗（进战斗门槛）
    check('军粮 0 时不可进战斗', (function () {
      var s = setupEconomy([0.5]).st;
      s.rations = 0;
      return !EC.canEnterBattle(s);
    })());
    check('进战斗消耗 1 军粮', (function () {
      var s = setupEconomy([0.5]).st;
      s.rations = 3;
      return EC.canEnterBattle(s) && EC.enterBattle(s) && s.rations === 2;
    })());

    /* ============ 汇总 ============ */
    details = assert.slice();
    assert = [];
    return {
      pass: fail === 0,
      total: ok + fail,
      ok: ok,
      fail: fail,
      details: details
    };
  }

  g.DSH_Selftest = { run: run };
})(typeof window !== 'undefined' ? window : globalThis);
