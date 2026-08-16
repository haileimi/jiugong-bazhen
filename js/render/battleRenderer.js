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

  /* ---------------- 界河 ---------------- */
  function renderRiver(state) {
    var turnEl = document.getElementById('river-turn');
    var hexEl = document.getElementById('river-hex');
    var hintEl = document.getElementById('river-hint');
    if (turnEl) turnEl.textContent = '第 ' + state.turn + ' 回合 · 第 ' + state.layer + ' 层' +
      (state.battleKind === 'boss' ? ' · 魔王战' : ' · 小怪战');
    if (hexEl) {
      var lines = '';
      // 下卦
      if (state.lowerTrigram) {
        var lo = g.DSH_TRIGRAMS.byId(state.lowerTrigram);
        lines += '<div class="hex-line"><span class="hex-tag">下卦</span> ' + lo.symbol + lo.name +
          '：<span class="hex-effect">' + lo.desc + '</span></div>';
      } else {
        lines += '<div class="hex-line dim"><span class="hex-tag">下卦</span> 未抽（第 3 回合）</div>';
      }
      // 上卦
      if (state.upperTrigram) {
        var up = g.DSH_TRIGRAMS.byId(state.upperTrigram);
        lines += '<div class="hex-line"><span class="hex-tag">上卦</span> ' + up.symbol + up.name +
          '：<span class="hex-effect">' + up.desc + '</span></div>';
      } else {
        lines += '<div class="hex-line dim"><span class="hex-tag">上卦</span> 未抽（第 5 回合）</div>';
      }
      // 天命（64 卦）
      if (state.currentHexagram) {
        var hex = state.currentHexagram;
        lines += '<div class="hex-line tianming"><span class="hex-tag">天命</span> 『' + hex.name + '』 ' +
          hex.upperSymbol + hex.lowerSymbol + '：<span class="hex-effect">' + hex.effectText + '</span></div>';
      } else {
        lines += '<div class="hex-line dim"><span class="hex-tag">天命</span> 未觉醒（第 7 回合）</div>';
      }
      hexEl.innerHTML = lines;
    }
    if (hintEl) {
      if (state.over) hintEl.textContent = state.over === 'win' ? '🏆 战斗胜利！' : '💀 主将战死……';
      else if (state.phase === 'player') hintEl.textContent = '点手牌 → 放大摆动 → 点怪物攻击；护卫/计谋点出即打';
      else if (state.phase === 'boss') hintEl.textContent = '怪物行动中……';
    }
  }

  /* ---------------- 手牌区（单排，恒定 331 宽） ----------------
   * ≤5 张：全尺寸 66px 并排；>5 张：每张缩小 20%（52.8px），叠放且总宽恒定 331
   */
  var HAND_STRIP = 331;
  var HAND_CARD_FULL = 66;
  var HAND_CARD_SHRINK = 66 * 0.8; // 缩小 20%

  function handRowMetrics(k, strip) {
    var cardW = k <= 5 ? HAND_CARD_FULL : HAND_CARD_SHRINK;
    var overlap = 0;
    if (cardW * k > strip && k > 1) {
      var step = (strip - cardW) / (k - 1); // 每张后移步长，保证总宽 = strip
      overlap = cardW - step;
    }
    return { cardW: cardW, overlap: overlap };
  }

  function renderHand(state) {
    var zone = document.getElementById('hand-zone');
    if (!zone) return;
    zone.innerHTML = '';
    if (state.hand.length === 0) {
      zone.appendChild(el('div', 'hand-empty', '手牌已空（回合结束自动补 5 张）'));
      return;
    }
    var sel = document.querySelector('.hand-card.selected');
    var selUid = sel ? sel.dataset.uid : null;

    var row = el('div', 'hand-row', '');
    var m = handRowMetrics(state.hand.length, HAND_STRIP);
    state.hand.forEach(function (uid, i) {
      var hero = g.DSH_GameState.cardDef(state, uid);
      if (!hero) return;
      var card = g.DSH_CardRenderer.createHandCard(hero, state, uid);
      card.style.width = m.cardW + 'px';
      if (i > 0 && m.overlap > 0) card.style.marginLeft = (-m.overlap) + 'px';
      if (uid === selUid) card.classList.add('selected');
      row.appendChild(card);
    });
    zone.appendChild(row);
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

  function renderCommander(state) {
    var zone = document.getElementById('commander-zone');
    if (!zone) return;
    zone.innerHTML = '';
    if (!state.commander) return;
    var def = g.DSH_HEROES.byId(state.commander.heroId);

    var bottom = el('div', 'commander-bottom');
    // 头像
    var avatar = el('div', 'commander-avatar');
    var img = document.createElement('img');
    img.className = 'commander-avatar-img';
    img.alt = def.nick;
    img.src = g.DSH_CardRenderer.imageSrc(def, 'default');
    img.onerror = function () {
      img.style.display = 'none';
      var fb = el('div', 'commander-avatar-fb', g.DSH_CardRenderer.CAT_ICON[def.category] || '🏮');
      avatar.appendChild(fb);
    };
    avatar.appendChild(img);
    avatar.appendChild(el('div', 'commander-avatar-name', def.nick));
    bottom.appendChild(avatar);

    // 血量 / 防御
    var stats = el('div', 'commander-stats');

    var hpRow = el('div', 'commander-stat-row');
    hpRow.appendChild(el('span', 'cs-label', '血量'));
    var hpBar = el('div', 'commander-bar hp-bar');
    var hpFill = el('div', 'commander-bar-fill hp-fill');
    hpBar.appendChild(hpFill);
    hpRow.appendChild(hpBar);
    var hpText = el('span', 'cs-text', state.commander.hp + '/' + state.commander.maxHp);
    hpRow.appendChild(hpText);
    stats.appendChild(hpRow);

    var defRow = el('div', 'commander-stat-row');
    defRow.appendChild(el('span', 'cs-label', '防御'));
    var defBar = el('div', 'commander-bar def-bar');
    var defFill = el('div', 'commander-bar-fill def-fill');
    defBar.appendChild(defFill);
    defRow.appendChild(defBar);
    var defText = el('span', 'cs-text', state.commander.defense);
    defRow.appendChild(defText);
    stats.appendChild(defRow);

    bottom.appendChild(stats);
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
    renderEnemyInfo(state);
    renderEnemyRow(state);
    renderRiver(state);
    renderCommanderTalent(state);
    renderCommander(state);
    renderHand(state);
    renderTianji(state);
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
