  // ================= 搜索 =================
  var qEl = document.getElementById('q');
  var qTimer = null;
  qEl.addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { runSearch(qEl.value); }, 220);
  });

  function zoomToMatches(scores, th) {
    var sx = 0, sy = 0, c = 0;
    for (var i = 0; i < N; i++) {
      if (scores[i] > th) { sx += NODES[i].x; sy += NODES[i].y; c++; }
    }
    if (!c) return;
    camTarget.x = sx / c; camTarget.y = sy / c;
    camTarget.s = Math.max(camTarget.s, c < 6 ? 2.3 : 1.45);
  }
