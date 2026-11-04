  // ================= 来源：谁说的话上星 =================
  // 实测：2731 条 user 消息里只有 532 条是人真正说的话，其余是插件注入的规则、时间上下文、
  // 审批流水。全画成星，真实交流会被淹在噪音里；可全塞进筛子，又变成"看不见"。
  // 所以来源单独做成一维：可以只看某一类，也可以把某一类关掉。
  var SRC_DEF = [
    { k: 'user', nm: '你说的话' },
    { k: 'assistant', nm: '我的回复' },
    { k: 'qq', nm: 'QQ 聊天' },
    { k: 'agent-message', nm: '团队协作' },
    { k: 'dsh-world-life', nm: '世界 · 生活' },
    { k: 'dsh-world-history', nm: '世界 · 旧事' },
    { k: 'world-diary', nm: '世界 · 日记' }
  ];
  var SYS = SEA.sys || [];
  var PROC = SEA.proc || { think: 0, tool: 0 };
  var SRC_ONKEY = 'sea.srcsel.v1';
  var srcOn = null;
  (function () {
    var loaded = null;
    try { var s = localStorage.getItem(SRC_ONKEY); if (s) loaded = JSON.parse(s); } catch (e) {}
    srcOn = {};
    for (var i = 0; i < SRC_DEF.length; i++) {
      var k = SRC_DEF[i].k;
      srcOn[k] = (loaded && typeof loaded === 'object' && k in loaded) ? (loaded[k] ? 1 : 0) : 1;
    }
  })();

  function srcFiltering() {
    for (var i = 0; i < SRC_DEF.length; i++) if (!srcOn[SRC_DEF[i].k]) return true;
    return false;
  }
  function saveSrc() { try { localStorage.setItem(SRC_ONKEY, JSON.stringify(srcOn)); } catch (e) {} }
  // 来源的机器名 → 人话（详情面板「来源」那一行用）
  function srcName(k) {
    if (!k) return '未知来源';
    for (var i = 0; i < SRC_DEF.length; i++) if (SRC_DEF[i].k === k) return SRC_DEF[i].nm;
    return k;
  }
  function srcCount(name) {
    var c = 0;
    for (var i = 0; i < NODES.length; i++) {
      // NODES 里混着两片海：SurfCore 那 251 条不算"谁说的话"
      if (NODES[i].src_ === 'sc') continue;
      if (NODES[i].s === name) c++;
    }
    return c;
  }
  // 系统注入的 kind 是英文机器名，给个人话名字
  function sysLabel(k) {
    var M = {
      'time-context': '时间上下文', 'runtime-context': '运行时上下文',
      'plugin:deepseek-harness-zh-cn': '中文插件规则', 'ptc-mode': 'ptc 模式提示',
      'skill-catalog': '技能目录', 'user-approval': '审批流水',
      'model-selection': '模型切换', 'agent-instructions': '代理指令',
      'tool-jobs': '后台任务', 'subagent-settled': '子代理回执',
      'schedule': '定时提醒', 'working-directory': '工作目录',
      none: '无来源标记'
    };
    return M[k] || k;
  }

  // 隐藏层全文：2005 条 × 800 字，好几 MB —— data.js 里不带，点了才拉 hidden.js
  var SYSALL = null, sysAllBusy = false, sysQuery = '';
  function loadSysAll(cb) {
    if (SYSALL) { cb(); return; }
    if (sysAllBusy) return;
    sysAllBusy = true;
    var sc = document.createElement('script');
    sc.src = 'hidden.js';
    sc.onload = function () { sysAllBusy = false; SYSALL = window.SEA_SYS || []; cb(); };
    sc.onerror = function () { sysAllBusy = false; say('全文没加载上：hidden.js 不在 out/ 里'); };
    document.head.appendChild(sc);
  }
  function renderSysAll(keepFocus) {
    var box = document.getElementById('sp-alllist');
    if (!box) return;
    var q = sysQuery.trim().toLowerCase();
    var arr = SYSALL || [];
    var hit = q ? arr.filter(function (r) { return String(r.d || '').toLowerCase().indexOf(q) >= 0; }) : arr;
    var rows = hit.slice(0, 120).map(function (r) {
      return '<div class="sysfull"><i>' + fmtDate(r.t) + ' · ' + esc(sysLabel(r.k)) + '</i><p>'
        + esc((r.d || '').slice(0, 240)) + '</p></div>';
    }).join('');
    box.innerHTML = '<div class="syssearch"><input id="sysq" placeholder="在这 ' + arr.length
      + ' 条系统消息里搜…" value="' + esc(sysQuery).replace(/"/g, '&quot;') + '"><span class="n">'
      + hit.length + ' 条</span></div>' + rows
      + (hit.length > 120 ? '<div class="sphint">只列前 120 条，再搜细一点</div>' : '');
    var inp = document.getElementById('sysq');
    if (inp) {
      inp.oninput = function () { sysQuery = this.value; renderSysAll(true); };
      if (keepFocus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }

  function renderSrcPanel() {
    var box = document.getElementById('spbody');
    if (!box) return;
    var html = SRC_DEF.map(function (d) {
      var on = !!srcOn[d.k];
      return '<div class="sprow ' + (on ? 'on' : 'off') + '" data-src="' + d.k + '">'
        + '<span class="cb">' + (on ? '✓' : '') + '</span>'
        + '<span class="nm">' + esc(d.nm) + '</span>'
        + '<span class="n">' + srcCount(d.k) + '</span></div>';
    }).join('');
    var sysN = 0;
    for (var i = 0; i < SYS.length; i++) sysN += SYS[i].n || 0;
    html += '<div class="sphr"></div>';
    html += '<div class="spsec" id="sp-sys"><span>隐藏层 · 系统消息</span><span class="n">'
      + sysN + ' 条 ⌄</span></div><div class="spfold" id="sp-syslist">';
    html += SYS.map(function (g, gi) {
      return '<div class="sysrow" data-i="' + gi + '"><span>' + esc(sysLabel(g.kind))
        + '</span><span class="n">' + g.n + '</span></div>'
        + '<div class="syssamp" id="sysamp-' + gi + '">'
        + (g.samples || []).map(function (s) { return '<div>' + esc(s.txt || '') + '</div>'; }).join('')
        + '</div>';
    }).join('');
    html += '</div><div class="sphr"></div>';
    html += '<div class="spsec" id="sp-all"><span>翻全部 ' + (sysN) + ' 条的全文</span><span class="n">搜 ⌄</span></div>'
      + '<div class="spfold" id="sp-allwrap"><div id="sp-alllist"></div></div>';
    html += '<div class="spnote">过程层：思考 ' + (PROC.think || 0) + ' 条、工具调用 '
      + (PROC.tool || 0) + ' 次没有上星 —— 它们在每颗星点开后的详情里。'
      + '长期记忆用顶上的「忆」。</div>';
    html += '<div class="spsec" id="sp-reset"><span>全部打开</span></div>';
    box.innerHTML = html;

    box.onclick = function (e) {
      var t = e.target;
      var row = t.closest ? t.closest('.sprow') : null;
      if (row) {
        var k = row.getAttribute('data-src');
        srcOn[k] = srcOn[k] ? 0 : 1;
        saveSrc(); renderSrcPanel(); applySrcChange();
        return;
      }
      var sr = t.closest ? t.closest('.sysrow') : null;
      if (sr) {
        var el = document.getElementById('sysamp-' + sr.getAttribute('data-i'));
        if (el) el.classList.toggle('open');
        return;
      }
      if (t.id === 'sp-sys' || (t.parentNode && t.parentNode.id === 'sp-sys')) {
        var l = document.getElementById('sp-syslist');
        if (l) l.classList.toggle('open');
        return;
      }
      if (t.id === 'sp-all' || (t.parentNode && t.parentNode.id === 'sp-all')) {
        var w = document.getElementById('sp-allwrap');
        if (!w) return;
        var opening = !w.classList.contains('open');
        w.classList.toggle('open', opening);
        if (opening) loadSysAll(function () { renderSysAll(); });
        return;
      }
      if (t.id === 'sp-reset' || (t.parentNode && t.parentNode.id === 'sp-reset')) {
        for (var j = 0; j < SRC_DEF.length; j++) srcOn[SRC_DEF[j].k] = 1;
        saveSrc(); renderSrcPanel(); applySrcChange();
        return;
      }
    };
  }

  // 改完来源立即重算可见 + 刷新左栏（有的会话会整段消失，得跟着变）
  function applySrcChange() {
    refreshFilter();
    if (typeof renderSessionList === 'function') renderSessionList();
    var btn = document.getElementById('srcf');
    if (btn) btn.classList.toggle('on', srcFiltering());
    say(srcFiltering() ? '只显示选中的来源 · 已跨层' : '显示全部来源');
  }

  (function () {
    var btn = document.getElementById('srcf');
    var panel = document.getElementById('srcpanel');
    if (!btn || !panel) return;
    renderSrcPanel();
    btn.onclick = function (e) {
      e.stopPropagation();
      var open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      btn.classList.toggle('on', open || srcFiltering());
      if (open) {
        document.getElementById('tools').classList.remove('open');
        document.getElementById('morebtn').classList.remove('on');
        renderSrcPanel();
      }
    };
    document.getElementById('spclose').onclick = function () {
      panel.classList.remove('open');
      btn.classList.toggle('on', srcFiltering());
    };
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(e.target) || e.target === btn) return;
      panel.classList.remove('open');
      btn.classList.toggle('on', srcFiltering());
    });
  })();


  Array.prototype.forEach.call(document.querySelectorAll('[data-kind]'), function (btn) {
    btn.onclick = function () {
      var k = btn.getAttribute('data-kind');
      kinds[k] = !kinds[k];
      btn.classList.toggle('off', !kinds[k]);
      refreshFilter();
    };
  });
