/**
 * dragController.js — 拖动英雄卡攻击指定目标
 *
 * 按住英雄卡拖到目标魔将卡（或魔将全灭后的魔王本体卡）上松开即攻击；
 * 拖动悬停目标卡金色高亮；支持鼠标与触屏（Pointer Events）。
 * 注意：不使用 setPointerCapture，move/up 挂在 document 上，
 * 避免捕获重定向导致 grid 收不到事件。
 */
(function (g) {
  'use strict';

  var dragging = null; // { el, slot, heroId, ghost, offsetX, offsetY }

  function findEnemyUnder(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('enemy-card')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function clearHighlights() {
    document.querySelectorAll('.enemy-card.target-hover').forEach(function (c) {
      c.classList.remove('target-hover');
    });
  }

  function cleanup() {
    if (dragging) {
      if (dragging.ghost) dragging.ghost.remove();
      dragging.el.classList.remove('dragging-source');
    }
    clearHighlights();
    dragging = null;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
  }

  var onAttackRef = null;

  function onMove(ev) {
    if (!dragging) return;
    ev.preventDefault();
    if (dragging.ghost) {
      dragging.ghost.style.left = (ev.clientX - dragging.offsetX) + 'px';
      dragging.ghost.style.top = (ev.clientY - dragging.offsetY) + 'px';
    }
    clearHighlights();
    var target = findEnemyUnder(ev.clientX, ev.clientY);
    if (target && target.classList.contains('targetable')) target.classList.add('target-hover');
  }

  function onUp(ev) {
    if (!dragging) return;
    var target = findEnemyUnder(ev.clientX, ev.clientY);
    var slot = dragging.slot;
    cleanup();
    if (target && target.classList.contains('targetable') && onAttackRef) {
      onAttackRef(slot, target.dataset.enemyId);
    }
  }

  /** 绑定九宫格拖动 */
  function bindGrid(state, events, onAttack) {
    onAttackRef = onAttack;
    var grid = document.getElementById('grid');
    if (!grid) return;

    grid.addEventListener('pointerdown', function (ev) {
      if (state.phase !== 'player' || state.over) return;
      var card = ev.target.closest('.hero-card');
      if (!card || card.classList.contains('dead') || card.classList.contains('acted')) return;
      if (state.tianji <= 0) return;

      ev.preventDefault();
      dragging = {
        el: card,
        slot: Number(card.dataset.slot),
        heroId: card.dataset.heroId,
        offsetX: ev.clientX - card.getBoundingClientRect().left,
        offsetY: ev.clientY - card.getBoundingClientRect().top
      };
      card.classList.add('dragging-source');

      // 幽灵跟随
      var ghost = card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.left = (ev.clientX - dragging.offsetX) + 'px';
      ghost.style.top = (ev.clientY - dragging.offsetY) + 'px';
      document.body.appendChild(ghost);
      dragging.ghost = ghost;

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  g.DSH_DragController = {
    bindGrid: bindGrid
  };
})(typeof window !== 'undefined' ? window : globalThis);
