  // ================= 背景星尘 =================
  var stars = [];
  function buildStars() {
    stars = [];
    var n = Math.round(W * H / 5200);
    for (var i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.05 + 0.25,
        a: Math.random() * 0.5 + 0.12,
        ph: Math.random() * 6.283,
        sp: Math.random() * 0.6 + 0.2
      });
    }
  }
