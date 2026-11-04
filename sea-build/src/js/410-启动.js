  // ================= 启动 =================
  // 插件里用 ?embed=1 打开：给系统窗口按钮让位
  try {
    if (/(?:^|[?&])embed=1(?:&|$)/.test(location.search)) {
      document.body.classList.add('embed');
      // 插件浮层自己让出系统标题栏时（client.js 传 ?pad=），这里就只用留一点点；
      // 不传就按老规矩留 54px，旧版 client.js 也不会顶到窗口按钮上。
      var mp = location.search.match(/(?:^|[?&])pad=(\d+)/);
      if (mp) document.documentElement.style.setProperty('--embed-pad', mp[1] + 'px');
    }
  } catch (e) {}

  buildSprites();
  resize();
  var _savedSrc = 'dsh';
  try { _savedSrc = localStorage.getItem('sea.src.v1') || 'dsh'; } catch (e) {}
  applySrc(_savedSrc, true);
  document.getElementById('tlfrom').textContent = fmtDay(SEA.t0);
  document.getElementById('tlto').textContent = fmtDay(SEA.t1);
  drawTimeline();
  // 管理态：先把旧版（键=下标）翻译成稳定 id，再跟 host 的 marks.json 对一次
  migrateMarks();
  syncMarksFromHost();
  /* ---------------- 回收站 / 清理 ----------------
     隐去是「我不想再看见」，不是「删掉」——所以必须给一条回来的路。
     清理则是反过来：先算一条规则会影响多少条，看清了再点，别一键把海清空。 */

  function mgTrashOpen() {
    mgFilter = 'hide';
    mgTab = 'list';
    mgPage = 240;
    var hv = document.getElementById('mghide');
    if (hv) hv.checked = true;
    renderMgmt();
  }

  /** 隐去了多少条 */
  function hidCount() {
    var c = 0;
    for (var i = 0; i < N; i++) if (marks.hide[nkey(i)]) c++;
    return c;
  }

  function mgRestoreAll() {
    var n0 = hidCount();
    if (!n0) return;
    if (!confirm('把隐去的 ' + n0 + ' 条全部恢复？')) return;
    marks.hide = {};
    saveMarks(); refreshFilter(); renderMgmt();
    mgToast('已恢复 ' + n0 + ' 条');
  }

  /** 清理规则：每条都先算出「会影响多少条」，让人自己决定 */
  function mgCleanRules() {
    var now = (SEA && SEA.t1) ? SEA.t1 : Date.now();
    var old = now - 30 * 864e5;
    var shortN = 0, oldN = 0, sysN = 0;
    var sysRe = /^(继续|好的|可以|嗯|行|收到|谢谢|11|ok|OK|好|是的|对|明白|知道了|稍等)$/;
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (n.src_ === 'sc') continue;
      if (marks.hide[nkey(i)]) continue;
      var t = (n.txt || '').trim();
      if (t && t.length <= 6 && sysRe.test(t)) shortN++;
      if ((n.t || 0) < old && !marks.star[nkey(i)] && !marks.note[nkey(i)]
          && !(marks.tag[nkey(i)] || []).length) oldN++;
      if (/^(［身份］|［统一人设卡|【当前时间】|【我的时间】)/.test(t)) sysN++;
    }
    return [
      { k: 'short', label: '隐去「继续 / 可以 / 11」这类填空话', n: shortN,
        hint: '六个字以内、且是纯应答——留着不占信息量，但会占满清单' },
      { k: 'old', label: '隐去 30 天前从未被标记过的', n: oldN,
        hint: '没收藏、没标签、没备注的旧记录；星图上仍然留着，从回收站能全部恢复' },
      { k: 'sys', label: '隐去重复注入的人设卡 / 时间卡', n: sysN,
        hint: '「［身份］」「【当前时间】」这类每次对话都塞一遍的模板，判重已经并过一部分' }
    ];
  }

  function mgCleanApply(k) {
    var rules = mgCleanRules();
    var rule = null;
    for (var i = 0; i < rules.length; i++) if (rules[i].k === k) rule = rules[i];
    if (!rule || !rule.n) return;
    if (!confirm('会隐去 ' + rule.n + ' 条。\n隐去不是删除，随时能在「回收站」恢复。继续？')) return;
    var now = (SEA && SEA.t1) ? SEA.t1 : Date.now();
    var old = now - 30 * 864e5;
    var sysRe = /^(继续|好的|可以|嗯|行|收到|谢谢|11|ok|OK|好|是的|对|明白|知道了|稍等)$/;
    var cnt = 0;
    for (var j = 0; j < N; j++) {
      var n = NODES[j];
      if (n.src_ === 'sc') continue;
      if (marks.hide[nkey(j)]) continue;
      var t = (n.txt || '').trim();
      var hit = false;
      if (k === 'short') hit = t && t.length <= 6 && sysRe.test(t);
      else if (k === 'old') hit = (n.t || 0) < old && !marks.star[nkey(j)] && !marks.note[nkey(j)]
        && !(marks.tag[nkey(j)] || []).length;
      else if (k === 'sys') hit = /^(［身份］|［统一人设卡|【当前时间】|【我的时间】)/.test(t);
      if (hit) { marks.hide[nkey(j)] = 1; cnt++; }
    }
    saveMarks(); refreshFilter(); renderMgmt();
    mgToast('隐去 ' + cnt + ' 条 · 在回收站能恢复');
  }

  function mgCleanPanel() {
    var old = document.getElementById('mgcleanp');
    if (old) { old.remove(); return; }
    var rules = mgCleanRules();
    var p = document.createElement('div');
    p.id = 'mgcleanp';
    var h = '<div class="mcp-h">清理 · 先看清会影响多少条</div>';
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      h += '<div class="mcp-r' + (r.n ? '' : ' off') + '" data-mcclean="' + r.k + '">'
        + '<b>' + r.label + '</b><i>' + r.n + ' 条</i>'
        + '<span>' + r.hint + '</span></div>';
    }
    h += '<div class="mcp-h mcp-f">隐去不是删除：全部能从「回收站」恢复。</div>';
    p.innerHTML = h;
    document.getElementById('mgmt').appendChild(p);
    p.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== p && !(t.getAttribute && t.getAttribute('data-mcclean'))) t = t.parentNode;
      if (!t || t === p) return;
      mgCleanApply(t.getAttribute('data-mcclean'));
      p.remove();
    });
  }

  // 整理页顶栏的导出 / 导入：和收藏夹里那两个是同一套动作，只是放在更显眼的地方
  (function () {
    var ex = document.getElementById('mgexp');
    var im = document.getElementById('mgimp');
    var fl = document.getElementById('shfile');
    if (ex) ex.onclick = function (ev) { ev.stopPropagation(); exportMarks(); };
    if (im) im.onclick = function (ev) {
      ev.stopPropagation();
      if (fl) fl.click();
    };
  })();

  (function bindTrashClean() {
    var tb = document.getElementById('mgtrash');
    var cb = document.getElementById('mgclean');
    if (tb) tb.onclick = function (ev) { ev.stopPropagation(); mgTrashOpen(); };
    if (cb) cb.onclick = function (ev) { ev.stopPropagation(); mgCleanPanel(); };
  })();

  // 时间入口：一进来先回答「看哪一段」，而不是让人对着一片星海发呆。
  // 数字是「全库」的条数（不受当前层/来源筛选影响），点了直接开那一段的回顾。
  (function () {
    var el = document.getElementById('tchips');
    if (!el) return;
    var now = (SEA && SEA.t1) ? SEA.t1 : Date.now();
    function todayStart() { var d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
    function cnt(from) {
      var c = 0;
      for (var i = 0; i < N; i++) {
        var n = NODES[i];
        if (n.src_ === 'sc') continue;
        if ((n.t || 0) >= from) c++;
      }
      return c;
    }
    var segs = [
      { k: 'today', label: '今天', from: todayStart() },
      { k: '7', label: '最近 7 天', from: now - 7 * 864e5 },
      { k: '30', label: '最近 30 天', from: now - 30 * 864e5 }
    ];
    var h = '';
    for (var j = 0; j < segs.length; j++) {
      var c = cnt(segs[j].from);
      if (!c && segs[j].k === 'today') continue;   // 今天还没说话就不显示，免得摆个 0
      h += '<span class="tc" data-rvopen="' + segs[j].k + '">' + segs[j].label + '<b>' + c + '</b></span>';
    }
    h += '<span class="tgo" data-rvopen="all">看这一段 →</span>';
    el.innerHTML = h;
    el.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== el && !t.getAttribute) t = t.parentNode;
      var k = t && t.getAttribute ? t.getAttribute('data-rvopen') : null;
      if (!k) return;
      rvPreset = k;
      openMgmt('review');
    });
  })();

  // texts.js 静默预载：不阻塞首屏，加载完自动补全详情与搜索
  if (SEA.tx && SEA.tx.chars > 0 && SEA.tx.chars < 5e6) setTimeout(loadTX, 800);
  setInterval(pollMarks, 8000);
  requestAnimationFrame(draw);

  // 调试入口：#demo 打开详情，#paper 切主题，#q=xxx 自动搜索（正式使用无影响）
  var hm = location.hash.match(/q=([^&]+)/);
  if (hm) {
    var qv = decodeURIComponent(hm[1]);
    qEl.value = qv;
    runSearch(qv);
  }
  var hh = location.hash.match(/hover=(\d+)/);
  if (hh) {
    var hidx = parseInt(hh[1], 10);
    if (hidx >= 0 && hidx < N) {
      hoverIdx = hidx; NODES[hidx].hlTarget = 1; NODES[hidx].hl = 1;
      showTip(hidx, w2sx(NODES[hidx].x), w2sy(NODES[hidx].y));
    }
  }
  if (location.hash.indexOf('shallow') >= 0 && theme === 'deep') document.getElementById('tk').click();
  if (location.hash.indexOf('noforget') >= 0) document.getElementById('fg').click();
  var hz = location.hash.match(/zone(\d)/);
  if (hz) {
    var zb = document.querySelector('#zonebar .zb[data-zone="' + hz[1] + '"]');
    if (zb) zb.click();
  }
  var hr = location.hash.match(/rot=(-?\d+)/);
  if (hr) {
    rotOn = false;
    rotBase = parseInt(hr[1], 10) * Math.PI / 180;
    rot = rotBase; rotTgt = rotBase;
  }
  var hp = location.hash.match(/pitch=(-?\d+)/);
  if (hp) {
    pitchBase = parseInt(hp[1], 10) * Math.PI / 180;
    pitch = pitchBase; pitchTgt = pitchBase;
  }

  // 性能探针：#bench 同步渲染 48 帧取均值（headless 里 rAF 被节流，只能同步测）
  if (location.hash.indexOf('bench') >= 0) {
    window.addEventListener('load', function () {
      try {
        for (var w = 0; w < 24; w++) { cam.x = camTarget.x; cam.y = camTarget.y; cam.s = camTarget.s; renderFrame(w * 16); }
        var t1 = performance.now();
        for (var q = 0; q < 48; q++) renderFrame(t1 + q * 16);
        var ms = (performance.now() - t1) / 48;
        document.title = 'BENCH ' + ms.toFixed(2) + 'ms ' + Math.round(1000 / ms) + 'fps';
      } catch (e) { document.title = 'BENCH ERR ' + e.message; }
    });
  }
  if (location.hash.indexOf('demo') >= 0) {
    detail.classList.add('instant');
    var pickIdx = 0;
    for (var d = 0; d < N; d++) if (NODES[d].th && NODES[d].k === 'image') { pickIdx = d; break; }
    selectNode(pickIdx);
    // 直接落到"推近"的终态，方便截图（真实交互由动画完成）
    viewAnim = null;
    var dn = NODES[pickIdx];
    var dca = Math.cos(rot), dsa = Math.sin(rot);
    var dcp = Math.cos(pitch), dsp = Math.sin(pitch);
    var dx1 = dn.x * dca - dn.z * dsa;
    var dz1 = dn.x * dsa + dn.z * dca;
    var dy1 = dn.y * dcp - dz1 * dsp;
    panShift = panShiftTgt = -196;
    cam.x = camTarget.x = dx1;
    cam.y = camTarget.y = dy1;
    cam.s = camTarget.s = 2.9;
  }
