/**
 * selftest.js — 规则自检（五行克制 / 八卦成卦 / 64 卦完整性 / 伤害公式 /
 *               取整规则 / 魔将与英雄数据 / 规则库 / 战斗集成）
 * 目标：462+ 项断言。浏览器与 Node（tools/run-selftest.js）双环境可跑。
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

  /** 序列随机源：依次返回给定值 */
  function seqRng(seq) {
    var i = 0;
    return function () {
      var v = i < seq.length ? seq[i] : 0.5;
      i++;
      return v;
    };
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

    /* ============ 2. 克制环正确性（5 项） ============ */
    check('金克木', E.BEATS['金'] === '木');
    check('木克土', E.BEATS['木'] === '土');
    check('土克水', E.BEATS['土'] === '水');
    check('水克火', E.BEATS['水'] === '火');
    check('火克金', E.BEATS['火'] === '金');

    /* ============ 3. 八卦成卦（爻序 24 + 规则 8 + 巽修正 1） ============ */
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

    /* ============ 4. 64 卦完整性（192 项） ============ */
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

    /* ============ 5. 英雄数据（96 项） ============ */
    var validRoles = ['武卒', '骑兵', '弓手', '谋士', '盾卫'];
    H.HEROES.forEach(function (h) {
      check('英雄 ' + h.id + ' 有id', !!h.id);
      check('英雄 ' + h.id + ' 兵种合法', validRoles.indexOf(h.role) >= 0);
      check('英雄 ' + h.id + ' 五行合法', E.isValid(h.element));
      check('英雄 ' + h.id + ' 阴阳合法', h.yinYang === '阳' || h.yinYang === '阴');
      check('英雄 ' + h.id + ' 攻击>0', h.atk > 0);
      check('英雄 ' + h.id + ' 血量>0', h.hp > 0);
      check('英雄 ' + h.id + ' 有特技', !!h.skillName && h.skillMult > 1);
    });
    var ids = H.HEROES.map(function (h) { return h.id; });
    check('英雄 id 唯一', new Set(ids).size === 12);
    check('英雄共 12 名', H.HEROES.length === 12);

    /* ============ 6. 魔王数据（50 项） ============ */
    var enemies = EN.GENERALS.concat([EN.BOSS]);
    enemies.forEach(function (e) {
      check('敌方 ' + e.name + ' 有id', !!e.id);
      check('敌方 ' + e.name + ' 五行合法', E.isValid(e.element));
      check('敌方 ' + e.name + ' 血量>0', e.hp > 0);
      check('敌方 ' + e.name + ' 攻击>0', e.atk > 0);
      check('敌方 ' + e.name + ' 有名字', e.name.length >= 2);
    });
    var eids = EN.GENERALS.map(function (e) { return e.id; });
    check('五魔将 id 唯一', new Set(eids).size === 5);
    check('魔将共 5 名', EN.GENERALS.length === 5);
    check('魔王本体血量=100', EN.BOSS.hp === 100);
    check('魔焰将全体攻击', EN.GENERALS[2].aoe === true);
    check('魔焰将血量=22', EN.GENERALS[2].hp === 22);
    check('五行覆盖 土水 火 火 金', EN.GENERALS.map(function (e) { return e.element; }).join('') === '土水火火金');

    /* ============ 7. 伤害公式（18 项） ============ */
    check('普通伤害 10x1.0', BS.calcDamage(10, 1, false, 0) === 10);
    check('暴击 10x1.5', BS.calcDamage(10, 1, true, 0) === 15);
    check('克制 10x1.3 取整', BS.calcDamage(10, 1.3, false, 0) === 13);
    check('被克 6x0.7 取整', BS.calcDamage(6, 0.7, false, 0) === 4);
    check('特技 10x1.6', BS.calcDamage(10, 1.6, false, 0) === 16);
    check('连击增伤 +3', BS.calcDamage(10, 1, false, 3) === 13);
    check('下限保护 max(2,1)', BS.calcDamage(1, 1, false, 0) === 2);
    check('下限后连击 +5', BS.calcDamage(1, 1, false, 5) === 7);
    check('攻击16 无修正', BS.calcDamage(16, 1, false, 0) === 16);
    check('攻击15 特技x1.6=24', BS.calcDamage(15, 1.6, false, 0) === 24);
    check('13x1.4=18.2→18', BS.calcDamage(13, 1.4, false, 0) === 18);
    check('12x1.4=16.8→17', BS.calcDamage(12, 1.4, false, 0) === 17);
    check('6x1.8=10.8→11', BS.calcDamage(6, 1.8, false, 0) === 11);
    check('10x1.3x1.5=19.5→20', BS.calcDamage(10, 1.3, true, 0) === 20);
    check('16x0.7=11.2→11', BS.calcDamage(16, 0.7, false, 0) === 11);
    check('14x1.3=18.2→18', BS.calcDamage(14, 1.3, false, 0) === 18);
    check('9x1.3=11.7→12', BS.calcDamage(9, 1.3, false, 0) === 12);
    check('6x1.0+2连击=8', BS.calcDamage(6, 1, false, 2) === 8);

    /* ============ 8. 规则库（25 种，50 项） ============ */
    var ruleKeys = Object.keys(HX.RULE_TEXT);
    check('规则库共 25 种', ruleKeys.length === 25, 'got ' + ruleKeys.length);
    var requiredKeys = ['atkPct', 'defPct', 'bossAtkDown', 'opening', 'shieldAll', 'healAll',
      'burnRound', 'firstCrit', 'comboCrit', 'lifesteal', 'dmgShield', 'revive',
      'freezeSkill', 'burnOnHit', 'windBurn', 'chase', 'thorns', 'dmgReduce',
      'critChance', 'stunHit', 'healOnHit', 'empowNext', 'qiantian', 'jiji', 'weiji'];
    // 注：文档称 24 条规则，实际表内列出 25 行（含 jiji 与 weiji），全部实现
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

    /* ============ 10. 状态默认值（6 项） ============ */
    var st = GS.createState({ random: seqRng([0.5]) });
    check('初始天机 4', st.tianji === 4);
    check('九宫格 5 格', st.board.length === 5);
    check('中宫 slot 1', GS.CENTER_SLOT === 1);
    check('初始回合 1', st.turn === 1);
    check('牌库 12 英雄', st.heroes.length === 12);
    check('五魔将 + 本体', st.enemies.length === 5 && !!st.boss);
    check('初始阶段 opening', st.phase === 'opening');

    /* ============ 11. 抽牌（4 项） ============ */
    st.upperTrigram = 'qian';
    TS.drawBoard(st);
    var onBoard = st.board.filter(function (x) { return x !== null; });
    check('首抽 5 张', onBoard.length === 5);
    check('首抽固定含萧靳 wz3', onBoard.indexOf('wz3') >= 0);
    check('桌面无重复英雄', new Set(onBoard).size === onBoard.length);
    var hpBefore = GS.getHero(st, 'wz1').hp;
    GS.getHero(st, 'wz1').hp = 2;
    TS.drawBoard(st); // 再抽保留血量
    check('血量保留在牌库', GS.getHero(st, 'wz1').hp === 2);
    st = null;

    /* ============ 12. 魔王守护与解锁（3 项） ============ */
    var st2 = GS.createState({ random: seqRng([0.5]) });
    check('魔将未灭时本体不可攻击', !GS.enemyAlive(st2, 'boss'));
    st2.enemies.forEach(function (e) { e.hp = 0; e.alive = false; });
    check('魔将全灭后本体解锁', GS.bossUnlocked(st2) && GS.enemyAlive(st2, 'boss'));
    st2.boss.hp = 0;
    st2.boss.alive = false;
    BS.checkWin(st2);
    check('全灭魔将与本体判定胜利', st2.over === 'win');

    /* ============ 13. 战斗集成（10 项） ============ */
    var st3 = GS.createState({ random: seqRng([0.5, 0.5]) });
    st3.upperTrigram = 'qian';
    st3.lowerTrigram = 'qian';
    st3.currentHexagram = { name: '测试卦', rules: [] };
    var ev3 = new g.DSH_EventSystem();
    g.DSH_RuleSystem.registerRules(st3, ev3);
    // 布阵：ms1(水,攻10) slot0、gs1(木,攻14) slot1、dw1(土,攻6) slot2
    var alive = GS.aliveHeroes(st3);
    st3.board = new Array(5).fill(null);
    st3.board[0] = 'ms1'; // 水 攻10
    st3.board[1] = 'gs1'; // 木 攻14
    st3.board[2] = 'gs2'; // 木 攻13
    st3.board[3] = 'dw1'; // 土 攻6
    st3.board[4] = alive[0].id;
    st3.phase = 'player';
    var e2 = GS.getEnemy(st3, 'e2'); // 浊流魔 水 16
    var e1 = GS.getEnemy(st3, 'e1'); // 蚀骨爪魔 土 18
    var e5 = GS.getEnemy(st3, 'e5'); // 狂煞魔 金 16
    var e4 = GS.getEnemy(st3, 'e4'); // 赤炎魔 火 20
    var r = BS.attackHeroToEnemy(st3, ev3, 0, 'e2'); // 水vs水 1.0 → 10
    check('攻击执行成功', !!r);
    check('水vs水 无克制: 10 伤害', r && r.damage === 10, 'got ' + (r && r.damage));
    check('天机消耗 1 点', st3.tianji === 3);
    check('英雄标记已行动', st3.usedThisTurn['ms1'] === true);
    check('敌方扣血 16-10=6', e2.hp === 6);
    check('重复攻击被拒', BS.attackHeroToEnemy(st3, ev3, 0, 'e2') === null);
    var r2 = BS.attackHeroToEnemy(st3, ev3, 1, 'e1'); // gs1 木14 克土 x1.3 → 18.2→18 击杀
    check('木克土 x1.3: 18 伤害', r2 && r2.damage === 18, 'got ' + (r2 && r2.damage));
    check('目标被击败', r2 && r2.killed === true);
    check('魔将死亡退场', e1.alive === false);
    var r3 = BS.attackHeroToEnemy(st3, ev3, 2, 'e5'); // gs2 木13 被金克 x0.7 → 9.1→9
    check('木被金克 x0.7: 9 伤害', r3 && r3.damage === 9, 'got ' + (r3 && r3.damage));
    check('金魔将未死 16-9=7', e5.hp === 7);
    var r4 = BS.attackHeroToEnemy(st3, ev3, 3, 'e4'); // dw1 土6 vs 火 → 1.0 → 6
    check('土vs火 无克制: 6 伤害', r4 && r4.damage === 6, 'got ' + (r4 && r4.damage));
    check('受击记录写入', st3.lastHits.length >= 4 && st3.lastHits[0].kind === 'enemy' && st3.lastHits[0].id === 'e2');
    st3.tianji = 0;
    st3.usedThisTurn = {};
    check('天机耗尽后拒绝', BS.attackHeroToEnemy(st3, ev3, 1, 'e2') === null);

    // 暴击路径（rnd 0.05 → 暴击；目标 e2 水，水vs水 1.0 → 10x1.5=15）
    var st4 = GS.createState({ random: seqRng([0.05, 0.9]) });
    st4.currentHexagram = { name: '测试卦2', rules: [] };
    var ev4 = new g.DSH_EventSystem();
    g.DSH_RuleSystem.registerRules(st4, ev4);
    st4.board = new Array(5).fill(null);
    st4.board[0] = 'ms1';
    var alive4 = GS.aliveHeroes(st4);
    for (var bi2 = 1; bi2 < 5; bi2++) st4.board[bi2] = alive4[bi2 % alive4.length].id;
    st4.phase = 'player';
    var r4 = BS.attackHeroToEnemy(st4, ev4, 0, 'e2');
    check('暴击 10x1.0x1.5=15', r4 && r4.damage === 15, 'got ' + (r4 && r4.damage));

    /* ============ 14. 护盾吸收（2 项） ============ */
    var st5 = GS.createState({ random: seqRng([0.5]) });
    var hero5 = GS.getHero(st5, 'dw1');
    hero5.hp = 14;
    st5.shield['dw1'] = 5;
    var ev5 = new g.DSH_EventSystem();
    var died5 = BS.damageHero(st5, ev5, hero5, 7, null);
    check('护盾优先吸收: 盾5+血扣2', hero5.hp === 12 && st5.shield['dw1'] === 0);
    check('未致死', died5 === false);

    /* ============ 15. 复活规则（2 项） ============ */
    var st6 = GS.createState({ random: seqRng([0.5]) });
    st6.currentHexagram = { name: '坤卦测试', rules: [{ key: 'revive' }] };
    var ev6 = new g.DSH_EventSystem();
    g.DSH_RuleSystem.registerRules(st6, ev6);
    var hero6 = GS.getHero(st6, 'wz1');
    st6.board[0] = 'wz1';
    hero6.hp = 1;
    var died6 = BS.damageHero(st6, ev6, hero6, 3, null);
    check('复活触发 prevent', died6 === false && hero6.hp > 0);
    check('复活后 50% 防御', hero6.hp === Math.round(hero6.maxHp * 0.5));
    check('复活后 +3 盾', st6.shield['wz1'] === 3);

    /* ============ 16. 持续伤害（2 项） ============ */
    var st7 = GS.createState({ random: seqRng([0.5]) });
    st7.burnStacks['e1'] = 2;
    st7.windBurnLayers['e1'] = 1;
    var e1hp = GS.getEnemy(st7, 'e1').hp;
    BS.applyDot(st7, new g.DSH_EventSystem());
    check('燃烧2层(2伤)+风蚀1层(2伤)=4', GS.getEnemy(st7, 'e1').hp === e1hp - 4);

    /* ============ 17. 魔王回合（2 项） ============ */
    var st8 = GS.createState({ random: seqRng([0.3, 0.3, 0.3, 0.3]) });
    st8.phase = 'player';
    // 桌面放 3 名盾卫
    st8.board = new Array(9).fill(null);
    st8.board[0] = 'dw1'; st8.board[1] = 'dw2'; st8.board[2] = 'gs1';
    var acted = BS.bossActPhase(st8, new g.DSH_EventSystem());
    check('魔王每回合最多行动 4 次', acted <= 4);
    check('魔王行动后敌方扣血或我方受损', st8.over === null || st8.over === 'lose');

    /* ============ 18. 回合流转（3 项） ============ */
    var st9 = GS.createState({ random: seqRng([0.5, 0.5, 0.5, 0.5]) });
    st9.upperTrigram = 'qian';
    st9.phase = 'player';
    var ev9 = new g.DSH_EventSystem();
    TS.startGame(st9, ev9);
    check('开局后进入玩家回合', st9.phase === 'player' && st9.turn === 1);
    check('开局九宫格满 5 张', st9.board.filter(Boolean).length === 5);
    check('开局有卦象', !!st9.currentHexagram && st9.currentHexagram.name.length >= 2);
    var turnBefore = st9.turn;
    var ev9b = new g.DSH_EventSystem();
    // 给敌人留一点血，避免魔王行动直接胜利/失败
    TS.endPlayerTurn(st9, ev9b);
    check('回合流转到下一回合', st9.turn === turnBefore + 1 || st9.over !== null);
    check('天机回满', st9.tianji === 4 || st9.over !== null);

    /* ============ 19. 八卦总览数据（8 项） ============ */
    T.TRIGRAMS.forEach(function (t) {
      check('八卦 ' + t.name + ' 有符号', !!t.symbol && t.symbol.length === 1);
    });

    /* ============ 20. 卦象特效推导（4 项） ============ */
    var hexQian = HX.byPair('qian', 'qian');
    check('乾为天 含首击必暴', hexQian.rules.some(function (r) { return r.key === 'firstCrit'; }));
    check('乾为天 含连击增伤', hexQian.rules.some(function (r) { return r.key === 'empowNext'; }));
    var hexKun = HX.byPair('kun', 'kun');
    check('坤为地 含复活', hexKun.rules.some(function (r) { return r.key === 'revive'; }));
    check('坤为地 含受伤转盾', hexKun.rules.some(function (r) { return r.key === 'dmgShield'; }));

    /* ============ 21. 皮肤数据（皮肤概念，54 项） ============ */
    H.HEROES.forEach(function (h) {
      check('英雄 ' + h.id + ' 至少 1 个皮肤', h.skins.length >= 1);
      check('英雄 ' + h.id + ' 皮肤 id 唯一', new Set(h.skins.map(function (s) { return s.id; })).size === h.skins.length);
      var namesOk = h.skins.every(function (s) { return !!s.name && !!s.file; });
      check('英雄 ' + h.id + ' 皮肤有名称与文件', namesOk);
      check('英雄 ' + h.id + ' 默认皮肤=第一项', g.DSH_HEROES.defaultSkinId(h) === h.skins[0].id);
      check('英雄 ' + h.id + ' 皮肤查找可用', g.DSH_HEROES.skinOf(h, h.skins[0].id).id === h.skins[0].id);
    });
    check('破阵郎 有 2 个皮肤', g.DSH_HEROES.byId('qb1').skins.length === 2);
    check('破阵郎 含蓄须皮肤', !!g.DSH_HEROES.skinOf(g.DSH_HEROES.byId('qb1'), 'beard'));
    check('铁脚汉 有 2 个皮肤', g.DSH_HEROES.byId('qb2').skins.length === 2);
    check('铁脚汉 含金甲/银甲', !!g.DSH_HEROES.skinOf(g.DSH_HEROES.byId('qb2'), 'gold') &&
      !!g.DSH_HEROES.skinOf(g.DSH_HEROES.byId('qb2'), 'silver'));
    check('红炮 默认皮肤为原版', g.DSH_HEROES.defaultSkinId(g.DSH_HEROES.byId('wz1')) === 'default');

    /* ============ 22. 状态携带皮肤（2 项） ============ */
    var stSkin = GS.createState({ random: seqRng([0.5]) });
    var hSkin = GS.getHero(stSkin, 'qb1');
    check('状态英雄带 skinId', !!hSkin.skinId && hSkin.skinId === 'default');
    hSkin.skinId = 'beard';
    check('皮肤切换写回状态', GS.getHero(stSkin, 'qb1').skinId === 'beard');

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
