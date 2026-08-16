/**
 * popupRenderer.js — 弹窗（开局抽上卦 / 结算 / 通用消息）
 */
(function (g) {
  'use strict';

  var root = null;
  function getRoot() {
    if (!root) root = document.getElementById('modal-root');
    return root;
  }

  function clear() {
    var r = getRoot();
    if (r) r.innerHTML = '';
  }

  /**
   * 开局抽上卦：3 个候选八卦三选一。
   * @param {Array} candidates [{id,name,symbol,desc,rules}]
   * @param {function} onChoose 选中回调(id)
   */
  function showOpening(candidates, onChoose) {
    clear();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var box = document.createElement('div');
    box.className = 'modal opening-modal';
    box.innerHTML = '<h2>天命起卦</h2><p class="modal-sub">天机垂象，请三选一，定本局上卦（一局固定）</p>';

    var row = document.createElement('div');
    row.className = 'trigram-choices';
    candidates.forEach(function (c) {
      var card = document.createElement('button');
      card.className = 'trigram-choice';
      card.innerHTML = '<div class="trigram-symbol">' + c.symbol + '</div>' +
        '<div class="trigram-name">' + c.name + '</div>' +
        '<div class="trigram-desc">' + c.desc + '</div>';
      card.addEventListener('click', function () {
        clear();               // 选中后立即关闭选卦弹窗，露出战场
        onChoose(c.id);
      });
      row.appendChild(card);
    });
    box.appendChild(row);
    overlay.appendChild(box);
    getRoot().appendChild(overlay);
  }

  /** 结算弹窗 */
  function showResult(state, onRestart) {
    clear();
    var win = state.over === 'win';
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var box = document.createElement('div');
    box.className = 'modal result-modal ' + (win ? 'win' : 'lose');
    box.innerHTML = '<h2>' + (win ? '🏆 天命已定，胜利！' : '💀 败局已定……') + '</h2>' +
      '<p>' + (win ? '五魔将与混沌·六爻魔尽数伏诛，九州重归太平。' : '十二英雄尽数战死，九州陷落魔爪。') + '</p>' +
      '<p class="modal-sub">共战斗 ' + state.turn + ' 回合</p>';
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '再战一局';
    btn.addEventListener('click', function () { clear(); onRestart(); });
    box.appendChild(btn);
    overlay.appendChild(box);
    getRoot().appendChild(overlay);
  }

  /** 通用消息弹窗 */
  function showMessage(title, text, onClose) {
    clear();
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = '<h2>' + title + '</h2><p>' + (text || '') + '</p>';
    var btn = document.createElement('button');
    btn.className = 'primary-btn';
    btn.textContent = '确定';
    btn.addEventListener('click', function () {
      clear();
      if (onClose) onClose();
    });
    box.appendChild(btn);
    overlay.appendChild(box);
    getRoot().appendChild(overlay);
  }

  g.DSH_PopupRenderer = {
    showOpening: showOpening,
    showResult: showResult,
    showMessage: showMessage,
    clear: clear
  };
})(typeof window !== 'undefined' ? window : globalThis);
