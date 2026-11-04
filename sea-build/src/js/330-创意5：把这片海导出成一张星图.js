  // ================= 创意 5：把这片海导出成一张星图 =================
  // 竖版 1080×1440：上半是此刻的星图（当前视角的中心方区），下半是几行字。
  function posterStats() {
    var vis = 0, deep = 0, shal = 0, sc = 0, dsh = 0, cmp = 0;
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!n.vis) continue;
      vis++;
      if (n.src_ === 'sc') sc++; else dsh++;
      if (n.src_ === 'sc') { if (n.R >= DEEP_R) deep++; else shal++; }
      if (n.dm === 1) cmp++;
    }
    return { vis: vis, deep: deep, shal: shal, sc: sc, dsh: dsh, cmp: cmp };
  }

  function exportPoster(mode) {
    var cvSea = document.getElementById('sea');
    var S = posterStats();
    var PW = 1080, PH = 1440;
    var pc = document.createElement('canvas');
    pc.width = PW; pc.height = PH;
    var p = pc.getContext('2d');

    // 底：跟当前主题同一个色系
    var g = p.createLinearGradient(0, 0, PW * 0.4, PH);
    if (theme === 'deep') {
      g.addColorStop(0, '#0a1018'); g.addColorStop(0.55, '#0d1a26'); g.addColorStop(1, '#140f1c');
    } else {
      g.addColorStop(0, '#150f1c'); g.addColorStop(0.55, '#1d1420'); g.addColorStop(1, '#241a29');
    }
    p.fillStyle = g;
    p.fillRect(0, 0, PW, PH);

    // 星图：当前画布等比缩到 1080 宽，居中放在上半部
    var iw = cvSea.width, ih = cvSea.height;
    var tw = PW, th = Math.round(tw * ih / iw);
    var ty = 236 + Math.round((720 - th) / 2);
    // 先画到临时画布，再用 destination-out 把上下擦成渐隐 —— 直接往海报上盖色条会留边
    var tc = document.createElement('canvas');
    tc.width = tw; tc.height = th;
    var tcx = tc.getContext('2d');
    tcx.drawImage(cvSea, 0, 0, iw, ih, 0, 0, tw, th);
    tcx.globalCompositeOperation = 'destination-out';
    var gm = tcx.createLinearGradient(0, 0, 0, th);
    gm.addColorStop(0, 'rgba(0,0,0,1)');
    gm.addColorStop(0.15, 'rgba(0,0,0,0)');
    gm.addColorStop(0.85, 'rgba(0,0,0,0)');
    gm.addColorStop(1, 'rgba(0,0,0,1)');
    tcx.fillStyle = gm;
    tcx.fillRect(0, 0, tw, th);
    p.save();
    p.globalAlpha = 0.96;
    p.drawImage(tc, 0, ty);
    p.restore();

    var ink = theme === 'deep' ? '#e8eef8' : '#f7ecdf';
    var dim = theme === 'deep' ? 'rgba(200,216,238,.62)' : 'rgba(240,214,190,.60)';
    var gold = theme === 'deep' ? '#ffcf8a' : '#ffb98a';

    // 标题
    p.fillStyle = ink;
    p.font = '600 54px "Microsoft YaHei", "PingFang SC", sans-serif';
    p.textBaseline = 'alphabetic';
    p.fillText('记忆意识海', 84, 132);
    p.fillStyle = dim;
    p.font = '400 22px "Microsoft YaHei", sans-serif';
    p.fillText('MEMORY SEA', 86, 172);

    // 日期（右上）
    var d = new Date();
    var ds = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    p.textAlign = 'right';
    p.fillStyle = dim;
    p.font = '400 26px "Microsoft YaHei", sans-serif';
    p.fillText(ds, PW - 84, 132);
    p.font = '400 18px "Microsoft YaHei", sans-serif';
    p.fillText(theme === 'deep' ? '深海' : '暮色', PW - 84, 166);
    p.textAlign = 'left';

    // 细分割线
    p.strokeStyle = theme === 'deep' ? 'rgba(150,190,230,.22)' : 'rgba(255,200,160,.22)';
    p.lineWidth = 1;
    p.beginPath(); p.moveTo(84, 200); p.lineTo(PW - 84, 200); p.stroke();

    // 下半：数字
    var baseY = 1052;
    p.fillStyle = gold;
    p.font = '600 68px "Microsoft YaHei", sans-serif';
    var numW = p.measureText(String(S.vis)).width;
    p.fillText(String(S.vis), 84, baseY);
    p.fillStyle = dim;
    p.font = '400 24px "Microsoft YaHei", sans-serif';
    p.fillText('颗星在这片海里', 84 + numW + 14, baseY);

    var lines = [];
    if (dataSrc === 'sc' || overlapOn) {
      lines.push('记得 ' + S.deep + ' · 正在淡忘 ' + S.shal);
      if (overlapOn) lines.push('DSH ' + S.dsh + ' 段 · 她的记忆 ' + S.sc);
    } else {
      lines.push('工作 ' + (S.vis - S.cmp) + ' · 陪伴 ' + S.cmp);
    }
    p.fillStyle = dim;
    p.font = '400 26px "Microsoft YaHei", sans-serif';
    for (var li = 0; li < lines.length; li++) {
      p.fillText(lines[li], 84, 1112 + li * 42);
    }

    // 底注
    p.strokeStyle = theme === 'deep' ? 'rgba(150,190,230,.14)' : 'rgba(255,200,160,.14)';
    p.beginPath(); p.moveTo(84, PH - 132); p.lineTo(PW - 84, PH - 132); p.stroke();
    p.fillStyle = dim;
    p.font = '400 19px "Microsoft YaHei", sans-serif';
    p.fillText('意识海 · 由 DSH 会话与 SurfCore 记忆卡生成', 84, PH - 92);

    if (mode === 'dataurl') return pc.toDataURL('image/png');

    // 先弹预览，再让用户点「保存 PNG」。
    // 之前直接 a.click() 自动下载，有人遇到过点了没反应（浏览器拦、或 file:// 下不给下），
    // 变成"看不到任何反馈"；现在至少图能看见，右键也能存。
    var durl = null;
    try { durl = pc.toDataURL('image/png'); } catch (e) { durl = null; }
    var pv = document.getElementById('pv');
    var pimg = document.getElementById('pvimg');
    var tip = document.getElementById('newver');
    var say = function (msg) {
      if (!tip) return;
      tip.textContent = msg;
      tip.classList.add('on');
      clearTimeout(say._t);
      say._t = setTimeout(function () { tip.classList.remove('on'); }, 3600);
    };
    if (!durl) { say('星图没生成出来，再点一次试试'); return; }
    if (!pv || !pimg) { say('星图没能显示，试试再点一次'); return; }
    window.__lastPoster = durl;
    pimg.src = durl;
    pv.classList.add('on');
    if (!pv.__bound) {
      pv.__bound = 1;
      document.getElementById('pvdl').onclick = function () {
        var a = document.createElement('a');
        var now = new Date();
        a.download = '意识海-' + now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0')
          + String(now.getDate()).padStart(2, '0') + '-' + String(now.getHours()).padStart(2, '0')
          + String(now.getMinutes()).padStart(2, '0') + '.png';
        a.href = document.getElementById('pvimg').src;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { a.remove(); }, 4000);
        say('正在保存… 没反应就右键图片');
      };
      document.getElementById('pvx').onclick = function () { pv.classList.remove('on'); };
      pv.onclick = function (e) { if (e.target === pv) pv.classList.remove('on'); };

    }
  }

  document.getElementById('morebtn').onclick = function () {
    var t = document.getElementById('tools');
    t.classList.toggle('open');
    this.classList.toggle('on', t.classList.contains('open'));
  };
