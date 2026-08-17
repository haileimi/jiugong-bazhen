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
      (enemy.aoe ? '·全体' : '') + (state.atkDebuff[enemy.id] ? '·削' + state.atkDebuff[enemy.id] + '%' : ''));
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

  /* ---------------- 战场：5×3 小鬼区 / 一格界河 / 5×3 副将区（手牌） ---------------- */

  /** 小鬼区：5×3 敌方（魔王战：5 魔将第 1 行 + 本体居中；小怪战：2 只第 1 行） */
  function renderEnemyRow(state) {
    var grid = document.getElementById('enemy-row');
    if (!grid) return;
    grid.innerHTML = '';

    var slots = [];
    if (state.battleKind === 'boss') {
      slots.push({ idx: 7, e: state.boss, boss: true });           // 第 2 行居中
      state.enemies.forEach(function (e, i) { slots.push({ idx: i, e: e, boss: false }); }); // 第 1 行 5 只
    } else {
      state.enemies.forEach(function (e, i) { slots.push({ idx: i === 0 ? 1 : 3, e: e, boss: false }); });
    }

    for (var c = 0; c < 15; c++) {
      var cell = el('div', 'grid-cell');
      var slot = null;
      for (var i = 0; i < slots.length; i++) if (slots[i].idx === c) { slot = slots[i]; break; }
      if (slot) {
        var card = createEnemyCard(slot.e, state, slot.boss);
        if (slot.boss) card.classList.add('boss-card');
        if (g.DSH_GameState.enemyAlive(state, slot.e.id)) card.classList.add('targetable');
        cell.appendChild(card);
      } else {
        cell.classList.add('empty');
        cell.appendChild(el('div', 'cell-dot', '·'));
      }
      grid.appendChild(cell);
    }
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
        elCard = document.querySelector('.commander-bottom');
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

  /* ---------------- 界河区（只 1-2 行文字：回合数 + 已抽到的卦象） ---------------- */
  function renderRiver(state) {
    var turnEl = document.getElementById('river-turn');
    var hexEl = document.getElementById('river-hex');
    if (turnEl) {
      turnEl.textContent = '第 ' + state.turn + ' 回合 · 第 ' + state.layer + ' 层' +
        (state.battleKind === 'boss' ? ' · 魔王战' : ' · 小怪战');
    }
    if (hexEl) {
      var lines = '';
      if (state.currentHexagram) {
        var hex = state.currentHexagram;
        lines = '<div class="hex-line tianming"><span class="hex-tag">天命</span> 『' + hex.name + '』 ' +
          hex.upperSymbol + hex.lowerSymbol + '：' + hex.effectText + '</div>';
      } else {
        var parts = [];
        if (state.lowerTrigram) {
          var lo = g.DSH_TRIGRAMS.byId(state.lowerTrigram);
          parts.push('<span class="hex-tag">下卦</span> ' + lo.symbol + lo.name);
        }
        if (state.upperTrigram) {
          var up = g.DSH_TRIGRAMS.byId(state.upperTrigram);
          parts.push('<span class="hex-tag">上卦</span> ' + up.symbol + up.name);
        }
        if (parts.length) lines = '<div class="hex-line">' + parts.join('　') + '</div>';
      }
      hexEl.innerHTML = lines; // 无卦象时为空 → 只显示回合数
    }
  }

  /* ---------------- 副将区（手牌，5×3 分排：近战/远程/谋略，按定位归排居中） ---------------- */
  var DEPTS = [
    { cat: '战斗', name: '近战部', symbol: '⚔️' },
    { cat: '护卫', name: '远程部', symbol: '🏹' },
    { cat: '计谋', name: '谋略部', symbol: '🪶' }
  ];

  function renderHand(state) {
    var zone = document.getElementById('hand-zone');
    if (!zone) return;
    zone.innerHTML = '';
    var sel = document.querySelector('.hand-card.selected');
    var selUid = sel ? sel.dataset.uid : null;

    if (state.hand.length === 0) {
      zone.appendChild(el('div', 'hand-empty-note', '手牌已空（回合结束自动补 5 张）'));
    }

    DEPTS.forEach(function (dept) {
      var cards = state.hand.map(function (uid) {
        return { uid: uid, hero: g.DSH_GameState.cardDef(state, uid) };
      }).filter(function (c) { return c.hero && c.hero.category === dept.cat; });

      var row = el('div', 'dept-row dept-' + dept.cat);
      row.appendChild(el('span', 'dept-symbol', dept.symbol));
      row.appendChild(el('span', 'dept-label', dept.name));

      // 居中排列（5 格内居中）
      var start = Math.max(0, Math.floor((5 - cards.length) / 2));
      for (var c = 0; c < 5; c++) {
        var cell = el('div', 'grid-cell');
        var idx = c - start;
        if (idx >= 0 && idx < cards.length) {
          var card = g.DSH_CardRenderer.createHandCard(cards[idx].hero, state, cards[idx].uid);
          if (cards[idx].uid === selUid) card.classList.add('selected');
          cell.appendChild(card);
        } else {
          cell.classList.add('empty');
          cell.appendChild(el('div', 'cell-dot', '·'));
        }
        row.appendChild(cell);
      }
      zone.appendChild(row);
    });
  }

  /* ---------------- 主将天赋及法宝 / 主将底栏 ---------------- */
  function renderCommanderTalent(state) {
    var row = document.getElementById('commander-talent-row');
    if (!row) return;
    row.innerHTML = '';
    if (!state.commander) return;
    var def = g.DSH_HEROES.byId(state.commander.heroId);
    var box = el('div', 'commander-talent-bar');
    box.innerHTML = '<span class="ct-label">主将天赋</span><span class="ct-name">『' + def.talent.name + '』</span>' +
      '<span class="ct-desc">' + def.talent.desc + '</span>' +
      '<span class="ct-divider">｜</span><span class="ct-label">法宝</span><span class="ct-fabao">空（开发中）</span>';
    row.appendChild(box);
  }

  /** 主将区：头像 + 名字/天赋 + 法宝 + 血量 + 防御 + 卡包 + 天机 */
  function renderCommander(state) {
    var zone = document.getElementById('commander-zone');
    if (!zone) return;
    zone.innerHTML = '';
    if (!state.commander) return;
    var def = g.DSH_HEROES.byId(state.commander.heroId);

    var bottom = el('div', 'commander-bottom');
    // 头像（无立绘，用类别符号）
    bottom.appendChild(el('div', 'commander-avatar', g.DSH_CardRenderer.CAT_ICON[def.category] || '🏮'));

    // 信息区：名字+天赋 / 血量 / 防御 / 法宝·卡包·天机
    var info = el('div', 'commander-info');
    var head = el('div', 'ci-head');
    head.appendChild(el('span', 'ci-name', def.nick));
    head.appendChild(el('span', 'ci-talent', '『' + def.talent.name + '』' + def.talent.desc));
    info.appendChild(head);

    var hpRow = el('div', 'ci-row');
    hpRow.appendChild(el('span', 'ci-label', '血量'));
    var hpBar = el('div', 'commander-bar hp-bar');
    var hpFill = el('div', 'commander-bar-fill hp-fill');
    hpBar.appendChild(hpFill);
    hpRow.appendChild(hpBar);
    hpRow.appendChild(el('span', 'ci-text', state.commander.hp + '/' + state.commander.maxHp));
    info.appendChild(hpRow);

    var defRow = el('div', 'ci-row');
    defRow.appendChild(el('span', 'ci-label', '防御'));
    var defBar = el('div', 'commander-bar def-bar');
    var defFill = el('div', 'commander-bar-fill def-fill');
    defBar.appendChild(defFill);
    defRow.appendChild(defBar);
    defRow.appendChild(el('span', 'ci-text', state.commander.defense));
    info.appendChild(defRow);

    var foot = el('div', 'ci-foot');
    foot.appendChild(el('span', '', '🧿 法宝：空'));
    foot.appendChild(el('span', '', '🃏 卡包 ' + state.pack.length + ' 张'));
    var stars = '';
    for (var i = 0; i < state.maxTianji; i++) stars += i < state.tianji ? '✦' : '☆';
    foot.appendChild(el('span', '', '☯ 天机 ' + stars + ' ' + state.tianji + '/' + state.maxTianji));
    info.appendChild(foot);

    bottom.appendChild(info);
    zone.appendChild(bottom);

    g.DSH_CardRenderer.setHpBar(hpFill, 'cmd-hp', state.commander.hp, state.commander.maxHp);
    g.DSH_CardRenderer.setHpBar(defFill, 'cmd-def', state.commander.defense, Math.max(state.commander.maxHp, 10));
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
    renderEnemyRow(state);
    renderRiver(state);
    renderCommander(state);
    renderHand(state);
    renderBattleData(state);
  }

  /* ---------------- 左侧战斗数据面板（markdown 风格） ---------------- */
  function renderBattleData(state) {
    var box = document.getElementById('battle-data-content');
    if (!box) return;
    var html = '';
    var GS = g.DSH_GameState;
    var T = g.DSH_TRIGRAMS;

    // 卦象节奏
    html += '<div class="md-h1">卦象节奏</div>';
    var lo = state.lowerTrigram ? T.byId(state.lowerTrigram) : null;
    var up = state.upperTrigram ? T.byId(state.upperTrigram) : null;
    html += '<div class="md-li">下卦：' + (lo ? '<span class="hl">' + lo.symbol + lo.name + '</span> ' + lo.desc : '<span class="dim">未抽（第 3 回合）</span>') + '</div>';
    html += '<div class="md-li">上卦：' + (up ? '<span class="hl">' + up.symbol + up.name + '</span> ' + up.desc : '<span class="dim">未抽（第 5 回合）</span>') + '</div>';
    html += '<div class="md-li">天命：' + (state.currentHexagram
      ? '<span class="hl">『' + state.currentHexagram.name + '』</span> ' + state.currentHexagram.effectText
      : '<span class="dim">未觉醒（第 7 回合）</span>') + '</div>';

    html += '<hr class="md-hr">';

    // 天机
    var stars = '';
    for (var i = 0; i < state.maxTianji; i++) stars += i < state.tianji ? '✦' : '☆';
    html += '<div class="md-h1">天命 · 天机</div>';
    html += '<div class="md-li">' + stars + '（' + state.tianji + '/' + state.maxTianji + '）</div>';

    html += '<hr class="md-hr">';

    // 战况
    html += '<div class="md-h1">战况</div>';
    html += '<div class="md-li">主将：<span class="hl">' + state.commander.heroId + '</span> · 血 ' + state.commander.hp +
      '/' + state.commander.maxHp + ' · 防 ' + state.commander.defense + '</div>';
    html += '<div class="md-li">手牌：' + state.hand.length + '/' + GS.HAND_MAX + ' 张</div>';
    html += '<div class="md-li">卡包：' + state.pack.length + ' 张（上限 48）</div>';
    var aliveE = GS.aliveEnemies(state).length;
    html += '<div class="md-li">敌方：存活 ' + aliveE + ' 单位' +
      (state.battleKind === 'boss' && GS.bossUnlocked(state) ? ' · ☠ 魔王已解锁' : '') + '</div>';

    html += '<hr class="md-hr">';

    // 手牌明细
    html += '<div class="md-h1">手牌</div>';
    if (state.hand.length === 0) {
      html += '<div class="md-li dim">（空）</div>';
    } else {
      html += '<table class="md-table"><tr><th>牌</th><th>类别</th><th>状态</th></tr>';
      state.hand.forEach(function (uid) {
        var hero = GS.cardDef(state, uid);
        if (!hero) return;
        html += '<tr><td>' + hero.nick + '</td><td>' + hero.category +
          '</td><td>' + (state.usedThisTurn[uid] ? '已用' : '可用') + '</td></tr>';
      });
      html += '</table>';
    }

    html += '<hr class="md-hr">';

    // 敌方状态
    html += '<div class="md-h1">敌方状态</div>';
    var anyEnemy = false;
    (state.boss ? [state.boss] : []).concat(state.enemies).forEach(function (e) {
      if (!e.alive || e.hp <= 0) return;
      anyEnemy = true;
      var marks = [];
      if (state.atkDebuff[e.id]) marks.push('削弱-' + state.atkDebuff[e.id] + '%');
      if (state.burnStacks[e.id]) marks.push('🔥' + state.burnStacks[e.id]);
      if (state.windBurnLayers[e.id]) marks.push('🌪' + state.windBurnLayers[e.id]);
      if (state.frozenNext[e.id] || state.frozen[e.id]) marks.push('🧊');
      html += '<div class="md-li">' + (state.boss && e.id === state.boss.id ? '☠ ' : '') + e.name +
        ' · 攻 ' + GS.enemyAtk(state, e) + ' · ' + e.hp + '/' + e.maxHp +
        (marks.length ? ' <span class="dim">' + marks.join(' ') + '</span>' : '') + '</div>';
    });
    if (!anyEnemy) html += '<div class="md-li dim">（无存活敌方）</div>';

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
    renderCommanderTalent: renderCommanderTalent,
    renderTianji: renderTianji,
    renderEnemyInfo: renderEnemyInfo,
    renderEnemyTargets: renderEnemyTargets,
    debugContent: debugContent,
    renderBattleData: renderBattleData,
    applyHitFlashes: applyHitFlashes,
    renderTabs: renderTabs
  };
})(typeof window !== 'undefined' ? window : globalThis);
