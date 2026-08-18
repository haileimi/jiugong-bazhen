/**
 * hexSystem.js — 卦象（v3：每场战斗重新算，按回合解锁）
 *
 * 节奏：第 3 回合抽下卦 → 第 5 回合抽上卦 → 第 7 回合合成 64 卦（天命技能生效）。
 * 每场战斗开始全部清空，重新走一遍 3/5/7 节奏。
 * 上/下卦均为随机抽取（不再由布阵合成，不再开局三选一）。
 */
(function (g) {
  'use strict';

  /** 随机抽一卦 */
  function drawRandomTrigram(state) {
    var pool = g.DSH_TRIGRAMS.TRIGRAMS;
    return pool[Math.floor(state.rnd() * pool.length)].id;
  }

  /** 第 3 回合：抽下卦 */
  function drawLower(state) {
    if (state.lowerTrigram) return state.lowerTrigram;
    state.lowerTrigram = drawRandomTrigram(state);
    g.DSH_GameState.pushLog(state, '☯ 天机垂象：抽得下卦『' +
      g.DSH_TRIGRAMS.byId(state.lowerTrigram).name + '』（' +
      g.DSH_TRIGRAMS.byId(state.lowerTrigram).symbol + '）');
    return state.lowerTrigram;
  }

  /** 第 5 回合：抽上卦 */
  function drawUpper(state) {
    if (state.upperTrigram) return state.upperTrigram;
    state.upperTrigram = drawRandomTrigram(state);
    g.DSH_GameState.pushLog(state, '☯ 天机垂象：抽得上卦『' +
      g.DSH_TRIGRAMS.byId(state.upperTrigram).name + '』（' +
      g.DSH_TRIGRAMS.byId(state.upperTrigram).symbol + '）');
    return state.upperTrigram;
  }

  /** 第 7 回合：合成 64 卦（天命技能） */
  function resolveHexagram(state) {
    if (!state.upperTrigram || !state.lowerTrigram) return null;
    var hex = g.DSH_HEX64.byPair(state.upperTrigram, state.lowerTrigram);
    state.currentHexagram = hex;
    return hex;
  }

  /** 当前卦象节奏文案（UI 用） */
  function hexProgressText(state) {
    if (state.currentHexagram) {
      return '『' + state.currentHexagram.name + '』天命技能已生效';
    }
    if (state.turn >= 7) return '天命技能生效中';
    var parts = [];
    parts.push('下卦' + (state.lowerTrigram ? '✓' : '（第3回合）'));
    parts.push('上卦' + (state.upperTrigram ? '✓' : '（第5回合）'));
    parts.push('天命（第7回合）');
    return parts.join(' · ');
  }

  /** 随机抽 3 个候选卦（三选一用，不重复） */
  function pickCandidates(state) {
    var pool = g.DSH_TRIGRAMS.TRIGRAMS.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(state.rnd() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, 3).map(function (t) {
      return { id: t.id, name: t.name, symbol: t.symbol, desc: t.desc, rules: t.rules };
    });
  }

  g.DSH_HexSystem = {
    drawLower: drawLower,
    drawUpper: drawUpper,
    resolveHexagram: resolveHexagram,
    hexProgressText: hexProgressText,
    pickCandidates: pickCandidates
  };
})(typeof window !== 'undefined' ? window : globalThis);
