  // ================= 顶部按钮 =================
  function applyTheme(t) {
    theme = t;
    TH = THEMES[theme];
    document.body.setAttribute('data-theme', theme);
    document.getElementById('tk').textContent = layerWord(theme === 'deep');
    document.getElementById('tk').title = layerHint(theme === 'deep');
    buildSprites();
    renderBg();
    drawTimeline();
    refreshFilter();
    renderSessionList();
    // 深海的星很少（真正的长期记忆只有十几颗），切过去先把镜头送到它们身上
    if (TH.layer === 'deep' && !relatedSet && !matchScores) {
      var visNow = 0;
      for (var vi = 0; vi < N; vi++) if (NODES[vi].vis) visNow++;
      if (visNow > 0 && visNow < 80) zoomToZone(-1);
    }
    drawNeeded = true;
  }
  function requestTheme(t) {
    if (t === theme && !layerTrans) return;
    layerTrans = { t0: performance.now(), dur: 420, next: t, phase: 'out' };
    if (window.__LTLOG) window.__LTLOG.push([Math.round(performance.now()), t]);
  }
  document.getElementById('tk').onclick = function () {
    requestTheme(theme === 'deep' ? 'shallow' : 'deep');
  };

  // 今天：最近 24 小时的一条带子
  document.getElementById('todaybtn').onclick = function () { toggleToday(); };
