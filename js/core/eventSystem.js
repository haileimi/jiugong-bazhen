/**
 * eventSystem.js — 事件订阅/触发（卦象规则引擎的事件总线）
 * 事件：battleStart / turnStart / beforeAttack / afterAttack /
 *       takeDamage / death / bossAct
 */
(function (g) {
  'use strict';

  function EventSystem() {
    this._map = {};
  }

  EventSystem.prototype.on = function (type, fn) {
    if (!this._map[type]) this._map[type] = [];
    this._map[type].push(fn);
    return this;
  };

  EventSystem.prototype.off = function (type, fn) {
    var list = this._map[type];
    if (!list) return this;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
    return this;
  };

  /** 移除某类型全部监听（每回合重算卦象时清空规则） */
  EventSystem.prototype.clear = function (type) {
    if (type === undefined) this._map = {};
    else delete this._map[type];
    return this;
  };

  EventSystem.prototype.emit = function (type, payload) {
    var list = this._map[type];
    if (!list) return;
    // 拷贝一份，避免监听器内增删影响遍历
    list.slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { /* 单条规则异常不阻断战斗 */ }
    });
  };

  g.DSH_EventSystem = EventSystem;
})(typeof window !== 'undefined' ? window : globalThis);
