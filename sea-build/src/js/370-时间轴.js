  // ================= 时间轴 =================
  var tl = document.getElementById('tlcanvas');
  var tlc = tl.getContext('2d');
  var TLH = 44;
  var drag = null;

  function buildHist() {
    var B = 90;
    var hist = new Array(B).fill(0);
    var span = SEA.t1 - SEA.t0 || 1;
    for (var i = 0; i < N; i++) {
      var b = Math.floor((NODES[i].t - SEA.t0) / span * B);
      if (b >= 0 && b < B) hist[b]++;
    }
    return hist;
  }
  var HIST = buildHist();

  function drawTimeline() {
    var w = tl.getBoundingClientRect().width;
    if (w < 10) return;
    var h = TLH;
    tl.width = Math.floor(w * DPR); tl.height = Math.floor(h * DPR);
    tlc.setTransform(DPR, 0, 0, DPR, 0, 0);
    tlc.clearRect(0, 0, w, h);

    var span = SEA.t1 - SEA.t0 || 1;
    var B = HIST.length;
    var maxv = Math.max.apply(null, HIST) || 1;
    var bw = w / B;
    for (var i = 0; i < B; i++) {
      var v = Math.pow(HIST[i] / maxv, 0.5);
      var bh = v * (h - 12);
      var x0 = i * bw;
      var tmid = SEA.t0 + (i + 0.5) / B * span;
      var inR = tmid >= timeRange[0] && tmid <= timeRange[1];
      tlc.fillStyle = inR
        ? (theme === 'deep' ? 'rgba(127,220,255,.62)' : 'rgba(255,190,140,.55)')
        : (theme === 'deep' ? 'rgba(127,220,255,.13)' : 'rgba(255,190,140,.13)');
      tlc.fillRect(x0 + 0.6, h - bh - 2, Math.max(1, bw - 1.2), bh);
    }

    // 整条基线
    tlc.fillStyle = theme === 'deep' ? 'rgba(127,220,255,.16)' : 'rgba(255,190,140,.16)';
    tlc.fillRect(0, h - 2, w, 1);

    // 选择窗两端把手
    var xa = (timeRange[0] - SEA.t0) / span * w;
    var xb = (timeRange[1] - SEA.t0) / span * w;
    var ac = theme === 'deep' ? 'rgba(255,196,106,.9)' : 'rgba(255,206,150,.9)';
    [xa, xb].forEach(function (x) {
      tlc.strokeStyle = ac;
      tlc.lineWidth = 1.4;
      tlc.beginPath(); tlc.moveTo(x, 3); tlc.lineTo(x, h - 1); tlc.stroke();
      tlc.fillStyle = ac;
      tlc.beginPath();
      tlc.arc(x, 8, 3, 0, 6.283);
      tlc.fill();
    });
  }

  function tlHit(clientX) {
    var r = tl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }

  tl.addEventListener('mousedown', function (e) {
    var t = tlHit(e.clientX);
    var span = SEA.t1 - SEA.t0 || 1;
    var pa = (timeRange[0] - SEA.t0) / span, pb = (timeRange[1] - SEA.t0) / span;
    drag = Math.abs(t - pa) < Math.abs(t - pb) ? 'a' : 'b';
    updateTime(t);
  });
  function updateTime(frac) {
    var span = SEA.t1 - SEA.t0 || 1;
    var v = SEA.t0 + frac * span;
    if (drag === 'a') timeRange[0] = Math.min(v, timeRange[1] - span * 0.02);
    else timeRange[1] = Math.max(v, timeRange[0] + span * 0.02);
    document.getElementById('tlfrom').textContent = fmtDay(timeRange[0]);
    document.getElementById('tlto').textContent = fmtDay(timeRange[1]);
    drawTimeline();
    refreshFilter();
  }
  window.addEventListener('mousemove', function (e) {
    if (drag) { updateTime(tlHit(e.clientX)); }
  });
  window.addEventListener('mouseup', function () { drag = null; });

  function fmtDay(t) {
    var d = new Date(t);
    var p = function (v) { return v < 10 ? '0' + v : '' + v; };
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
