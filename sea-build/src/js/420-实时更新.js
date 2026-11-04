  // ================= 实时更新 =================
  // 后端 watch.mjs 重建 data.js 后会写一个新的 version.js；这里轮询它
  var builtAt = SEA.builtAt;
  var CAM_KEY = 'sea.cam.v1';

  // 刷新前把视角存下来，回来时接着看
  function saveView() {
    try {
      sessionStorage.setItem(CAM_KEY, JSON.stringify({
        x: cam.x, y: cam.y, s: cam.s, rot: rot, pitch: pitch, theme: theme,
      }));
    } catch (e) {}
  }
  (function restoreView() {
    try {
      var raw = sessionStorage.getItem(CAM_KEY);
      if (!raw) return;
      sessionStorage.removeItem(CAM_KEY);
      var v = JSON.parse(raw);
      if (v.theme && v.theme !== theme) applyTheme(v.theme);
      cam.x = camTarget.x = v.x; cam.y = camTarget.y = v.y; cam.s = camTarget.s = v.s;
      rot = rotBase = rotTgt = v.rot; pitch = pitchBase = pitchTgt = v.pitch;
    } catch (e) {}
  })();

  function pollVersion() {
    var old = document.getElementById('_ver');
    if (old) old.remove();
    var sc = document.createElement('script');
    sc.id = '_ver';
    sc.src = 'version.js?_=' + Date.now();
    sc.onload = function () {
      var v = window.SEA_VER;
      if (v && String(v) !== String(builtAt)) {
        builtAt = v;
        var nb = document.getElementById('newver');
        if (nb) nb.classList.add('on');
      }
    };
    sc.onerror = function () {};
    document.body.appendChild(sc);
  }
  setInterval(pollVersion, 15000);
  // ---------- 往后看：拖动时间机器 ----------
  function applyFuture(days, hard) {
    futureDays = days;
    // 一次算好每条记忆 N 天后的清晰度（渲染每帧都要读，不能现算）
    for (var i0 = 0; i0 < N; i0++) {
      var n0 = NODES[i0];
      n0.futC = (days > 0 && n0.src_ === 'sc' && n0.k !== 'ghost') ? futureClarity(n0, days) : null;
    }
    recomputeRetention();
    refreshFilter();
    if (ringMode) ringSpan();
    var nx = document.getElementById('futN');
    if (nx) nx.textContent = days ? '+' + days + ' 天' : '现在';
    var fs = document.getElementById('futS');
    if (fs) {
      if (!days) {
        fs.textContent = '她按遗忘规则往下走：重要的留住，不重要的慢慢没了';
      } else {
        var alive = 0, gone = 0, ownerGone = 0;
        for (var i = 0; i < N; i++) {
          var n = NODES[i];
          if (n.src_ !== 'sc' || n.k === 'ghost') continue;
          var c = n.futC || futureClarity(n, days);
          if (c === 'forgotten') { gone++; if (n.owner) ownerGone++; }
          else if (CLAR_RANK[c] >= 2) alive++;
        }
        fs.textContent = '还记得 ' + alive + ' 条 · 忘掉 ' + gone + ' 条'
          + (ownerGone ? '（其中 ' + ownerGone + ' 条是主人说过、本该留住的事）' : '');
      }
    }
    if (dataSrc !== 'sc') {
      // 这套推演只对 SurfCore 的记忆卡有意义；DSH 那边没有淡忘规则
      var fb = document.getElementById('futbtn');
      if (fb) fb.style.opacity = '.45';
    }
  }
  function toggleFuture(on) {
    var box = document.getElementById('fut');
    if (!box) return;
    var next = on === undefined ? !box.classList.contains('on') : !!on;
    box.classList.toggle('on', next);
    if (next && dataSrc !== 'sc') applySrc('sc', true);
    if (!next) applyFuture(0, true);
    else applyFuture(parseInt(document.getElementById('futR').value, 10) || 30);
  }
  (function bindFuture() {
    // #fut 面板挂在 body 末尾，脚本跑到这儿它还没解析出来 —— 绑定要等 DOM 好了再做。
    function initFuture() {
    var fb = document.getElementById('futbtn');
    if (fb) fb.onclick = function () { toggleFuture(); };
    var rg = document.getElementById('futR');
    // 原来这里做了 80ms 节流，但节流器会吞掉中间值、松手前画面不动 —— 拖起来就是「不实时」。
    // futureClarity 现在 O(1)（见那里的说明），applyFuture 一次 1~2ms，直接同步跑就好。
    if (rg) rg.oninput = function () {
      applyFuture(parseInt(rg.value, 10) || 0);
    };
    if (rg) rg.onchange = function () { applyFuture(parseInt(rg.value, 10) || 0, true); renderSessionList(); };
    var fx = document.getElementById('futX');
    if (fx) fx.onclick = function () { toggleFuture(false); };
    var rb = document.getElementById('ringbtn');
    if (rb) rb.onclick = function () { applyRing(!ringMode); };

    // 说明卡可以折叠：默认只剩一行标题，点开才铺开
    var _rn = document.getElementById('ringNote');
    if (_rn) {
      var _rnh = _rn.querySelector('.rh');
      if (_rnh) _rnh.onclick = function () { _rn.classList.toggle('folded'); };
    }

    var pb = document.getElementById('posterbtn');
    if (pb) pb.onclick = function () { exportPoster(); };

    var ob = document.getElementById('ovlbtn');
    if (ob) ob.onclick = function () {
      overlapOn = !overlapOn;
      // 和年轮互斥：两个都是重排投影，同时开会把年轮压成椭圆
      if (overlapOn && ringMode) applyRing(false);
      ob.classList.toggle('on', overlapOn);
      activeSid = -1;
      closeDetail();
      recomputeRetention();
      refreshFilter();
      renderSessionList();
      if (overlapOn) {
        // 两片海并排，得退远一点才装得下
        cam.x = 0; cam.y = 0; cam.s = 0.70;
        camTarget.x = 0; camTarget.y = 0; camTarget.s = 0.70;
      }
    };

    var eb = document.getElementById('emobtn');
    if (eb) eb.onclick = function () {
      emoMode = !emoMode;
      eb.classList.toggle('on', emoMode);
      if (emoMode && dataSrc !== 'sc') applySrc('sc', true);
      refreshFilter();
      renderSessionList();
    };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initFuture);
    else initFuture();
  })();

  var nvEl = document.getElementById('newver');
  if (nvEl) nvEl.onclick = function (e) {
    e.preventDefault();
    saveView();
    location.reload();
  };

  // 调试出口（不影响正式使用，供自动化脚本读取内部状态）
  window.__T = {
    // 调试：直接摆姿势（拖拽等价物）
    setPose: function (v) { rot = rotBase = rotTgt = v.rot; pitch = pitchBase = pitchTgt = v.pitch; },
    get rot() { return rot; },
    get pitch() { return pitch; },
    N: N, NODES: NODES, SESS: SESS, SEA: SEA, cam: cam, camTarget: camTarget,
    futureSet: function (d) { return applyFuture(d, true); },
    poster: function () { return exportPoster('dataurl'); },
    get futureDays() { return futureDays; },
    gasMean: function () {
      var g = gasC.getContext('2d');
      var d = g.getImageData(0, 0, gasC.width, gasC.height).data, t = 0;
      for (var i = 3; i < d.length; i += 4) t += d[i];
      return t / (d.length / 4);
    },
    mask: maskInfo,
    runSearch: function (s) { return runSearch(s); },
    refreshFilter: function () { return refreshFilter(); },
    selectNode: function (i) { return selectNode(i); },
    closeDetail: function () { return closeDetail(); },
    thumbURL: function (h) { return thumbURL(h); },
    renderFrame: function (t) { return renderFrame(t); },
    get theme() { return theme; },
    get activeSid() { return activeSid; },
    get visN() { return visN; },
    get zoneFilter() { return zoneFilter; },
    get sessZone() { return sessZone; },
    get marks() { return marks; },
    get timeRange() { return timeRange; },
    set timeRange(v) { timeRange = v; },
    // 来源维度（测试用）
    get srcOn() { return srcOn; },
    srcFiltering: function () { return srcFiltering(); },
    renderSrcPanel: function () { return renderSrcPanel(); },
    srcCounts: function () {
      var o = {};
      for (var i = 0; i < SRC_DEF.length; i++) o[SRC_DEF[i].k] = srcCount(SRC_DEF[i].k);
      return o;
    },
    get sys() { return SYS; },
    get proc() { return PROC; }
  };

  // 顶栏高度不是常数（窗口窄了会折行、引导/时间入口那行也在变），
  // 左栏得跟着它走，否则一折行就被压住。
  function measureTopbar() {
    var tb = document.getElementById('topbar');
    if (!tb) return;
    var h = Math.round(tb.getBoundingClientRect().height);
    if (h > 20) document.documentElement.style.setProperty('--tb-h', (h + 18) + 'px');
  }
  measureTopbar();
  setTimeout(measureTopbar, 300);
  setTimeout(measureTopbar, 1400);

  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { resize(); drawTimeline(); measureTopbar(); }, 120);
  });

  bindShelfTools();
  bindBulk();
  bindReview();
  bindTagInput();
  renderSessionList();
  saveMarks();
  refreshFilter();

  setTimeout(function () { document.getElementById('hint').classList.add('out'); }, 7000);

  // 高亮缓动
  setInterval(function () {
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      var tgt = n.hlTarget || 0;
      if (n.hl !== tgt) n.hl += (tgt - n.hl) * 0.22;
      else n.hlTarget = tgt;
    }
  }, 40);

})();