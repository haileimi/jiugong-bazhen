/**
 * battleRenderer.js — 战场渲染（敌方/界河/九宫格/天机）+ 调试面板
 *
 * 布局（从上到下，375px 竖屏主战场 + 右侧调试区）：
 * 敌方信息行 → 魔王区域（本体 + 七魔将）→ 界河 → 九宫格 → 天机行 → 回合完毕按钮
 */
(function (g) {
  'use strict';

  var TABS = ['战斗日志', '卡池', '规则', '英雄名录', '五行克制', '八卦总览', '规则自检'];

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

    // 攻/五行/全体 信息行
    var atkLine = el('div', 'enemy-atk', '攻 ' + enemy.atk + (enemy.aoe ? ' · 全体' : '') +
      ' · ' + g.DSH_ELEMENTS.ICON[enemy.element] + enemy.element);
    card.appendChild(atkLine);

    var bar = el('div', 'enemy-hpbar' + (isBoss ? ' boss-hpbar' : ''));
    var barFill = el('div', 'enemy-hpbar-fill', '');
    bar.appendChild(barFill);
    card.appendChild(bar);

    // 敌方红色血条：受伤/恢复时平滑过渡
    g.DSH_CardRenderer.setHpBar(barFill, enemy.id, enemy.hp, enemy.maxHp);

    var hpText = el('div', 'enemy-hp' + (isBoss ? ' boss-hp' : ''), enemy.hp + '/' + enemy.maxHp);
    card.appendChild(hpText);

    // 魔王本体附加信息
    if (isBoss) {
      var bossInfo = el('div', 'boss-info');
      bossInfo.textContent = g.DSH_GameState.bossUnlocked(state)
        ? '☠ 魔王本体已解锁，可被攻击！'
        : '⚔ 魔将未灭，本体被守护';
      card.appendChild(bossInfo);
    }

    // 持续伤害标记
    var marks = [];
    if (state.burnStacks[enemy.id]) marks.push('🔥' + state.burnStacks[enemy.id]);
    if (state.windBurnLayers[enemy.id]) marks.push('🌪' + state.windBurnLayers[enemy.id]);
    if (state.frozenNext[enemy.id] || state.frozen[enemy.id]) marks.push('🧊');
    if (marks.length) card.appendChild(el('div', 'enemy-dot', marks.join(' ')));

    return card;
  }

  /* ---------------- 战场 ---------------- */
  function renderEnemyRow(state) {
    var row = document.getElementById('enemy-row');
    if (!row) return;
    row.innerHTML = '';
    // 魔王本体独占一行（最上）：解锁后金色高亮并可攻击
    var bossCard = createEnemyCard(state.boss, state, true);
    bossCard.classList.add('boss-card');
    if (g.DSH_GameState.bossUnlocked(state) && state.boss.hp > 0) {
      bossCard.classList.add('boss-unlocked');
      bossCard.classList.add('targetable');
    }
    row.appendChild(bossCard);

    // 五魔将：上 2 下 3 两排
    var grid = el('div', 'enemy-grid');
    var line1 = el('div', 'enemy-line');
    var line2 = el('div', 'enemy-line');
    state.enemies.forEach(function (e, i) {
      var c = createEnemyCard(e, state, false);
      if (g.DSH_GameState.enemyAlive(state, e.id)) c.classList.add('targetable');
      (i < 2 ? line1 : line2).appendChild(c);
    });
    grid.appendChild(line1);
    grid.appendChild(line2);
    row.appendChild(grid);
  }

  /** 受击标红+抖动：依据 state.lastHits 对卡牌加动画类 */
  function applyHitFlashes(state) {
    state.lastHits.forEach(function (hit) {
      var elCard = null;
      if (hit.kind === 'enemy') {
        elCard = document.querySelector('.enemy-card[data-enemy-id="' + hit.id + '"]');
      } else {
        elCard = document.querySelector('.grid-slot .hero-card[data-hero-id="' + hit.id + '"]');
      }
      if (elCard) {
        elCard.classList.remove('hit-flash');
        // 强制重排以重新触发动画
        void elCard.offsetWidth;
        elCard.classList.add('hit-flash');
        setTimeout(function () { elCard.classList.remove('hit-flash'); }, 600);
      }
    });
    state.lastHits = [];
  }

  function renderRiver(state) {
    var turnEl = document.getElementById('river-turn');
    var hexEl = document.getElementById('river-hex');
    var hintEl = document.getElementById('river-hint');
    if (turnEl) turnEl.textContent = '第 ' + state.turn + ' 回合';
    if (hexEl && state.currentHexagram) {
      var hex = state.currentHexagram;
      hexEl.innerHTML = '<b>『' + hex.name + '』</b> <span class="hex-symbol">' +
        hex.upperSymbol + hex.lowerSymbol + '</span><br><span class="hex-effect">' +
        hex.effectText + '</span>';
    }
    if (hintEl) {
      if (state.over) hintEl.textContent = state.over === 'win' ? '🏆 天命已定，胜利！' : '💀 败局……';
      else if (state.phase === 'player') hintEl.textContent = '拖动英雄卡到敌方目标上发起攻击';
      else if (state.phase === 'boss') hintEl.textContent = '魔王行动中……';
    }
  }

  function renderTianji(state) {
    var t = document.getElementById('tianji-text');
    if (t) {
      var stars = '';
      for (var i = 0; i < state.maxTianji; i++) stars += i < state.tianji ? '✦' : '☆';
      t.textContent = '天命 · 天机 ' + state.tianji + '/' + state.maxTianji + '  ' + stars;
    }
  }

  function renderEnemyInfo(state) {
    var e = document.getElementById('enemy-info');
    if (!e) return;
    var left = state.enemies.filter(function (x) { return x.alive && x.hp > 0; }).length;
    e.textContent = '魔王：混沌·六爻魔　|　魔将余 ' + left + '/5' +
      (g.DSH_GameState.bossUnlocked(state) ? '　　⚠ 魔王本体已解锁！' : '');
  }

  function renderGrid(state) {
    var grid = document.getElementById('grid');
    if (!grid) return;
    grid.innerHTML = '';
    // 两排：上 3 下 2（中宫 slot 1 = 上排中间）
    var row1 = el('div', 'grid-row');
    var row2 = el('div', 'grid-row');
    for (var i = 0; i < 5; i++) {
      var slot = el('div', 'grid-slot' + (i === g.DSH_GameState.CENTER_SLOT ? ' center' : ''));
      slot.dataset.slot = i;
      var heroId = state.board[i];
      var hero = heroId ? g.DSH_GameState.getHero(state, heroId) : null;
      if (hero) {
        var card = g.DSH_CardRenderer.createHeroCard(hero, state, i);
        slot.appendChild(card);
      } else {
        slot.appendChild(el('div', 'grid-empty', ''));
      }
      (i < 3 ? row1 : row2).appendChild(slot);
    }
    grid.appendChild(row1);
    grid.appendChild(row2);
  }

  function renderEnemyTargets(state) {
    // 高亮可攻击目标
    document.querySelectorAll('.enemy-card').forEach(function (c) {
      var id = c.dataset.enemyId;
      var targetable = g.DSH_GameState.enemyAlive(state, id);
      c.classList.toggle('targetable', targetable);
    });
  }

  /* ---------------- 左侧战斗数据面板 ---------------- */
  function renderBattleData(state) {
    var box = document.getElementById('battle-data-content');
    if (!box) return;
    var html = '';
    var GS = g.DSH_GameState;

    // 卦象
    if (state.currentHexagram) {
      var hex = state.currentHexagram;
      html += '<div class="bd-section"><div class="bd-title">卦象</div>' +
        '<div class="bd-hex">『' + hex.name + '』 ' + hex.upperSymbol + hex.lowerSymbol + '</div>' +
        '<div class="bd-hex-rules">' + hex.effectText + '</div></div>';
    }

    // 天机
    var stars = '';
    for (var i = 0; i < state.maxTianji; i++) stars += i < state.tianji ? '✦' : '☆';
    html += '<div class="bd-section"><div class="bd-title">天命 · 天机</div>' +
      '<div class="bd-tianji">' + stars + ' (' + state.tianji + '/' + state.maxTianji + ')</div></div>';

    // 战况统计
    var aliveHeroes = GS.aliveHeroes(state).length;
    var aliveEnemies = GS.aliveEnemies(state).length;
    html += '<div class="bd-section"><div class="bd-title">战况</div>' +
      '<div class="bd-count">我方存活 ' + aliveHeroes + '/12 ｜ 敌方 ' + aliveEnemies + ' 单位' +
      (GS.bossUnlocked(state) ? ' ｜ ☠ 魔王已解锁' : '') + '</div></div>';

    // 我方英雄状态
    html += '<div class="bd-section"><div class="bd-title">我方英雄（' + GS.boardHeroes(state).length + '）</div>';
    GS.boardHeroes(state).forEach(function (b) {
      var h = b.hero;
      html += '<div class="bd-row">' + h.nick + ' <span class="bd-dim">攻' + h.atk + ' 防' + h.hp + '/' + h.maxHp + '</span>' +
        (state.shield[h.id] ? ' <span class="bd-shield">🛡' + state.shield[h.id] + '</span>' : '') +
        (state.usedThisTurn[h.id] ? ' <span class="bd-acted">✓已动</span>' : '') + '</div>';
    });
    html += '</div>';

    // 敌方状态
    html += '<div class="bd-section"><div class="bd-title">敌方状态</div>';
    [state.boss].concat(state.enemies).forEach(function (e) {
      if (!e.alive || e.hp <= 0) return;
      var marks = [];
      if (state.burnStacks[e.id]) marks.push('🔥' + state.burnStacks[e.id]);
      if (state.windBurnLayers[e.id]) marks.push('🌪' + state.windBurnLayers[e.id]);
      if (state.frozenNext[e.id] || state.frozen[e.id]) marks.push('🧊');
      html += '<div class="bd-row">' + (e.id === 'boss' ? '☠ ' : '') + e.name + ' ' +
        e.hp + '/' + e.maxHp + (marks.length ? ' <span class="bd-dim">' + marks.join(' ') + '</span>' : '') + '</div>';
    });
    html += '</div>';

    box.innerHTML = html;
  }

  /** 全量重绘 */
  function renderAll(state) {
    renderEnemyInfo(state);
    renderEnemyRow(state);
    renderRiver(state);
    renderGrid(state);
    renderTianji(state);
    renderBattleData(state);
  }

  /* ---------------- 调试面板 ---------------- */
  function debugContent(tab, state) {
    var box = document.createElement('div');
    box.className = 'debug-content';

    switch (tab) {
      case '战斗日志': {
        var list = el('ul', 'log-list');
        state.log.slice().reverse().slice(0, 200).forEach(function (l) {
          list.appendChild(el('li', '', '[R' + l.turn + '] ' + l.text));
        });
        box.appendChild(list);
        break;
      }
      case '卡池': {
        var table = el('table', 'dbg-table');
        table.innerHTML = '<tr><th>英雄</th><th>兵种</th><th>五行</th><th>攻</th><th>防</th><th>状态</th></tr>';
        g.DSH_GameState.aliveHeroes(state).concat(
          g.DSH_HEROES.HEROES.filter(function (h) { return g.DSH_GameState.getHero(state, h.id).hp <= 0; })
            .map(function (h) { return g.DSH_GameState.getHero(state, h.id); })
        ).forEach(function (h) {
          var tr = el('tr', h.hp <= 0 ? 'dead-row' : '');
          tr.innerHTML = '<td>' + h.nick + '</td><td>' + h.role + '</td><td>' + h.element +
            '</td><td>' + h.atk + '</td><td>' + h.hp + '/' + h.maxHp + '</td><td>' +
            (h.hp <= 0 ? '已退场' : '存活') + '</td>';
          table.appendChild(tr);
        });
        box.appendChild(table);
        break;
      }
      case '规则': {
        var hex = state.currentHexagram;
        box.appendChild(el('p', '', '当前卦象：『' + (hex ? hex.name : '-') + '』 生效规则：'));
        var ul = el('ul', '');
        if (hex) hex.rules.forEach(function (r) {
          var t = g.DSH_HEX64.RULE_TEXT[r.key];
          ul.appendChild(el('li', '', (t ? t.name : r.key) + '：' + (t ? t.text.replace('X', r.value) : r.value)));
        });
        box.appendChild(ul);
        box.appendChild(el('p', 'dbg-note', '—— 规则库（24 种，全部实现）——'));
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
        t3.innerHTML = '<tr><th>id</th><th>诨名</th><th>名字</th><th>兵种</th><th>五行</th><th>阴阳</th><th>攻/防</th><th>特技</th><th>皮肤</th></tr>';
        g.DSH_HEROES.HEROES.forEach(function (h) {
          var tr = el('tr', '');
          var skins = h.skins.map(function (s) { return s.name; }).join(' / ');
          tr.innerHTML = '<td>' + h.id + '</td><td>' + h.nick + '</td><td>' + h.name + '</td><td>' +
            h.role + '</td><td>' + h.element + '</td><td>' + h.yinYang + '</td><td>' +
            h.atk + '/' + h.hp + '</td><td>' + h.skillName + '(x' + h.skillMult + ')</td><td>' +
            skins + '</td>';
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
            var m = g.DSH_ELEMENTS.counterMult(att, def);
            tr.innerHTML += '<td>' + m + '</td>';
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

  /** 渲染调试面板 Tab 条 */
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
    renderTianji: renderTianji,
    renderGrid: renderGrid,
    renderEnemyInfo: renderEnemyInfo,
    renderEnemyTargets: renderEnemyTargets,
    debugContent: debugContent,
    renderBattleData: renderBattleData,
    applyHitFlashes: applyHitFlashes,
    renderTabs: renderTabs
  };
})(typeof window !== 'undefined' ? window : globalThis);
