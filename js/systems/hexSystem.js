/**
 * hexSystem.js — 卦象合成（下卦/上卦/64卦）
 *
 * 下卦：九宫格第 1 行前 3 格（slot 0-2）英雄的阴阳爻合成（slot0=下爻...slot2=上爻）；
 *       每回合随新阵容重算。
 * 上卦：开局从 3 个随机候选八卦中三选一，一局固定。
 * 64 卦：下卦 × 上卦合成（由 hex64.js 查表），特效随下卦重算而变化。
 */
(function (g) {
  'use strict';

  /** 由桌面第 1 行（slot 0-2）合成下卦；空缺格按「阳」处理（空位不阻断成卦） */
  function composeLower(state) {
    var yao = [];
    for (var i = 0; i < 3; i++) {
      var id = state.board[i];
      var hero = id ? g.DSH_GameState.getHero(state, id) : null;
      if (hero && hero.hp > 0) yao.push(hero.yinYang === '阳' ? '阳' : '阴');
      else yao.push('阳'); // 空位计为阳（填位不空卦）
    }
    return g.DSH_TRIGRAMS.composeLower(yao[0], yao[1], yao[2]);
  }

  /** 开局生成 3 个随机候选上卦（不重复） */
  function pickCandidates(state) {
    var pool = g.DSH_TRIGRAMS.TRIGRAMS.slice();
    // Fisher-Yates
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(state.rnd() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, 3).map(function (t) {
      return { id: t.id, name: t.name, symbol: t.symbol, desc: t.desc, rules: t.rules };
    });
  }

  /** 选定上卦后：计算下卦与当前 64 卦 */
  function resolveHexagram(state) {
    var lower = composeLower(state);
    state.lowerTrigram = lower ? lower.id : 'qian';
    var hex = g.DSH_HEX64.byPair(state.upperTrigram, state.lowerTrigram);
    state.currentHexagram = hex;
    return hex;
  }

  g.DSH_HexSystem = {
    composeLower: composeLower,
    pickCandidates: pickCandidates,
    resolveHexagram: resolveHexagram
  };
})(typeof window !== 'undefined' ? window : globalThis);
