/**
 * saveSystem.js — 本地存档（v3）
 *
 * 存档内容：层数 / 地图节点进度 / 主将（血量+防御）/ 卡包 / 层 buff / 马蹄金 / 军粮。
 * 战斗进行中不存档（「保存并退出」在地图页触发）。
 * 军粮每日 5 点，跨天自动重置。
 */
(function (g) {
  'use strict';

  var SAVE_KEY = 'jgbz_save_v3';
  var RATIONS_KEY = 'jgbz_rations_v3';

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** 序列化本局可存档部分 */
  function serialize(state) {
    return {
      v: 3,
      layer: state.layer,
      mapNodes: state.mapNodes,
      commander: state.commander,
      pack: state.pack,
      runBuffs: state.runBuffs,
      gold: state.gold,
      rations: state.rations,
      bestLayer: state.bestLayer
    };
  }

  function save(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(state)));
      // 军粮日期同步（保证每日 5 点）
      localStorage.setItem(RATIONS_KEY, JSON.stringify({ date: today(), value: state.rations }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 读取存档；无存档返回 null */
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== 3 || !d.commander || !d.pack) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  function hasSave() { return !!load(); }

  function clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  }

  /** 今日军粮：非今日则重置为 5 */
  function rationsToday() {
    try {
      var raw = localStorage.getItem(RATIONS_KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d.date === today()) return d.value;
      }
    } catch (e) { /* 忽略 */ }
    return 5;
  }

  /** 写入军粮（含日期） */
  function setRations(value) {
    try {
      localStorage.setItem(RATIONS_KEY, JSON.stringify({ date: today(), value: value }));
    } catch (e) { /* 忽略 */ }
  }

  g.DSH_SaveSystem = {
    serialize: serialize,
    save: save,
    load: load,
    hasSave: hasSave,
    clear: clear,
    rationsToday: rationsToday,
    setRations: setRations,
    today: today
  };
})(typeof window !== 'undefined' ? window : globalThis);
