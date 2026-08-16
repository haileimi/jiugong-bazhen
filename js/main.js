/**
 * main.js — 入口与流程控制（开局/重抽/重算卦象/调试面板）
 *
 * 流程：DOM 就绪 → 渲染骨架 → 开局抽上卦（三选一）→ startGame → 玩家回合
 * 拖动攻击 / 回合完毕 → 魔王行动 → 回合结算 → 下一回合
 */
(function (g) {
  'use strict';

  var state = null;
  var events = null;
  var currentTab = '战斗日志';

  function renderDebugTab() {
    var content = document.getElementById('debug-content');
    if (!content) return;
    content.innerHTML = '';
    content.appendChild(g.DSH_BattleRenderer.debugContent(currentTab, state));
  }

  function bindUI() {
    // 回合完毕
    var endBtn = document.getElementById('end-turn-btn');
    if (endBtn && !endBtn.dataset.bound) {
      endBtn.dataset.bound = '1';
      endBtn.addEventListener('click', function () {
        if (!state || state.phase !== 'player' || state.over) return;
        endBtn.disabled = true;
        g.DSH_TurnSystem.endPlayerTurn(state, events);
        g.DSH_BattleRenderer.renderAll(state);
        g.DSH_BattleRenderer.applyHitFlashes(state); // 被攻击的英雄标红抖动
        endBtn.disabled = false;
        if (state.over) g.DSH_PopupRenderer.showResult(state, restart);
        else {
          g.DSH_BattleRenderer.renderEnemyTargets(state);
          renderDebugTab();
        }
      });
    }

    // 调试面板 Tab
    var bar = document.getElementById('debug-tabs');
    if (bar && !bar.dataset.bound) {
      bar.dataset.bound = '1';
      bar.addEventListener('click', function (ev) {
        var btn = ev.target.closest('.debug-tab');
        if (!btn) return;
        currentTab = btn.dataset.tab;
        g.DSH_BattleRenderer.renderTabs(currentTab);
        renderDebugTab();
      });
    }

    // 拖动攻击
    g.DSH_DragController.bindGrid(state, events, function (slot, enemyId) {
      var r = g.DSH_BattleSystem.attackHeroToEnemy(state, events, slot, enemyId);
      g.DSH_BattleRenderer.renderAll(state);
      g.DSH_BattleRenderer.applyHitFlashes(state); // 被攻击的魔将标红抖动
      g.DSH_BattleRenderer.renderEnemyTargets(state);
      renderDebugTab();
      if (state.over) g.DSH_PopupRenderer.showResult(state, restart);
      return r;
    });
  }

  function init() {
    events = new g.DSH_EventSystem();
    state = g.DSH_GameState.createState();
    g.DSH_CardRenderer.resetHpBars(); // 新开一局：重置血条动画缓存
    g.DSH_BattleRenderer.renderTabs(currentTab);
    g.DSH_BattleRenderer.renderAll(state);
    renderDebugTab();

    // 开局：抽上卦三选一
    var candidates = g.DSH_HexSystem.pickCandidates(state);
    g.DSH_PopupRenderer.showOpening(candidates, function (id) {
      g.DSH_PopupRenderer.clear(); // 保险：确保弹窗关闭
      state.upperTrigram = id;
      g.DSH_TurnSystem.startGame(state, events);
      g.DSH_BattleRenderer.renderAll(state);
      g.DSH_BattleRenderer.renderEnemyTargets(state);
      renderDebugTab();
      bindUI();
    });
  }

  function restart() {
    g.DSH_PopupRenderer.clear();
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
