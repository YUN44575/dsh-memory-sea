  // ================= 悬停拾取 =================
  var mouse = { x: -1, y: -1, down: false, moved: false, sx: 0, sy: 0, camx: 0, camy: 0, mode: 'pan', rot0: 0, pitch0: 0 };

  function pick(mx, my) {
    var best = -1, bestD = 1e9;
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!n.vis) continue;
      var sx = n.sx, sy = n.sy;
      if (sx < -1000) continue;
      var d = (sx - mx) * (sx - mx) + (sy - my) * (sy - my);
      if (d < bestD) { bestD = d; best = i; }
    }
    var limit = 20 + cam.s * 4;
    if (bestD > limit * limit) return -1;
    return best;
  }

  var tipEl = document.getElementById('tip');

  function showTip(idx, mx, my) {
    var n = NODES[idx];
    if (tipIdx !== idx) {
      tipIdx = idx;
      var im = document.getElementById('tipimg');
      if (n.th) { im.src = thumbURL(n.th); im.style.display = 'block'; }
      else { im.style.display = 'none'; }
      var txt = maskText((n.txt || '').replace(/\s+/g, ' ').trim());
      var ss = SESS[n.sid];
      if (n.k === 'image') {
        var ex = [];
        if (ss && ss.title) ex.push(ss.title);
        if (n.ic > 1) ex.push(n.ic + ' 张');
        if (ex.length) txt = ex.join(' · ');
      }
      document.getElementById('tiptext').textContent = txt || '（一段无声的记忆）';
      document.getElementById('tiptime').textContent = fmtDate(n.t) + ' · ' + kindName(n.k);
    }
    tipEl.classList.add('show');
    var x = mx + 18, y = my + 16;
    if (x + 240 > W) x = mx - 250;
    if (y + 200 > H) y = H - 210;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }
  var tipIdx = -1;

  function hideTip() { tipEl.classList.remove('show'); tipIdx = -1; }

  // 鼠标从星图上移到任何一块面板上时，画布这边收不到 mousemove（事件被面板接走了），
  // 悬停卡就僵在原地、正好挡住面板内容；悬停星的高亮也会一直留着。
  // 所以面板自己负责报"鼠标进来了"。
  (function () {
    ['detail', 'mgmt', 'shelf', 'srcpanel', 'today', 'review', 'bulk'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('mouseenter', function () {
        hideTip();
        if (hoverIdx >= 0) {
          var pn = NODES[hoverIdx];
          if (pn) pn.hlTarget = 0;
          hoverIdx = -1;
        }
      });
    });
  })();

  function kindName(k) { return k === 'image' ? '图像' : k === 'memory' ? '长期记忆' : '话语'; }
  function fmtDate(t) {
    var d = new Date(t);
    var p = function (v) { return v < 10 ? '0' + v : '' + v; };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
