  // ================= 画布 =================
  var cv = document.getElementById('sea');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1;

  function resize() {
    if (window.__RLOG) window.__RLOG.push([Math.round(performance.now()), window.innerWidth, window.innerHeight, window.devicePixelRatio]);
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    // 画布总像素封顶。高分屏（缩放 150% 之类）下 canvas 会到 370 万像素，
    // 每帧整屏重绘 → 浏览器合成压力大，表现就是画面整屏黑一下。
    // 封到 240 万像素，肉眼看不出差别，但帧就稳了。
    var MAXPX = 1600000;
    if (W * H * DPR * DPR > MAXPX) {
      DPR = Math.max(1, Math.sqrt(MAXPX / (W * H)));
    }
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars();
    renderBg();
    K = baseScale();
    rebuildGrid();
    posDirty = true;
  }
