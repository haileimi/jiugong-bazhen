/**
 * battleRenderer.js — 战场渲染（敌方 / 界河 / 主将 / 手牌区 / 天机）+ 调试面板（v3）
 *
 * 布局（上到下）：敌方信息行 → 敌方（魔王战：本体 + 5 魔将；小怪战：2 魔将）
 *   → 界河（回合 + 卦象节奏）→ 主将卡 → 手牌区（重叠）→ 天机行 → 回合完毕
 */
(function (g) {
  'use strict';

  var TABS = ['战斗日志', '卡包', '主将', '规则', '英雄名录', '五行克制', '八卦总览', '规则自检'];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---------------- 敌方卡 ---------------- */
  function createEnemyCard(enemy, state, isBoss) {
    var card = el('div', 'enemy-card' + (enemy.hp <= 0 ? ' dead' : '') + (isBoss ? ' boss-lg' : ''));
    card.dataset.enemyId = enemy.id;

    var nameRow = el('div', 'enemy-name');
    nameRow.appendChild(el('span', 'enemy-element', g.DSH_ELEMENTS.ICON[enemy.element]));
    nameRow.appendChild(el('span', '', enemy.name));
    if (isBoss) {
      var guard = g.DSH_GameState.bossUnlocked(state)
        ? el('span', 'boss-badge unlocked', '可攻击')
        : el('span', 'boss-badge', '守护中');
      nameRow.appendChild(guard);
    }
    card.appendChild(nameRow);

    var atkLine = el('div', 'enemy-atk', '攻 ' + g.DSH_GameState.enemyAtk(state, enemy) +
      (enemy.aoe ? ' · 全体' : '') + (state.atkDebuff[enemy.id] ? ' · 削弱-' + state.atkDebuff[enemy.id] + '%' : '') +
      ' · ' + g.DSH_ELEMENTS.ICON[enemy.element] + enemy.element);
    card.appendChild(atkLine);

    var bar = el('div', 'enemy-hpbar' + (isBoss ? ' boss-hpbar' : ''));
    var barFill = el('div', 'enemy-hpbar-fill', '');
    bar.appendChild(barFill);
    card.appendChild(bar);
    g.DSH_CardRenderer.setHpBar(barFill, enemy.id, enemy.hp, enemy.maxHp);

    card.appendChild(el('div', 'enemy-hp' + (isBoss ? ' boss-hp' : ''), enemy.hp + '/' + enemy.maxHp));

    if (isBoss) {
      var bossInfo = el('div', 'boss-info');
      bossInfo.textContent = g.DSH_GameState.bossUnlocked(state)
        ? '☠ 魔王本体已解锁，可被攻击！'
        : '⚔ 魔将未灭，本体被守护';
      card.appendChild(bossInfo);
    }

    var marks = [];
    if (state.burnStacks[enemy.id]) marks.push('🔥' + state.burnStacks[enemy.id]);
    if (state.windBurnLayers[enemy.id]) marks.push('🌪' + state.windBurnLayers[enemy.id]);
    if (state.frozenNext[enemy.id] || state.frozen[enemy.id]) marks.push('🧊');
    if (marks.length) card.appendChild(el('div', 'enemy-dot', marks.join(' ')));

    return card;
  }

  function renderEnemyRow(state) {
    var row = document.getElementById('enemy-row');
    if (!row) return;
    row.innerHTML = '';

    if (state.battleKind === 'boss') {
      var bossCard = createEnemyCard(state.boss, state, true);
      bossCard.classList.add('boss-card');
      if (g.DSH_GameState.bossUnlocked(state) && state.boss.hp > 0) {
        bossCard.classList.add('boss-unlocked');
        bossCard.classList.add('targetable');
      }
      row.appendChild(bossCard);
    }

    var grid = el('div', 'enemy-grid');
    var line1 = el('div', 'enemy-line');
    var line2 = el('div', 'enemy-line');
    state.enemies.forEach(function (e, i) {
      var c = createEnemyCard(e, state, false);
      if (g.DSH_GameState.enemyAlive(state, e.id)) c.classList.add('targetable');
      if (state.battleKind === 'boss') (i < 2 ? line1 : line2).appendChild(c);
      else line1.appendChild(c);
    });
    grid.appendChild(line1);
    grid.appendChild(line2);
    row.appendChild(grid);
  }

  function renderEnemyTargets(state) {
    document.querySelectorAll('.enemy-card').forEach(function (c) {
      var id = c.dataset.enemyId;
      c.classList.toggle('targetable', g.DSH_GameState.enemyAlive(state, id));
    });
  }

  function applyHitFlashes(state) {
    state.lastHits.forEach(function (hit) {
      var elCard = null;
      if (hit.kind === 'enemy') {
        elCard = document.querySelector('.enemy-card[data-enemy-id="' + hit.id + '"]');
      } else if (hit.kind === 'commander') {
        elCard = document.querySelector('.commander-card');
      }
      if (elCard) {
        elCard.classList.remove('hit-flash');
        void elCard.offsetWidth;
        elCard.classList.add('hit-flash');
        setTimeout(function () { elCard.classList.remove('hit-flash'); }, 600);
      }
    });
    state.lastHits = [];
  }

  /* ---------------- 界河 ---------------- */
  function renderRiver(state) {
    var turnEl = document.getElementById('river-turn');
    var hexEl = document.getElementById('river-hex');
    var hintEl = document.getElementById('river-hint');
    if (turnEl) turnEl.textContent = '第 ' + state.turn + ' 回合 · 第 ' + state.layer + ' 层' +
      (state.battleKind === 'boss' ? ' · 魔王战' : ' · 小怪战');
    if (hexEl) {
      if (state.currentHexagram) {
        var hex = state.currentHexagram;
        hexEl.innerHTML = '<b>『' + hex.name + '』</b> <span class="hex-symbol">' +
          hex.upperSymbol + hex.lowerSymbol + '</span><br><span class="hex-effect">' +
          hex.effectText + '</span>';
      } else {
        hexEl.innerHTML = '<span class="hex-effect">' + g.DSH_HexSystem.hexProgressText(state) + '</span>';
      }
    }
    if (hintEl) {
      if (state.over) hintEl.textContent = state.over === 'win' ? '🏆 战斗胜利！' : '💀 主将战死……';
      else if (state.phase === 'player') hintEl.textContent = '点手牌 → 放大摆动 → 点怪物攻击；护卫/计谋点出即打';
      else if (state.phase === 'boss') hintEl.textContent = '怪物行动中……';
    }
  }

  /* ---------------- 手牌区 / 主将 / 天机 ---------------- */
  function renderHand(state) {
    var zone = document.getElementById('hand-zone');
    if (!zone) return;
    zone.innerHTML = '';
    var sel = document.querySelector('.hand-card.selected');
    var selUid = sel ? sel.dataset.uid : null;
    var bag = el('div', 'hand-bag', '');
    state.hand.forEach(function (uid) {
      var hero = g.DSH_GameState.cardDef(state, uid);
      if (!hero) return;
      var card = g.DSH_CardRenderer.createHandCard(hero, state, uid);
      if (uid === selUid) card.classList.add('selected');
      bag.appendChild(card);
    });
    if (state.hand.length === 0) {
      bag.appendChild(el('div', 'hand-empty', '手牌已空（回合结束自动补 5 张）'));
    }
    zone.appendChild(bag);
  }

  function renderCommander(state) {
    var zone = document.getElementById('commander-zone');
    if (!zone) return;
    zone.innerHTML = '';
    var card = g.DSH_CardRenderer.createCommanderCard(state);
    if (card) zone.appendChild(card);
  }

  function renderTianji(state) {
    var t = document.getElementById('tianji-text');
    if (t) {
      var stars = '';
      for (var i = 0; i < state.maxTianji; i++) stars += i < state.tianji ? '✦' : '☆';
      t.textContent = '天机 ' + state.tianji + '/' + state.maxTianji + '  ' + stars +
        '（出牌耗 1）';
    }
  }

  function renderEnemyInfo(state) {
    var e = document.getElementById('enemy-info');
    if (!e) return;
    var left = state.enemies.filter(function (x) { return x.alive && x.hp > 0; }).length;
    var text = '敌方单位 ' + (state.enemies.length) + ' 个，存活 ' + left;
    if (state.battleKind === 'boss') {
      text += '　|　魔王：' + state.boss.name +
        (g.DSH_GameState.bossUnlocked(state) ? '　⚠ 已解锁！' : '（守护中）');
    }
    e.textContent = text;
  }

  function renderAll(state) {
    renderEnemyInfo(state);
    renderEnemyRow(state);
    renderRiver(state);
    renderCommander(state);
    renderHand(state);
    renderTianji(state);
    renderBattleData(state);
  }

  /* ---------------- 左侧战斗数据面板 ---------------- */
  function renderBattleData(state) {
    var box = document.getElementById('battle-data-content');
    if (!box) return;
    var html = '';
    var GS = g.DSH_GameState;

    html += '<div class="bd-section"><div class="bd-title">卦象节奏</div>' +
      '<div class="bd-hex">' + g.DSH_HexSystem.hexProgressText(state) + '</div></div>';

    var stars = '';
    for (var i = 0; i < state.maxTianji; i++) stars += i < state.tianji ? '✦' : '☆';
    html += '<div class="bd-section"><div class="bd-title">天命 · 天机</div>' +
      '<div class="bd-tianji">' + stars + ' (' + state.tianji + '/' + state.maxTianji + ')</div></div>';

    html += '<div class="bd-section"><div class="bd-title">主将</div>' +
      '<div class="bd-count">' + state.commander.heroId + ' · 血 ' + state.commander.hp + '/' +
      state.commander.maxHp + ' · 防 ' + state.commander.defense + '</div></div>';

    html += '<div class="bd-section"><div class="bd-title">手牌（' + state.hand.length + '/' + GS.HAND_MAX + '）</div>';
    state.hand.forEach(function (uid) {
      var hero = GS.cardDef(state, uid);
      if (hero) {
        html += '<div class="bd-row">' + hero.nick + ' <span class="bd-dim">' + hero.category +
          (state.usedThisTurn[uid] ? ' ✓已用' : '') + '</span></div>';
      }
    });
    html += '</div>';

    html += '<div class="bd-section"><div class="bd-title">敌方状态</div>';
    (state.boss ? [state.boss] : []).concat(state.enemies).forEach(function (e) {
      if (!e.alive || e.hp <= 0) return;
      var marks = [];
      if (state.atkDebuff[e.id]) marks.push('削弱-' + state.atkDebuff[e.id] + '%');
      if (state.burnStacks[e.id]) marks.push('🔥' + state.burnStacks[e.id]);
      if (state.windBurnLayers[e.id]) marks.push('🌪' + state.windBurnLayers[e.id]);
      if (state.frozenNext[e.id] || state.frozen[e.id]) marks.push('🧊');
      html += '<div class="bd-row">' + (state.boss && e.id === state.boss.id ? '☠ ' : '') + e.name + ' ' +
        e.hp + '/' + e.maxHp + (marks.length ? ' <span class="bd-dim">' + marks.join(' ') + '</span>' : '') + '</div>';
    });
    html += '</div>';

    box.innerHTML = html;
  }

  /* ---------------- 调试面板 ---------------- */
  function debugContent(tab, state) {
    var box = document.createElement('div');
    box.className = 'debug-content';
    var GS = g.DSH_GameState;

    switch (tab) {
      case '战斗日志': {
        var list = el('ul', 'log-list');
        state.log.slice().reverse().slice(0, 200).forEach(function (l) {
          list.appendChild(el('li', '', '[R' + l.turn + '] ' + l.text));
        });
        box.appendChild(list);
        break;
      }
      case '卡包': {
        var table = el('table', 'dbg-table');
        table.innerHTML = '<tr><th>英雄</th><th>类别</th><th>五行</th><th>指向</th><th>效果</th><th>手牌</th></tr>';
        g.DSH_HEROES.packHeroIds(state.commander ? state.commander.heroId : null).forEach(function (id) {
          var h = g.DSH_HEROES.byId(id);
          var inHand = GS.countHeroInHand(state, id);
          var copies = state.pack.filter(function (c) { return c.heroId === id; }).length;
          var tr = el('tr', '');
          tr.innerHTML = '<td>' + h.nick + '</td><td>' + h.category + '</td><td>' + h.element +
            '</td><td>' + (g.DSH_CardRenderer.TARGET_TEXT[h.target] || '') + '</td><td>' + h.desc +
            '</td><td>' + inHand + '/' + copies + '</td>';
          table.appendChild(tr);
        });
        box.appendChild(table);
        break;
      }
      case '主将': {
        if (!state.commander) {
          box.appendChild(el('p', '', '尚未选择主将（首页 → 开始战斗 → 选将）'));
          break;
        }
        var cmd = state.commander;
        var cd = g.DSH_HEROES.byId(cmd.heroId);
        box.appendChild(el('p', '', '主将：' + cd.nick + '（' + cd.name + '）· ' + cd.category + ' · ' + cd.element));
        box.appendChild(el('p', '', '血量：' + cmd.hp + '/' + cmd.maxHp + '　防御：' + cmd.defense));
        box.appendChild(el('p', '', '主将天赋：『' + cd.talent.name + '』 ' + cd.talent.desc));
        box.appendChild(el('p', 'dbg-note', '主将没有攻击，是「你」；偏将卡才是招式。'));
        break;
      }
      case '规则': {
        var hex = state.currentHexagram;
        box.appendChild(el('p', '', '当前卦象：『' + (hex ? hex.name : '-') + '』（' +
          g.DSH_HexSystem.hexProgressText(state) + '）'));
        var ul = el('ul', '');
        if (hex) hex.rules.forEach(function (r) {
          var t = g.DSH_HEX64.RULE_TEXT[r.key];
          ul.appendChild(el('li', '', (t ? t.name : r.key) + '：' + (t ? t.text.replace('X', r.value) : r.value)));
        });
        box.appendChild(ul);
        box.appendChild(el('p', 'dbg-note', '—— 规则库（25 种，全部实现）——'));
        var ul2 = el('ul', 'rule-lib');
        for (var k in g.DSH_HEX64.RULE_TEXT) {
          var t2 = g.DSH_HEX64.RULE_TEXT[k];
          ul2.appendChild(el('li', '', t2.name + '：' + t2.text));
        }
        box.appendChild(ul2);
        break;
      }
      case '英雄名录': {
        var t3 = el('table', 'dbg-table');
        t3.innerHTML = '<tr><th>诨名</th><th>名字</th><th>类别</th><th>五行</th><th>指向</th><th>效果</th><th>主将天赋</th><th>主将血</th></tr>';
        g.DSH_HEROES.HEROES.forEach(function (h) {
          var tr = el('tr', '');
          tr.innerHTML = '<td>' + h.nick + '</td><td>' + h.name + '</td><td>' + h.category + '</td><td>' +
            h.element + '</td><td>' + (g.DSH_CardRenderer.TARGET_TEXT[h.target] || '') + '</td><td>' +
            h.desc + '</td><td>' + h.talent.name + '</td><td>' + h.hp + '</td>';
          t3.appendChild(tr);
        });
        box.appendChild(t3);
        break;
      }
      case '五行克制': {
        var ring = g.DSH_ELEMENTS.RING;
        var t4 = el('table', 'dbg-table');
        var head = '<tr><th>攻＼防</th>';
        ring.forEach(function (e) { head += '<th>' + e + '</th>'; });
        head += '</tr>';
        t4.innerHTML = head;
        ring.forEach(function (att) {
          var tr = el('tr', '');
          tr.innerHTML = '<th>' + att + '</th>';
          ring.forEach(function (def) {
            tr.innerHTML += '<td>' + g.DSH_ELEMENTS.counterMult(att, def) + '</td>';
          });
          t4.appendChild(tr);
        });
        box.appendChild(t4);
        box.appendChild(el('p', 'dbg-note', '克制环：金→木→土→水→火→金（克制x1.3 / 被克x0.7 / 无关x1.0）'));
        break;
      }
      case '八卦总览': {
        var t5 = el('table', 'dbg-table');
        t5.innerHTML = '<tr><th>卦</th><th>爻序(下中上)</th><th>特效</th></tr>';
        g.DSH_TRIGRAMS.TRIGRAMS.forEach(function (t) {
          var tr = el('tr', '');
          tr.innerHTML = '<td>' + t.symbol + t.name + '</td><td>' + t.lines.join('') + '</td><td>' + t.desc + '</td>';
          t5.appendChild(tr);
        });
        box.appendChild(t5);
        box.appendChild(el('p', 'dbg-note', '64 卦完整性：' + g.DSH_HEX64.count + ' 卦（上下卦唯一映射）'));
        break;
      }
      case '规则自检': {
        var res = g.DSH_Selftest.run();
        box.appendChild(el('h4', '', res.pass ? '✓ 全部通过（' + res.total + ' 项断言）' : '✗ 存在失败（' + res.fail + ' 项）'));
        var ul3 = el('ul', 'selftest-list');
        res.details.forEach(function (d) {
          ul3.appendChild(el('li', d.pass ? 'pass' : 'fail', (d.pass ? '✓ ' : '✗ ') + d.name + (d.pass ? '' : ' —— ' + d.msg)));
        });
        box.appendChild(ul3);
        break;
      }
      default:
        break;
    }
    return box;
  }

  function renderTabs(active) {
    var bar = document.getElementById('debug-tabs');
    if (!bar) return;
    bar.innerHTML = '';
    TABS.forEach(function (t) {
      var btn = el('button', 'debug-tab' + (t === active ? ' active' : ''), t);
      btn.dataset.tab = t;
      bar.appendChild(btn);
    });
  }

  g.DSH_BattleRenderer = {
    TABS: TABS,
    createEnemyCard: createEnemyCard,
    renderAll: renderAll,
    renderEnemyRow: renderEnemyRow,
    renderRiver: renderRiver,
    renderHand: renderHand,
    renderCommander: renderCommander,
    renderTianji: renderTianji,
    renderEnemyInfo: renderEnemyInfo,
    renderEnemyTargets: renderEnemyTargets,
    debugContent: debugContent,
    renderBattleData: renderBattleData,
    applyHitFlashes: applyHitFlashes,
    renderTabs: renderTabs
  };
})(typeof window !== 'undefined' ? window : globalThis);
