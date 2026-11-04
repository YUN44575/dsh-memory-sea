  // ================= 创意 4：年轮 =================
  // 同样的星，换成「以现在为圆心、往外一圈一圈是更早的日子」的摆法。
  // 不建新数据结构：只改投影时的坐标，其它（云、线、缩略图）全都不动。
  var ringMode = false;
  var ringUnit = 0.10;       // 一天多少半径（applyRing 里按数据跨度算）
  var ringMaxDays = 1;

  // 年轮的一圈有多宽：按当前看得见的星里最老的那颗算
  function ringSpan() {
    var mx = 0;
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!n.vis) continue;
      var ag = Math.max(0, (dataNow - (n.t || dataNow)) / DAY);
      if (ag > mx) mx = ag;
    }
    ringMaxDays = Math.max(1, mx);
    ringUnit = 0.96 / ringMaxDays;
    var se = document.getElementById('ringStep');
    if (se) se.textContent = String(Math.max(1, Math.ceil(ringMaxDays / 5)));
  }

  function applyRing(on) {
    // 年轮和重叠都是重排投影，同时开会互相破坏（圆被压成椭圆、桥线乱穿），所以互斥
    if (on && overlapOn) {
      overlapOn = false;
      var ob0 = document.getElementById('ovlbtn');
      if (ob0) ob0.classList.remove('on');
      refreshFilter();
      renderSessionList();
    }
    ringMode = !!on;
    var b = document.getElementById('ringbtn');
    if (b) b.classList.toggle('on', ringMode);
    var note = document.getElementById('ringNote');
    if (note) note.classList.toggle('on', ringMode);
    document.body.classList.toggle('ring-mode', ringMode);
    closeDetail();
    ringSpan();
    if (ringMode) {
      // 俯视看，圈才是圆
      cam.x = 0; cam.y = 0; cam.s = 1.0;
      camTarget.x = 0; camTarget.y = 0; camTarget.s = 1.0;
      startViewAnim({ rot: 0, pitch: 0, s: 1.0, x: 0, y: 0 }, 640);
    }
    refreshFilter();
  }

  // 年轮参考圈：每 7 天一圈
  function drawRings(time) {
    if (!ringMode) return;
    // 圈间距跟着跨度走：一共画 5 圈左右，太密反而糊
    var step = Math.max(1, Math.ceil(ringMaxDays / 5));
    var nRings = Math.ceil(ringMaxDays / step);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var ri = 1; ri <= nRings; ri++) {
      var days = ri * step;
      if (days > ringMaxDays + 0.5) break;
      var rr = Math.min(1.02, days * ringUnit);
      var a0 = (ri % 2 === 0) ? 0.16 : 0.10;
      ctx.globalAlpha = a0;
      ctx.strokeStyle = theme === 'deep' ? 'rgba(190,215,240,1)' : 'rgba(255,210,180,1)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (var k = 0; k <= 96; k++) {
        var th = k / 96 * 6.2832;
        var pp = projPoint(Math.cos(th) * rr, Math.sin(th) * rr);
        if (k === 0) ctx.moveTo(pp.x, pp.y); else ctx.lineTo(pp.x, pp.y);
      }
      ctx.stroke();
      // 圈上标一句「几天前」——放在右下斜角，避开顶部的搜索框和右上角的说明卡
      var lp = projPoint(Math.cos(0.72) * rr, Math.sin(0.72) * rr);
      var d = new Date(dataNow - days * DAY);
      var lbl = (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + days + ' 天前';
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = theme === 'deep' ? 'rgba(210,228,246,1)' : 'rgba(255,226,204,1)';
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillText(lbl, lp.x, lp.y + 12);
    }
    // 圆心：现在
    var c0 = projPoint(0, 0);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = theme === 'deep' ? 'rgba(255,214,150,1)' : 'rgba(255,206,166,1)';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('现在', c0.x, c0.y + 26);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(c0.x, c0.y, 3.2, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 深度亮度：远端更暗，制造体积感
  function depthDim(persp) {
    var v = (persp - 0.70) / 1.05;
    return 0.68 + 0.32 * (v < 0 ? 0 : v > 1 ? 1 : v);
  }
