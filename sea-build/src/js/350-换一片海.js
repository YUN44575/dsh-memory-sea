  // ================= 换一片海 =================
  // DSH 会话（1206 颗）和 SurfCore 记忆卡（251 条）是两套数据，各自归一化到单位圆，
  // 同一时刻只渲染一套：切换 = 换 SEA 引用 + 过滤 + 相机复位。
  function applySrc(src, silent) {
    if (src === 'sc' && !SCSEA) return;
    dataSrc = src;
    SEA = (src === 'sc') ? SCSEA : DSHSEA;
    timeRange = [SEA.t0, SEA.t1];
    dataNow = SEA.t1;
    TNOW = dataNow;
    travelOn = false; travelPaused = false; travelNow = 0;
    var tvb = document.getElementById('tvtoggle');
    if (tvb) tvb.textContent = '⏩ 时间';
    document.body.setAttribute('data-src', src);
    var sb = document.getElementById('srcbtn');
    if (sb) {
      sb.textContent = src === 'sc' ? 'SurfCore 记忆' : 'DSH 会话';
      sb.title = src === 'sc' ? '现在看的是 SurfCore 记忆卡 · 点一下换回 DSH 会话'
                             : '现在看的是 DSH 会话 · 点一下换成 SurfCore 记忆卡';
    }
    if (src === 'sc') zoneFilter = -1;
    // 两套数据的「层」叫法不同（深层/浅层 vs 近岸/远洋），换海时按钮和说明要跟着换
    var tkb = document.getElementById('tk');
    if (tkb) {
      tkb.textContent = layerWord(theme === 'deep');
      tkb.title = layerHint(theme === 'deep');
    }
    syncZoneButtons();
    activeSid = -1;
    try { localStorage.setItem('sea.src.v1', src); } catch (e) {}
    for (var i5 = 0; i5 < N; i5++) NODES[i5].R = retentionOf(NODES[i5]);
    buildRetentionRank(true);
    // 换海之前先把上一片海的搜索收掉，不然结果面板里还是另一套数据
    try {
      var _se = document.getElementById('q');
      if (_se && _se.value) { _se.value = ''; runSearch(''); }
    } catch (e) {}
    refreshFilter();
    renderSessionList();
    drawTimeline();
    document.getElementById('tlfrom').textContent = fmtDay(SEA.t0);
    document.getElementById('tlto').textContent = fmtDay(SEA.t1);
    document.getElementById('tagbar').hidden = !!tagFilter ? false : true;
    updateTagBar();
    if (!silent) {
      cam.x = camTarget.x = 0; cam.y = camTarget.y = 0;
      cam.s = camTarget.s = 1.02;
      closeDetail();
    }
  }

  document.getElementById('srcbtn').onclick = function () {
    applySrc(dataSrc === 'sc' ? 'dsh' : 'sc');
  };

  // 海域切换：全部 / 工作海 / 陪伴海（左侧会话列表跟着换）
  Array.prototype.forEach.call(document.querySelectorAll('#zonebar .zb'), function (btn) {
    if (btn.id === 'srcbtn' || btn.id === 'helpbtn') return;   // 这两个按钮有自己的 onclick，别覆盖
    btn.onclick = function () {
      zoneFilter = parseInt(btn.getAttribute('data-zone'), 10);
      syncZoneButtons();
      // 原来选中的会话不属于新海域，就取消选中
      if (activeSid >= 0 && zoneFilter >= 0 && sessZone[activeSid] !== zoneFilter) activeSid = -1;
      refreshFilter();          // 先算好可见集合，列表才知道每段会话在这一层还剩几颗
      renderSessionList();
      // 切到某片海时飞过去看
      if (zoneFilter >= 0) zoomToZone(zoneFilter);
      else { camTarget.x = 0; camTarget.y = 0; camTarget.s = 1.02; }
    };
  });

  function zoomToZone(z) {
    var xs = [], ys = [], c = 0;
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!n.vis) continue;
      xs.push(n.x); ys.push(n.y); c++;
    }
    if (!c) return;
    // 按这片海的实际范围取景：陪伴海只有 33 颗、分布很窄，用固定 1.35 倍看就是一片空
    // 取 12%~88% 分位而不是极端包围盒——总有一两颗离群的星，会把镜头顶得远远的
    xs.sort(function (a, b) { return a - b; });
    ys.sort(function (a, b) { return a - b; });
    var q = function (arr, t) { return arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * t)))]; };
    var x0 = q(xs, 0.12), x1 = q(xs, 0.88), y0 = q(ys, 0.12), y1 = q(ys, 0.88);
    var hw = Math.max(0.10, (x1 - x0) / 2), hh = Math.max(0.08, (y1 - y0) / 2);
    var kk = K || 1;
    var fitW = (W * 0.66) / (hw * 2 * kk);
    var fitH = (H * 0.64) / (hh * 2 * kk);
    // 工作海几乎是全部记忆，推近了反而丢了「整片海」的感觉，只允许轻微近一点
    var capS = c > 400 ? 1.12 : (c > 150 ? 1.55 : 2.35);
    camTarget.x = q(xs, 0.5);
    camTarget.y = q(ys, 0.5);
    camTarget.s = Math.max(1.02, Math.min(capS, Math.min(fitW, fitH)));
  }

  // 遗忘曲线开关
  var fgBtn = document.getElementById('fg');
  fgBtn.onclick = function () {
    forgetOn = !forgetOn;
    fgBtn.classList.toggle('on', forgetOn);
    countVisible();
  };
