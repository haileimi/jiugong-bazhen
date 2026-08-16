/**
 * clickController.js — 点击出牌（v3：点手牌 → 放大 20%+轻摆 → 点怪物攻击）
 *
 * 单体指向卡：点手牌选中（放大 20% + 轻微摆动动画，敌方卡金边提示），再点目标怪物打出。
 * 全体 / 自身卡：点手牌直接打出。
 * 点击空白处取消选中；已行动的卡 / 天机不足不可出。
 * 不使用拖动（原 dragController 已废弃）。
 */
(function (g) {
  'use strict';

  var selectedUid = null;
  var onPlayRef = null;
  var bound = false;

  function select(uid) {
    clearSelection();
    selectedUid = uid;
    var card = document.querySelector('.hand-card[data-uid="' + uid + '"]');
    if (card) {
      card.classList.add('selected');
      // 滚动手牌区让被选中的卡可见（横向滑动的手牌）
      if (typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
    // 选中单体卡时，可攻击的敌方金边提示
    document.querySelectorAll('.enemy-card.targetable').forEach(function (c) {
      c.classList.add('aiming');
    });
  }

  function clearSelection() {
    selectedUid = null;
    document.querySelectorAll('.hand-card.selected').forEach(function (c) {
      c.classList.remove('selected');
    });
    document.querySelectorAll('.enemy-card.aiming').forEach(function (c) {
      c.classList.remove('aiming');
    });
  }

  function canPlay(state) {
    if (state.phase !== 'player' || state.over) return false;
    return true;
  }

  function bind(state, events, onPlay) {
    if (bound) return;
    bound = true;
    onPlayRef = onPlay;

    document.addEventListener('click', function (ev) {
      if (!canPlay(state)) return;

      // 1. 点击手牌
      var handCard = ev.target.closest('.hand-card');
      if (handCard) {
        var uid = handCard.dataset.uid;
        if (state.usedThisTurn[uid]) {
          g.DSH_PopupRenderer.showMessage('提示', '这张牌本回合已使用过');
          return;
        }
        if (state.tianji <= 0 && !state.freeChase[uid]) {
          g.DSH_PopupRenderer.showMessage('提示', '天机不足，本回合无法再出牌');
          return;
        }
        var target = handCard.dataset.target;
        if (target === 'single') {
          if (selectedUid === uid) clearSelection();
          else select(uid);
        } else {
          // 全体 / 自身：点出即打
          clearSelection();
          onPlayRef(uid, null);
        }
        return;
      }

      // 2. 点击敌方卡（单体指向出牌）
      var enemyCard = ev.target.closest('.enemy-card');
      if (enemyCard) {
        if (selectedUid && enemyCard.classList.contains('targetable')) {
          var uid2 = selectedUid;
          clearSelection();
          onPlayRef(uid2, enemyCard.dataset.enemyId);
        }
        return;
      }

      // 3. 点击空白取消选中
      clearSelection();
    });
  }

  g.DSH_ClickController = {
    bind: bind,
    select: select,
    clearSelection: clearSelection,
    selectedUid: function () { return selectedUid; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
