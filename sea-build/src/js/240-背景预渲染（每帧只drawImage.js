  // ================= 背景预渲染（每帧只 drawImage 一次） =================
  var bgc = document.createElement('canvas');
  function renderBg() {
    bgc.width = Math.max(1, Math.floor(W * DPR));
    bgc.height = Math.max(1, Math.floor(H * DPR));
    var x = bgc.getContext('2d');
    x.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = x.createRadialGradient(W * 0.52, H * 0.46, 0, W * 0.52, H * 0.46, Math.max(W, H) * 0.82);
    g.addColorStop(0, TH.bg2);
    g.addColorStop(0.52, TH.bg1);
    g.addColorStop(1, TH.bg0);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    for (var nb = 0; nb < 3; nb++) {
      var nx = W * (0.24 + nb * 0.26);
      var ny = H * (0.30 + (nb % 2) * 0.38);
      var nr = Math.max(W, H) * (0.36 + nb * 0.1);
      var ng = x.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, TH.neb[nb]);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = ng;
      x.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }
    if (theme === 'shallow') {
      // 暮色：太阳已经落到海平线下面去了，只在那一带留一点余温
      var sunX = W * 0.52, sunY = H * 1.04;
      var sun = x.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(W, H) * 0.92);
      sun.addColorStop(0, 'rgba(255,168,104,0.22)');
      sun.addColorStop(0.28, 'rgba(214,116,98,0.13)');
      sun.addColorStop(0.60, 'rgba(144,84,126,0.08)');
      sun.addColorStop(1, 'rgba(112,66,132,0)');
      x.fillStyle = sun;
      x.fillRect(0, 0, W, H);
      // 海平线：一条横着的暖光带，「天上的光」和「海里的星」因此分开
      var gy = H * 0.72, gh2 = H * 0.24;
      var sheen = x.createLinearGradient(0, gy - gh2 / 2, 0, gy + gh2 / 2);
      sheen.addColorStop(0, 'rgba(255,186,140,0)');
      sheen.addColorStop(0.5, 'rgba(255,182,136,0.10)');
      sheen.addColorStop(1, 'rgba(255,186,140,0)');
      x.fillStyle = sheen;
      x.fillRect(0, gy - gh2 / 2, W, gh2);
      // 天顶压暗：没有天顶光，星才浮得出来
      var top = x.createLinearGradient(0, 0, 0, H * 0.46);
      top.addColorStop(0, 'rgba(8,5,12,0.66)');
      top.addColorStop(1, 'rgba(8,5,12,0)');
      x.fillStyle = top;
      x.fillRect(0, 0, W, H * 0.46);
    }
  }
