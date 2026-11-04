  // ================= 键盘 =================
  // Esc 只退「上一级」：先关最上面那层浮层，一层一层往回退，
  // 全都关干净了才通知外层（插件里就是回到 DSH）。
  function escBack() {
    var el;
    el = document.getElementById('pv');
    if (el && el.classList.contains('on')) { el.classList.remove('on'); return 'poster'; }
    el = document.getElementById('guide');
    if (el && el.classList.contains('open')) { el.classList.remove('open'); return 'guide'; }
    if (shelfOpen) { toggleShelf(); return 'shelf'; }
    el = document.getElementById('results');
    if (el && el.classList.contains('open')) { hideResults(); return 'results'; }
    if (review && review.on) { stopReview(); return 'review'; }
    if (selIdx >= 0) { closeDetail(); return 'detail'; }
    el = document.getElementById('fut');
    if (el && el.classList.contains('on')) { toggleFuture(false); return 'future'; }
    el = document.getElementById('tools');
    if (el && el.classList.contains('open')) { document.getElementById('morebtn').click(); return 'tools'; }
    if (activeSid >= 0) {
      activeSid = -1; buildConstellation(-1); renderSessionList(); refreshFilter(); flyToSession(-1);
      return 'session';
    }
    if (ringMode) { applyRing(false); return 'ring'; }
    return null;
  }
  window.__escBack = escBack;

  // 外层（插件）把 Esc 转发进来时走同一套分级逻辑；退不动了才让它关掉整个意识海
  window.addEventListener('message', function (e) {
    if (e.data !== 'sea:esc') return;
    if (!escBack()) {
      try { window.parent.postMessage('sea:exit', '*'); } catch (err) {}
    }
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var done = escBack();
      if (done) { e.preventDefault(); return; }
      // 一级都退不动了 —— 交给外层：插件里是「回到 DSH」，单独打开时什么也不做
      try { window.parent.postMessage('sea:exit', '*'); } catch (err) {}
      qEl.blur();
    }
    if (e.key === '/' && document.activeElement !== qEl) { e.preventDefault(); qEl.focus(); }
  });
