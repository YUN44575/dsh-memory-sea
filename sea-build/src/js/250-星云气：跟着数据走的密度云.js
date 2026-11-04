  // ================= 星云气：跟着数据走的密度云 =================
  // 每颗星都往一张 1/4 分辨率的小画布上砸一团极淡的气，再整张放大贴回来。
  // 记忆密的地方自然积成云、稀的地方留白 —— 海因此有「体量」，而不是一张点阵图。
  var gasC = document.createElement('canvas');
  var GAS_S = 4;
  var gasW = 0, gasH = 0;
  // 一团分层噪声：垫在云气上做「暗尘带」。没有它，云就是一团均匀的牛奶。
  var gasNoise = (function () {
    var SZ = 512;
    var cv = document.createElement('canvas');
    cv.width = cv.height = SZ;
    var cx = cv.getContext('2d');
    var img = cx.createImageData(SZ, SZ);
    var d = img.data;
    var seed = 0x5ea51;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var octs = [];
    var freqs = [3, 6, 11, 23, 47];
    var amps = [0.44, 0.27, 0.16, 0.09, 0.04];
    for (var oi = 0; oi < freqs.length; oi++) {
      var mask = new Float64Array(freqs[oi] * freqs[oi]);
      for (var mi = 0; mi < mask.length; mi++) mask[mi] = rnd();
      octs.push({ f: freqs[oi], a: amps[oi], m: mask });
    }
    function smp(oc, x, y) {
      var n = oc.f, m = oc.m;
      var fx = x * n, fy = y * n;
      var x0 = Math.floor(fx), y0 = Math.floor(fy);
      var tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      x0 = ((x0 % n) + n) % n; y0 = ((y0 % n) + n) % n;
      var v00 = m[y0 * n + x0], v10 = m[y0 * n + x1], v01 = m[y1 * n + x0], v11 = m[y1 * n + x1];
      return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    }
    for (var y = 0; y < SZ; y++) {
      for (var x = 0; x < SZ; x++) {
        var s = 0;
        for (var oi2 = 0; oi2 < octs.length; oi2++) s += smp(octs[oi2], x / SZ, y / SZ) * octs[oi2].a;
        var a = 0.18 + 0.92 * Math.max(0, Math.min(1, (s - 0.26) * 2.3));
        var k4 = (y * SZ + x) * 4;
        d[k4] = 255; d[k4 + 1] = 255; d[k4 + 2] = 255; d[k4 + 3] = a > 1 ? 255 : Math.round(a * 255);
      }
    }
    cx.putImageData(img, 0, 0);
    return cv;
  })();
  function renderGas(time) {
    gasW = Math.max(1, Math.ceil(W / GAS_S));
    gasH = Math.max(1, Math.ceil(H / GAS_S));
    if (gasC.width !== gasW || gasC.height !== gasH) { gasC.width = gasW; gasC.height = gasH; }
    var gc = gasC.getContext('2d');
    gc.setTransform(1, 0, 0, 1, 0, 0);
    gc.clearRect(0, 0, gasW, gasH);
    gc.globalCompositeOperation = 'lighter';
    var sp = sprites.gas, spC = sprites.gasC, spV = sprites.gasV, spT = sprites.gasT;
    // 只看一小撮记忆时（陪伴海 33 颗、搜索结果几十条），按全量浓度画就只剩几缕烟；
    // 用可见数量把云气补浓，小海域也能看到一朵粉色的云。
    var gasBoost = Math.max(1, Math.min(6.0, 160 / Math.max(1, visN)));
    for (var gi = 0; gi < N; gi++) {
      var gn = NODES[gi];
      if (!gn.vis) continue;
      var gwt = (isDeepLayer(gn) ? 0.032 : 0.020) * gasBoost;
      if (overlapOn) gwt *= 0.55;   // 两片海挤在一个画面里，云浓了会把星糊掉
      if (gn.dm === 1) gwt *= 1.25;            // 陪伴海只有 33 颗，气要更实一点才看得出粉
      // 搜索时命中的星烧起来，没命中的那片海留一层很淡的底（不抠掉，不然画面像被挖空）
      if (matchScores && !gn.matched) gwt *= 0.12;
      // 往后看：忘掉的那些，连它周围的云也散了 —— 记忆少了，海也该瘦下去
      if (gn.futC === 'forgotten') continue;
      if (gn.futC === 'trace') gwt *= 0.35;
      else if (gn.futC === 'fuzzy') gwt *= 0.68;
      // 点了某段对话：星会自己压暗来突出这一段，云气就别跟着一起熄，留 0.62 保住海的体量
      if (activeSid >= 0 && gn.sid !== activeSid) gwt *= 0.62;
      if (gwt < 0.003) continue;
      var gx = gn.sx / GAS_S, gy = gn.sy / GAS_S;
      var gsz = (30 + 11 * gn.persp) * (0.72 + 0.36 * (gn.R || 0.6)) * (1 + 0.30 * (gasBoost - 1));
      if (gx < -gsz || gx > gasW + gsz || gy < -gsz || gy > gasH + gsz) continue;
      gc.globalAlpha = Math.min(0.4, gwt);
      // 色相按节点序号铺开（确定性）：大部分青蓝，三成紫、一成青绿 → 云气有层次
      var gsp = gn.dm === 1 ? spC : (gi % 7 === 0 || gi % 7 === 3 ? spV : (gi % 7 === 5 ? spT : sp));
      gc.drawImage(gsp, gx - gsz / 2, gy - gsz / 2, gsz, gsz);
    }
    // 暗尘带：用噪声乘掉一部分云气，云就有了丝缕和空洞，而不是一团牛奶
    // （浅滩是近白的晨光底，乘出暗块只会显脏，所以只在深海里做）
    gc.globalAlpha = 1;
    if (theme === 'deep') {
      gc.globalCompositeOperation = 'destination-in';
      var nOff = Math.sin((time || 0) * 0.00004) * 22;
      gc.drawImage(gasNoise, -10 + nOff, -10, gasW * 1.14, gasH * 1.14);
    }
    gc.globalCompositeOperation = 'source-over';
  }

  var bootDropped = false;
  function dropBoot() {
    if (bootDropped) return;
    bootDropped = true;
    var b = document.getElementById('boot');
    if (!b) return;
    b.classList.add('gone');
    setTimeout(function () { if (b && b.parentNode) b.parentNode.removeChild(b); }, 520);
  }
  function draw(now) {
    if (!bootDropped) { dropBoot(); }
    renderFrame(now - t0);
    requestAnimationFrame(draw);
  }

  function renderFrame(time) {
    loadBudget = 16;
    // 画面里星越少（陪伴海 33 颗、搜索结果几十条），单颗星画得越大一点，否则像撒了一把沙
    var seaBoost = Math.max(1, Math.min(1.5, Math.sqrt(320 / Math.max(40, visN))));

    // ===== 层次切换：淡出 → 换层 → 淡入 =====
    if (layerTrans) {
      var lp = (time - layerTrans.t0) / layerTrans.dur;
      if (layerTrans.phase === 'out') {
        layerFade = Math.max(0, 1 - lp);
        if (lp >= 1) {
          applyTheme(layerTrans.next);
          layerTrans.phase = 'in';
          layerTrans.t0 = time;
          layerFade = 0;
        }
      } else {
        layerFade = Math.min(1, lp);
        if (lp >= 1) { layerFade = 1; layerTrans = null; }
      }
    }

    // ===== 视图动画时间轴：聚焦/退出时相机+摆角+俯仰+位移一起缓动，避免各走各的显得生硬 =====
    if (viewAnim) {
      var ap = (time - viewAnim.t0) / viewAnim.dur;
      if (ap >= 1) ap = 1;
      var ae = ap < 0.5 ? 4 * ap * ap * ap : 1 - Math.pow(-2 * ap + 2, 3) / 2;
      var A = viewAnim.from, B = viewAnim.to;
      cam.x = A.x + (B.x - A.x) * ae;
      cam.y = A.y + (B.y - A.y) * ae;
      cam.s = A.s + (B.s - A.s) * ae;
      rot = A.rot + (B.rot - A.rot) * ae;
      pitch = A.pitch + (B.pitch - A.pitch) * ae;
      panShift = A.pan + (B.pan - A.pan) * ae;
      camTarget.x = cam.x; camTarget.y = cam.y; camTarget.s = cam.s;
      rotTgt = rot; pitchTgt = pitch; panShiftTgt = panShift;
      if (ap >= 1) { viewAnim = null; if (viewAnimDone) { viewAnimDone(); viewAnimDone = null; } }
    } else {
      // 相机缓动
      cam.x += (camTarget.x - cam.x) * 0.12;
      cam.y += (camTarget.y - cam.y) * 0.12;
      cam.s += (camTarget.s - cam.s) * 0.12;
      panShift += (panShiftTgt - panShift) * 0.075;
      if (rotLock) {
        rot += (rotTgt - rot) * 0.075;
      } else {
        if (rotOn) rotTgt = rotBase + Math.sin(time * ROT_SPEED) * ROT_AMP;
        else rotTgt = rotBase;
        rot += (rotTgt - rot) * (mouse.down && mouse.mode === 'rot' ? 1 : 0.10);
      }
      pitch += (pitchTgt - pitch) * (mouse.down && mouse.mode === 'rot' ? 1 : 0.12);
    }

    // ===== 时间在走：快进模式按倍速推进，静止时也跟真实时钟走 =====
    if (travelOn) {
      if (!travelLast) travelLast = time;
      var dtms = Math.min(80, time - travelLast);
      travelLast = time;
      travelNow += dtms * TRAVEL_SPEED;
      TNOW = travelNow;
      if (!frameNo || frameNo % 8 === 0) {
        recomputeRetention();
        refreshFilter();
        if (frameNo % 64 === 0) renderSessionList();
      }
    } else if (frameNo % 60 === 0) {
      // 平时每分钟跟进一次真实时钟，页面开着也不至于一直用旧值。
      // 只重算留存强度，不再顺带 refreshFilter —— 一分钟的 R 变化肉眼看不出，
      // 但重新过一遍可见性会让边界上的星忽隐忽现，看着就是「什么都没干也在闪」。
      var rn2 = dataNow + (Date.now() - openedAt);
      if (rn2 - TNOW > 60000) { TNOW = rn2; recomputeRetention(); }
    }
    frameNo++;

    K = baseScale();
    projectAll();
    // buildVisible 里要对全量节点排序 + 屏幕网格去重，每帧都做是白花钱：
    // 相机几乎没动、可见集合也没变时，用上一帧的结果就够了。
    var bvKey = Math.round(cam.s * 40) + '|' + Math.round(cam.x * 40) + '|' + Math.round(cam.y * 40)
      + '|' + visN + '|' + activeSid + '|' + (matchScores ? 1 : 0)
      + '|' + (overlapOn ? 1 : 0) + '|' + (ringMode ? 1 : 0) + '|' + futureDays;
    if (bvKey !== lastBvKey) { lastBvKey = bvKey; buildVisible(); countIslandVis(); }

    // --- 背景（预渲染位图） ---
    ctx.drawImage(bgc, 0, 0, W, H);

    // --- 星云气：数据驱动的密度云，垫在星点底下 ---
    // 它变化极慢（只有呼吸感），隔帧重画肉眼看不出来，省一半的 871 次 drawImage
    busyDrag = mouse.down && mouse.mode !== 'box';
    // 拖拽时云气也必须跟着重画：gasC 是按世界坐标画的，跳过重画整团云会「粘」在原地，
    // 看起来就像画面冻住了、松手才更新。隔帧已经是极限，不能再省。
    if ((frameNo & 1) === 0) renderGas(time);
    ctx.globalCompositeOperation = 'lighter';
    // 放大之后星星自己就够亮了，云气要退开；不然一堆大光斑叠在一起就糊成一片雾
    var gasZoomK = Math.min(1, 1.30 / Math.max(1, cam.s));
    ctx.globalAlpha = (theme === 'deep' ? 0.64 : 0.62) * gasZoomK;
    ctx.drawImage(gasC, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 星尘（缓慢漂移）—— 拖拽时先不画，手松开就回来
    if (!busyDrag) for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      var tw = 0.55 + 0.45 * Math.sin(time * 0.0009 * st.sp + st.ph);
      ctx.globalAlpha = st.a * tw;
      ctx.fillStyle = theme === 'deep' ? '#cfe8ff' : '#ffe2c8';
      var sxx = st.x + Math.sin(time * 0.00006 + st.ph) * 8;
      var syy = st.y + Math.cos(time * 0.00005 + st.ph) * 8;
      ctx.fillRect(sxx - st.r / 2, syy - st.r / 2, st.r, st.r);
    }
    ctx.globalAlpha = 1;

    // --- 岛的雾：给每团记忆垫一层气体，海才有体量（不是一张网） ---
    if (SEA.islands && cam.s < 7) {
      ctx.globalCompositeOperation = 'lighter';
      var mistK = Math.min(1, 2.4 / cam.s);
      for (var il_i = 0; il_i < SEA.islands.length; il_i++) {
        var il = SEA.islands[il_i];
        // 这一层记忆里这个岛几乎是空的 → 不画雾，免得到处是幽灵团
        var ivc = islandVis[il_i] || 0;
        if (ivc < Math.max(2, (il.n || 1) * 0.12)) continue;
        var ip = projPoint(il.x, il.y);
        var irr = il.r * cam.s * K * 2.45 * ip.p;
        if (irr < 2) continue;
        if (ip.x < -irr || ip.x > W + irr || ip.y < -irr || ip.y > H + irr) continue;
        ctx.globalAlpha = (il.z ? 0.062 : 0.048) * mistK;
        ctx.drawImage(il.z ? sprites.mistC : sprites.mistW, ip.x - irr, ip.y - irr, irr * 2, irr * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // --- 星尘层：所有记忆都还在海里，只是大多数不发光 ---
    // 全览时只点亮每段对话的代表星，其余的退成一层很淡的尘。
    // 放大（cam.s → 2.4）时尘逐渐转正、变成亮星，海是"长出来的"而不是"突然冒出来的"。
    if (cam.s < DUST_UNTIL) {
      var dustT = Math.min(1, Math.max(0, (cam.s - 0.95) / 0.95));
      ctx.fillStyle = theme === 'deep' ? '#a8d4f5' : '#e6b58f';
      for (var du = 0; du < visList.length; du++) {
        var dn = NODES[visList[du]];
        if (dn.bright) continue;
        var dsx = dn.sx, dsy = dn.sy;
        if (dsx < -20 || dsx > W + 20 || dsy < -20 || dsy > H + 20) continue;
        var dsz = 1.15 + 1.25 * dn.persp;
        var da;
        if (matchScores) {
          da = dn.matched ? 0.46 : 0.045;      // 搜索时，命中的那些连成尘也要亮起来
        } else {
          da = (0.115 + 0.30 * dustT) * depthDim(dn.persp);
          if (activeSid >= 0 && dn.sid !== activeSid) da *= 0.20;
          if (forgetOn) da *= 0.40 + 0.60 * Math.min(1, dn.R * 1.5);
          if (!isDeepLayer(dn)) da *= 0.85 + 0.30 * Math.min(1, dn.R * 2);
          // 「往后看」：忘掉的星不熄灭，留一枚小小的空心环 —— 看得见「这儿曾经有一颗」
          if (dn.futC === 'forgotten') {
            ctx.globalAlpha = 0.34 * depthDim(dn.persp);
            ctx.strokeStyle = theme === 'deep' ? '#8e97a8' : '#9c8c7e';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(dsx, dsy, 2.4 + 1.2 * dn.persp, 0, 6.2832);
            ctx.stroke();
            continue;
          }
          if (dn.futC === 'trace') da *= 0.34;
          else if (dn.futC === 'fuzzy') da *= 0.66;
        }
        if (da < 0.015) continue;
        ctx.globalAlpha = da;
        ctx.fillRect(dsx - dsz / 2, dsy - dsz / 2, dsz, dsz);
      }
      ctx.globalAlpha = 1;
    }

    // --- 岛与岛的骨架：只连最近的两个邻岛，显出"海"的脉络 ---
    // 只在凑近看的时候出现；全览时这些长线会连成一张多边形网，像扫描图
    if (SEA.islands && cam.s > 1.45 && cam.s < 5.5 && !matchScores) {
      var skA = Math.min(1, (cam.s - 1.45) / 1.3);
      ctx.strokeStyle = theme === 'deep'
        ? 'rgba(150,210,255,' + (0.11 * skA).toFixed(3) + ')'
        : 'rgba(90,110,145,' + (0.14 * skA).toFixed(3) + ')';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (var ib = 0; ib < SEA.islands.length; ib++) {
        var IA = SEA.islands[ib];
        var ap = projPoint(IA.x, IA.y);
        if (ap.x < -60 || ap.x > W + 60 || ap.y < -60 || ap.y > H + 60) continue;
        var best = null, bd = 1e9, best2 = null, bd2 = 1e9;
        for (var jb = 0; jb < SEA.islands.length; jb++) {
          if (jb === ib) continue;
          var IB = SEA.islands[jb];
          if (IB.z !== IA.z) continue;                       // 只在同一片海里织
          var dd = (IA.x - IB.x) * (IA.x - IB.x) + (IA.y - IB.y) * (IA.y - IB.y);
          if (dd < bd) { bd2 = bd; best2 = best; bd = dd; best = IB; }
          else if (dd < bd2) { bd2 = dd; best2 = IB; }
        }
        var targets = [best, best2];
        for (var tb = 0; tb < 2; tb++) {
          var IT = targets[tb];
          if (!IT) continue;
          if (tb === 1 && ((ib * 7) % 11) > 5) continue;      // 第二近的只连一部分，避免网格化
          var tp = projPoint(IT.x, IT.y);
          ctx.moveTo(ap.x, ap.y);
          ctx.lineTo(tp.x, tp.y);
        }
      }
      ctx.stroke();
    }

    // --- 会话轨迹（意识流）：放大或选中时才出现，默认视图只留星点与雾 ---
    // 点开一段对话 = 把这段对话连成一条星座，从第一颗连到最后一颗，贯穿整段
    if (cam.s > 2.0 || selIdx >= 0) {
      var selSid = selIdx >= 0 ? NODES[selIdx].sid : -1;
      for (var si = 0; si < nodesBySid.length; si++) {
        var list = nodesBySid[si];
        if (!list || list.length < 2) continue;
        var isFocusSid = si === selSid;
        var isActiveStream = false;
        if (selIdx >= 0) continue;                        // 点的是单颗星：只留它的放射线
        if (!isFocusSid && cam.s < 3.2) continue;
        var linkA = isActiveStream ? 0.62
          : (isFocusSid ? 0.30 : (0.03 + 0.15 * Math.min(1, Math.max(0, (cam.s - 2.2) / 2.0))));
        var streamWarm = NODES[list[0]].dm === 1;   // 陪伴海：粉紫；工作海：青蓝
        ctx.strokeStyle = theme === 'deep'
          ? (isActiveStream
              ? (streamWarm ? 'rgba(255,168,206,' + linkA.toFixed(3) + ')' : 'rgba(150,220,255,' + linkA.toFixed(3) + ')')
              : 'rgba(150,212,255,' + linkA.toFixed(3) + ')')
          : (isActiveStream
              ? (streamWarm ? 'rgba(168,72,111,' + linkA.toFixed(3) + ')' : 'rgba(42,96,132,' + linkA.toFixed(3) + ')')
              : 'rgba(80,110,160,' + (linkA * 0.85).toFixed(3) + ')');
        ctx.lineWidth = isActiveStream ? 1.9 : (isFocusSid ? 1.1 : 0.6);
        ctx.globalAlpha = matchScores && !isFocusSid ? 0.5 : 1;
        var has = false, lx0 = 0, ly0 = 0;
        ctx.beginPath();
        for (var li = 0; li < list.length; li++) {
          var ln = NODES[list[li]];
          if (!ln.vis) { has = false; continue; }
          if (matchScores && !ln.matched && !isFocusSid) { has = false; continue; }
          var lx = ln.sx, ly = ln.sy;
          if (!has) { ctx.moveTo(lx, ly); has = true; }
          else {
            var LIMIT = isActiveStream ? 1400 : (isFocusSid ? 520 : 340);
            if (Math.abs(lx - lx0) + Math.abs(ly - ly0) < LIMIT) ctx.lineTo(lx, ly);
            else ctx.moveTo(lx, ly);
          }
          lx0 = lx; ly0 = ly;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // --- 星座连线（语义近邻）：默认视图几乎不可见，放大后才织出细节 ---
    if (SEA.edges && cam.s > 1.55 && cam.s < 2.8 && selIdx < 0) {
      var ee = SEA.edges;
      var edgeA = 0.012 + 0.055 * Math.min(1, (cam.s - 1.55) / 2.6);
      ctx.strokeStyle = theme === 'deep'
        ? 'rgba(120,190,240,' + edgeA.toFixed(3) + ')'
        : 'rgba(70,100,140,' + (edgeA * 1.1).toFixed(3) + ')';
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = matchScores ? 0.22 : (selIdx >= 0 ? 0.35 : 1);
      // 只连"岛与岛之间"的边：太短的会在岛内连成一串串平行短线，反而像扫描线
      var DMIN = 62 * 62, DMAX = 130 * 130;
      ctx.beginPath();
      for (var e = 0; e < ee.length; e++) {
        var ea = NODES[ee[e][0]], eb = NODES[ee[e][1]];
        if (!ea.vis || !eb.vis) continue;
        var ex = ea.sx - eb.sx, ey = ea.sy - eb.sy;
        var ed2 = ex * ex + ey * ey;
        if (ed2 < DMIN || ed2 > DMAX) continue;
        ctx.moveTo(ea.sx, ea.sy);
        ctx.lineTo(eb.sx, eb.sy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawRings(time);

    // --- 两片海重叠：同一件事的两头，牵一根线过去 ---
    if (overlapOn && window.BRIDGE && window.BRIDGE.pairs) {
      var prs = window.BRIDGE.pairs;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = theme === 'deep' ? 'rgba(196,224,255,1)' : 'rgba(255,226,196,1)';
      for (var bi2 = 0; bi2 < prs.length; bi2++) {
        var pa = NODES[prs[bi2][0]], pb = NODES[DSHN + prs[bi2][1]];
        if (!pa || !pb || !pa.vis || !pb.vis) continue;
        if (pa.sx < -1000 || pb.sx < -1000) continue;
        var bw = Math.min(1, Math.max(0.3, prs[bi2][2]));
        ctx.globalAlpha = 0.08 + 0.26 * bw;
        var bm = (pa.sy + pb.sy) / 2 - 30;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.quadraticCurveTo((pa.sx + pb.sx) / 2, bm, pb.sx, pb.sy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // --- 选中的星 → 相关记忆的放射线：一眼看出"它们跟它是什么关系" ---
    if (selIdx >= 0 && relatedSet && cam.s > 0.9) {
      var sn = NODES[selIdx];
      // 屏幕距离上限。原来是 420px —— 线会横穿大半个海，路过一堆不相干的星，
      // 眼睛跟着线走半天也不知道它连到哪颗。收到 170px：线只做"最近这几颗"的指针，
      // 更远的相关星靠光晕说明关系，不再连过去。
      var RLINE = 170;
      // 同会话的暖色（时间上挨着）：连最近 8 条，多了就成一束光栅
      var nearTime = [];
      for (var rk of relatedSet) {
        if (rk === selIdx) continue;
        var rn = NODES[rk];
        if (rn.sid !== sn.sid || !rn.vis) continue;
        var rd2 = Math.abs(rn.sx - sn.sx) + Math.abs(rn.sy - sn.sy);
        if (rd2 > RLINE) continue;
        nearTime.push([rd2, rk]);
      }
      nearTime.sort(function (a, b) { return a[0] - b[0]; });
      var takeT = Math.min(3, nearTime.length);
      ctx.beginPath();
      ctx.strokeStyle = theme === 'deep' ? 'rgba(255,200,130,.46)' : 'rgba(255,196,140,.50)';
      ctx.lineWidth = 1.25;
      for (var ti = 0; ti < takeT; ti++) {
        var tn = NODES[nearTime[ti][1]];
        ctx.moveTo(sn.sx, sn.sy);
        ctx.lineTo(tn.sx, tn.sy);
      }
      ctx.stroke();
      // 落点：线画到星星边缘就没了，加个实心小点，一眼就知道"连的是它"
      ctx.beginPath();
      for (var tp = 0; tp < takeT; tp++) {
        var tpN = NODES[nearTime[tp][1]];
        var tpR = 2.5 + (tpN.hi === 1 ? 0.8 : 0);
        ctx.moveTo(tpN.sx + tpR, tpN.sy);
        ctx.arc(tpN.sx, tpN.sy, tpR, 0, 6.2832);
      }
      ctx.fillStyle = theme === 'deep' ? 'rgba(255,214,158,.88)' : 'rgba(226,158,92,.86)';
      ctx.fill();
      // 纯语义近邻：冷色
      var near = [];
      for (var rk2 of relatedSet) {
        if (rk2 === selIdx) continue;
        var rn2 = NODES[rk2];
        if (rn2.sid === sn.sid || !rn2.vis) continue;
        var ddx = rn2.sx - sn.sx, ddy = rn2.sy - sn.sy;
        var d2 = ddx * ddx + ddy * ddy;
        if (d2 > RLINE * RLINE) continue;
        near.push([d2, rk2]);
      }
      near.sort(function (a, b) { return a[0] - b[0]; });
      var take = Math.min(2, near.length);
      ctx.beginPath();
      // 冷色这条比背景的星座线亮一档，否则两种青蓝混在一起分不出来
      ctx.strokeStyle = theme === 'deep' ? 'rgba(150,205,255,.42)' : 'rgba(190,172,255,.46)';
      ctx.lineWidth = 1.15;
      for (var ni = 0; ni < take; ni++) {
        var nn = NODES[near[ni][1]];
        ctx.moveTo(sn.sx, sn.sy);
        ctx.lineTo(nn.sx, nn.sy);
      }
      ctx.stroke();
      ctx.beginPath();
      for (var np = 0; np < take; np++) {
        var npN = NODES[near[np][1]];
        var npR = 2.4 + (npN.hi === 1 ? 0.8 : 0);
        ctx.moveTo(npN.sx + npR, npN.sy);
        ctx.arc(npN.sx, npN.sy, npR, 0, 6.2832);
      }
      ctx.fillStyle = theme === 'deep' ? 'rgba(176,220,255,.86)' : 'rgba(132,120,206,.82)';
      ctx.fill();
      // 上面只画了最近的几条当"指针"。光标停在近处的相关星上时，
      // 再把「选中星 → 这一颗」单独点亮一条：想看哪条看哪条，不用一堆线互相打。
      // 限定 320px 是有原因的：一旦允许横跨整个屏幕，那条线就成了用户眼里的
      // "一条不明长条"，比原来的 16 根线还难懂 —— 远处的相关星靠光晕和右侧列表表达。
      if (hoverIdx >= 0 && hoverIdx !== selIdx && relatedSet.has(hoverIdx) && NODES[hoverIdx].vis) {
        var hn = NODES[hoverIdx];
        var hdx = hn.sx - sn.sx, hdy = hn.sy - sn.sy;
        if (hdx * hdx + hdy * hdy <= 320 * 320) {
          var isSameSess = hn.sid === sn.sid;
          ctx.beginPath();
          ctx.moveTo(sn.sx, sn.sy);
          ctx.lineTo(hn.sx, hn.sy);
          // 虚线 + 淡一档：它是"临时指路"，不该跟常驻短线抢注意力
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = isSameSess
            ? (theme === 'deep' ? 'rgba(255,208,150,.62)' : 'rgba(226,158,92,.60)')
            : (theme === 'deep' ? 'rgba(176,220,255,.58)' : 'rgba(132,120,206,.58)');
          ctx.lineWidth = 1.15;
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          var hpR = 3.2 + (hn.hi === 1 ? 0.8 : 0);
          ctx.moveTo(hn.sx + hpR, hn.sy);
          ctx.arc(hn.sx, hn.sy, hpR, 0, 6.2832);
          ctx.fillStyle = isSameSess ? 'rgba(255,214,158,.96)' : 'rgba(190,228,255,.94)';
          ctx.fill();
        }
      }
      // 关系在流动：每条线上跑一颗小光点，方向是「选中星 → 相关星」。
      // 静止的细线只说明"有关系"，会动的点才说明"从它流向哪"。
      var flowT = theme === 'deep' ? '255,214,152' : '158,100,42';
      var flowS = theme === 'deep' ? '170,216,255' : '58,102,156';
      var fp = (time * 0.00042) % 1;
      for (var fi = 0; fi < takeT; fi++) {
        var fn = NODES[nearTime[fi][1]];
        var ft = (fp + fi * 0.13) % 1;
        ctx.globalAlpha = Math.sin(Math.PI * ft) * 0.8;
        ctx.fillStyle = 'rgba(' + flowT + ',1)';
        ctx.beginPath();
        ctx.arc(sn.sx + (fn.sx - sn.sx) * ft, sn.sy + (fn.sy - sn.sy) * ft, 1.7, 0, 6.2832);
        ctx.fill();
      }
      for (var fj = 0; fj < take; fj++) {
        var fn2 = NODES[near[fj][1]];
        var ft2 = (fp + fj * 0.17 + 0.35) % 1;
        ctx.globalAlpha = Math.sin(Math.PI * ft2) * 0.66;
        ctx.fillStyle = 'rgba(' + flowS + ',1)';
        ctx.beginPath();
        ctx.arc(sn.sx + (fn2.sx - sn.sx) * ft2, sn.sy + (fn2.sy - sn.sy) * ft2, 1.5, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // --- 节点 ---
    var zoom = cam.s;
    // 拖拽时先按星点画：缩略图那一档每帧要画几十张图还要去重，手一松再变回卡片
    var imgLOD = zoom > 2.6 && !busyDrag;
    // 提前把缩略图拉下来：跨过 2.6 倍那一刻卡片是现成的，不会一片一片往外冒
    if (zoom > 2.12 && !imgLOD) {
      var preN = 0;
      for (var pi = 0; pi < visList.length && preN < 24; pi++) {
        var pn = NODES[visList[pi]];
        if (!pn.th || !pn.bright || thumbCache[pn.th]) continue;
        getThumb(pn.th);
        preN++;
      }
    }
    var thumbSize = Math.min(96, 26 + (zoom - 2.6) * 26);
    var lodCX = W / 2, lodCY = H / 2, lodR = Math.min(W, H) * 0.52;
    // 缩略图不许叠在一起：一个网格里只留一张，其余回落成星点
    var lodUsed = {};
    var lodRects = [];        // 这一帧已经画出来的缩略图矩形，用来判重叠
    var drawn = 0;

    // 缩略图模式下按「重要度」从高到低画：先画的占住位置，
    // 这样某张图懒加载完成时只会把它自己补上，不会把已经画好的挤掉再重排（那一下就是频闪）
    var drawList = visList;
    if (imgLOD) {
      drawList = visList.slice().sort(function (a, b) { return nodeScore(NODES[b]) - nodeScore(NODES[a]); });
    }
    for (var vi = 0; vi < drawList.length; vi++) {
      var d = drawList[vi];
      var n = NODES[d];
      if (!n.vis) continue;
      if (!n.bright) continue;      // 没被点亮的那些，上一层的星尘已经画过了

      var dim = depthDim(n.persp);
      var vf = 1;
      var deepOne = isDeepLayer(n);
      if (forgetOn && !matchScores) {
        if (deepOne) {
          // 长期记忆：几乎不淡忘，只是随岁月极轻微地变暗
          vf = 0.88 + 0.12 * Math.min(1, n.R * 1.6);
        } else {
          // 短期记忆：随时间一路变暗，最后真的看不见
          vf = Math.pow(Math.max(0, n.R), 0.75);
        }
      }

      var sx = n.sx, sy = n.sy;
      // 呼吸浮动
      sx += Math.sin(time * 0.00055 + n.ph) * 0.9 * Math.min(2.4, zoom);
      sy += Math.cos(time * 0.00048 + n.ph * 1.7) * 0.9 * Math.min(2.4, zoom);

      if (sx < -90 || sx > W + 90 || sy < -90 || sy > H + 90) continue;

      var focus = 1;
      var isSel = (d === selIdx);
      // 「往后看」：按推演出来的清晰度把星压下去 —— 模糊的还看得见轮廓，
      // 忘了的只剩一点余烬，海就这么慢慢空掉
      if (n.futC === 'forgotten') focus = 0.06;
      else if (n.futC === 'trace') focus = 0.22;
      else if (n.futC === 'fuzzy') focus = 0.52;
      if (matchScores) focus = n.matched ? 1 : 0.20;
      var inStream = activeSid >= 0 && n.sid === activeSid;
      if (activeSid >= 0 && !inStream) focus *= 0.14;   // 其他星压暗，留出对比
      focus *= dim * (0.62 + 0.38 * vf);
      // 基准半径先算出来：下面的"这段对话"光环要比星点大一圈。
      // （以前这里直接用了还没赋值的 r，光环就一直是隐形的）
      var rBase = n.r0 * Math.min(2.6, Math.max(0.85, Math.pow(zoom, TH.layer === 'shallow' ? 0.50 : 0.62)))
        * Math.pow(n.persp, 0.55) * (0.84 + 0.34 * vf) * (TH.sizeScale || 1);
      if (matchScores && n.matched) rBase *= 1.25;
      // 只剩几十颗星的时候（陪伴海 / 搜索结果），星再画原来那么大就像撒了一把沙，
      // 稍微放大一点，小海域才有「星」的存在感
      rBase *= seaBoost;
      // 看某一段对话时，这段里的星套一圈细光环，标出"到底在哪"
      if (inStream && !matchScores && focus > 0.25) {
        ctx.beginPath();
        ctx.arc(sx, sy, rBase + 5.5 + Math.sin(time * 0.0021 + d) * 1.4, 0, 6.2832);
        ctx.strokeStyle = theme === 'deep' ? 'rgba(150,220,255,0.45)' : 'rgba(255,186,140,0.32)';
        ctx.lineWidth = 1;
        ctx.globalAlpha = Math.min(1, focus);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 短记忆淡到很淡的时候，让它真的从画面上消失
      if (forgetOn && !matchScores && !deepOne && n.R < 0.14) focus *= n.R / 0.14;

      // 回声：从被点中的星出发，一圈一圈亮起来，再慢慢暗下去
      var echoK = 0;
      if (echoT0 > 0 && echoDist[d] >= 0) {
        var ed = echoDist[d];
        var ph = time - echoT0 - ed * 340;
        if (ph > 0) {
          // 慢一点起来（420ms 而不是 150ms），最多只提亮 30%；
          // 以前是 ×1.8 而且在 150ms 内冲上去，点一下像有人开了灯。
          var rise = Math.min(1, ph / 420);
          rise = rise * rise * (3 - 2 * rise);
          var fall = Math.max(0, 1 - (ph - 420) / 1600);
          echoK = rise * fall;
          focus *= 0.78 + 0.52 * echoK;
        }
      }
      // 选中某颗星时：相关的留在光里，不相干的沉下去 —— 「它和谁有关」一眼看得出来。
      // 但「整片海突然变暗」本身就是一次全屏跳变，所以压暗要渐进去：320ms 内从 1 走到底。
      var dimK = 1;
      if (selIdx >= 0) {
        dimK = Math.min(1, Math.max(0, (performance.now() - selT0) / 320));
        dimK = dimK * dimK * (3 - 2 * dimK);            // smoothstep，别像开关
      }
      if (selIdx >= 0 && !isSel && dimK > 0) {
        var selN = NODES[selIdx];
        var dd = Math.hypot(sx - selN.sx, sy - selN.sy);
        var dk = Math.max(0, 1 - dd / (300 * Math.min(2.2, zoom)));
        var tgt;
        if (relatedSet && relatedSet.has(d)) {
          // 相关星最多回到原亮度（1.02）。以前给到 1.38，等于点一下把它们全提亮了，
          // 「突然亮一下」就是它 —— 对比应该来自别人变暗，不是自己变亮。
          tgt = 0.74 + 0.28 * dk;
        } else {
          tgt = 0.26 + 0.74 * dk;
          if (n.k === 'ghost') tgt *= 0.16;   // 档案里还在、但已经忘了的：几乎看不见
        }
        focus *= 1 + (tgt - 1) * dimK;   // 从 1 渐变到 tgt
      }
      if (isSel) focus = 1;

      if (isSel) continue;

      // 深层沉底了，几乎不动；浅层还浮着，慢慢飘、轻轻呼吸
      var isShallow = TH.layer === 'shallow';
      var drf = isShallow ? 1 : 0.18;
      var tt = time * 0.00019;
      // 浅层曾经有一个「慢慢往下沉、到点跳回去」的漂移（`(time*0.0018 + ph*9) % 14`）。
      // 它是循环的：每 7.8 秒所有星同时往下一沉再弹回 —— 就是用户说的「一点点落下的效果」，
      // 而且只有星点在动、线/环/云都用不动的坐标，看着像环挂在旁边。现在只留极轻的呼吸。
      var dxm = Math.sin(tt * 1.7 + n.ph * 3.1) * 1.8 * drf;
      var dym = Math.cos(tt * 1.3 + n.ph * 2.3) * 1.5 * drf;
      sx += dxm; sy += dym;
      if (isShallow) focus *= 0.72 + 0.28 * Math.sin(time * 0.0009 + n.ph * 4.4);

      var r = rBase;
      if (echoK > 0) r *= 1 + 0.55 * echoK;
      var extra = n.hl * 1.9;

      // 情绪视角：平静的记忆沉下去，有波澜的浮上来（不是给几颗星戴个圈，是换一种看法）
      if (emoMode && n.src_ === 'sc') {
        if (n.emo >= 1) focus *= Math.min(2.2, 1.0 + 0.22 * n.emo);
        else focus *= 0.14;
      }
      // 情绪：memory-card 里的 emotional 是 1~8 的浓度，不是类型。
      // 浓度越高，星外面那圈越暖 —— 吵架、心动、委屈都在里面，只能看"有多热"。
      if (emoMode && n.src_ === 'sc' && n.emo >= 1 && focus > 0.22) {
        var eK = Math.min(1, n.emo / 8);
        var eFade = Math.min(1, Math.max(0, (zoom - 1.05) / 0.85));
        var emoA = (0.16 + 0.40 * eK) * Math.min(1, focus) * eFade;
        if (emoA > 0.02) {
          // 只留一圈「热起来的柔光」，不再画硬边圆环 ——
          // 那个环比星点大三四倍、颜色又亮，看起来像旁边挂了个圈（浅底上最明显）。
          var eSp = n.emo >= 7 ? sprites.emoR : (n.emo >= 5 ? sprites.emoP : sprites.emoW);
          var eSz = (r * 7.0 + 21) * (1 + 0.30 * eK);
          ctx.globalAlpha = emoA * 0.95;
          ctx.drawImage(eSp, sx - eSz / 2, sy - eSz / 2, eSz, eSz);
          ctx.globalAlpha = 1;
        }
      }

      // 缩略图模式
      // 一屏最多画 26 张缩略图卡：再多也不是「看得清」，只会把帧数拖下去
      if (imgLOD && n.th && focus > 0.3 && lodRects.length < 26
          && Math.hypot(sx - lodCX, sy - lodCY) < lodR) {
        var th = getThumb(n.th);
        if (th && th.ready) {
          var ar = n.ar || 1.6;
          var tsz = isSel ? thumbSize * 1.45 : thumbSize;
          var tw0 = tsz, th0 = tw0 / ar;
          if (th0 > tsz * 1.35) { th0 = tsz * 1.35; tw0 = th0 * ar; }
          // 和已经画出来的卡片真正叠上了才让位。
          // （原来是按屏幕格子去重，相机稍微一动卡片就在格子里进进出出，肉眼看到就是频闪）
          var clash = false;
          for (var pj = 0; pj < lodRects.length; pj++) {
            var pr = lodRects[pj];
            if (Math.abs(sx - pr[0]) * 2 < tw0 + pr[2] - 6
                && Math.abs(sy - pr[1]) * 2 < th0 + pr[3] - 6) { clash = true; break; }
          }
          if (clash) { /* 让位，交给已经在画面上的那张 */ }
          else {
          lodRects.push([sx, sy, tw0, th0]);
          // 刚加载完的缩略图淡入 220ms，避免一帧之内「星点 → 卡片」硬切造成的闪烁
          var thFade = th.t ? Math.min(1, (performance.now() - th.t) / 220) : 1;
          thFade = 0.18 + 0.82 * thFade;
          // 相关卡片也要「一张张」亮，不能一起跳出来
          var relCardIn = 1;
          if (selIdx >= 0 && relatedSet && relatedSet.has(d) && !isSel) {
            relCardIn = Math.min(1, Math.max(0, (performance.now() - selT0 - (n.relDelay || 0)) / 240));
          }
          ctx.globalAlpha = focus * (isSel ? 1 : 0.92) * thFade * relCardIn;
          ctx.save();
          ctx.shadowColor = theme === 'deep'
            ? hexA(n.zone ? TH.cmp.image : TH.node.image, 0.75 * focus * thFade)
            : 'rgba(28,66,96,' + (0.30 * focus * thFade).toFixed(3) + ')';
          // 卡少的时候用柔光；一多就关掉 —— 每张卡各算一次高斯模糊，是这里最大的一笔开销
          ctx.shadowBlur = (lodRects.length <= 12) ? (theme === 'deep' ? 16 : 9) * thFade : 0;
          roundRect(ctx, sx - tw0 / 2, sy - th0 / 2, tw0, th0, 4);
          ctx.clip();
          ctx.drawImage(th.img, sx - tw0 / 2, sy - th0 / 2, tw0, th0);
          ctx.restore();
          ctx.globalAlpha = focus * 0.35;
          ctx.strokeStyle = n.zone ? TH.cmp.image : TH.node.image;
          ctx.lineWidth = 0.8;
          roundRect(ctx, sx - tw0 / 2, sy - th0 / 2, tw0, th0, 4);
          ctx.stroke();
          ctx.globalAlpha = 1;
          drawn++;
          continue;
          }
        }
      }

      var sp;
      if (emoMode) sp = sprites.emo[emoSlot(n)];
      else if (n.k === 'image') sp = (n.hu == null)
        ? (n.zone ? sprites.plainC : sprites.plain)
        : (n.zone ? sprites.imageC : sprites.image)[n.hi < 0 ? 1 : n.hi];
      else if (n.k === 'text') sp = n.zone ? sprites.textC : sprites.text;
      else sp = n.zone ? sprites.memoryC : sprites.memory;
      var size = (r + extra) * 5.4 * (isShallow ? 0.86 : 1);
      // 与选中星相关的那些：各垫一圈极淡柔光。连线只连得到近处几颗，
      // 光晕能让「相关的那一族」整片亮起来，而且不织成一张网。
      if (selIdx >= 0 && relatedSet && relatedSet.has(d) && !imgLOD) {
        var relD = Math.hypot(sx - NODES[selIdx].sx, sy - NODES[selIdx].sy);
        // 只画近处那一圈：relatedSet 可能有几百颗（同会话 + 语义 + 回声扩散），
        // 全给光晕等于每帧多几百次贴图，点星时那一下顿就是它
        var relK = relD < 340 ? Math.max(0, 1 - relD / 340) : 0;
        // 相关星不是"啪一下全亮"，而是从近到远一颗接一颗亮起来（每组错开 ~26ms）
        var relIn = Math.min(1, Math.max(0, (performance.now() - selT0 - (n.relDelay || 0)) / 220));
        if (relK > 0.02 && relIn > 0) {
          var gsz2 = size * (2.0 + 1.4 * relK);
          ctx.globalAlpha = Math.min(0.30, 0.26 * relK * focus) * relIn;
          ctx.drawImage(sp, sx - gsz2 / 2, sy - gsz2 / 2, gsz2, gsz2);
          // 屏幕上真正的"近亲"再套一圈细环：和"扇区里其他相关的"分开。
          // 原来是 relK > 0.55 的硬阈值 —— 相机一动、距离跨过这条线，环就"啪"地出现/消失，
          // 看起来像星点周围的光圈在闪。改成 0.42~0.60 之间渐显。
          var ringSoft = relRingSet[d] ? 1 : 0;
          if (ringSoft > 0.01) {
            ctx.globalAlpha = Math.min(0.30, 0.34 * relK * focus) * relIn * ringSoft;
            ctx.beginPath();
            ctx.arc(sx, sy, r * 2.4 + 5, 0, 6.2832);
            ctx.strokeStyle = n.sid === NODES[selIdx].sid
              ? (theme === 'deep' ? 'rgba(255,208,150,.9)' : 'rgba(255,206,150,.85)')
              : (theme === 'deep' ? 'rgba(168,214,255,.75)' : 'rgba(190,172,255,.78)');
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }
      // 浅层是「正在淡忘」的那一半：点外面再化开一圈水痕，边缘是虚的。
      // 不这样做，浅色底上就只剩一把小芝麻。
      // 框中的星：亮环圈住，跟没选中的拉开（星尘只给淡淡的，免得满屏都是圈）
      if (bulkSet && bulkSet.has(d)) {
        var bkA = n.bright ? 1 : 0.34;
        ctx.globalAlpha = bkA;
        ctx.beginPath();
        ctx.arc(sx, sy, (n.bright ? r * 2.1 + 7 : 5.5), 0, 6.2832);
        ctx.strokeStyle = theme === 'deep' ? 'rgba(150,235,255,.88)' : 'rgba(255,196,140,.78)';
        ctx.lineWidth = n.bright ? 1.5 : 1;
        ctx.stroke();
      }
      if (isShallow && focus > 0.20 && !imgLOD) {
        // 暮色里这里不再画"洇开的墨"，而是星外面那圈柔光
        var hz = size * (1.30 + 0.30 * (1 - vf)) * Math.min(1, 1.25 / zoom);
        ctx.globalAlpha = Math.min(0.40, focus * 0.40) * (0.45 + 0.55 * vf);
        ctx.drawImage(sp, sx - hz / 2, sy - hz / 2, hz, hz);
      }
      ctx.globalAlpha = Math.min(1, focus * (0.88 + n.hl * 0.12));
      ctx.drawImage(sp, sx - size / 2, sy - size / 2, size, size);
      // 浅层的星再补一个「实心的小核」：只有柔光的话，放大几次就化成一团雾，
      // 有核才能一眼认出"这是一颗星"，光晕才只是它外面的那层空气。
      if (isShallow && !imgLOD && focus > 0.30) {
        var cr = Math.max(1.15, size * 0.16);
        ctx.globalAlpha = Math.min(0.95, focus * 0.95);
        ctx.fillStyle = TH.core;
        ctx.beginPath();
        ctx.arc(sx, sy, cr, 0, 6.2832);
        ctx.fill();
      }

      // 写过备注的：一圈很淡的青色细环 —— 「这条我亲手管过」
      if (marks.note && marks.note[nkey(d)] && focus > 0.25) {
        ctx.globalAlpha = (0.18 + 0.10 * Math.sin(time * 0.0013 + n.ph)) * Math.min(1, focus);
        ctx.strokeStyle = theme === 'deep' ? '#8fe6c4' : '#9fe6c8';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 2.7 + 6.5, 0, 6.283);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 收藏过的记忆：加一道十字星芒，海里一眼能认出
      if (marks.star[n.id || ('i' + n.i)] && focus > 0.25) {
        var gl = (0.5 + 0.5 * Math.sin(time * 0.0016 + n.ph)) * focus;
        var arm = r * 4.2 + 3.2;
        ctx.globalAlpha = 0.28 + 0.42 * gl;
        ctx.strokeStyle = '#ffd479';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(sx - arm, sy); ctx.lineTo(sx + arm, sy);
        ctx.moveTo(sx, sy - arm); ctx.lineTo(sx, sy + arm);
        ctx.stroke();
        ctx.globalAlpha = 0.5 + 0.3 * gl;
        ctx.fillStyle = '#fff2cf';
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.1, r * 0.45), 0, 6.283);
        ctx.fill();
      }

      // 核心亮点
      if (zoom > 0.6) {
        ctx.globalAlpha = Math.min(1, focus * 0.95);
        ctx.fillStyle = TH.core;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.45, r * 0.34), 0, 6.283);
        ctx.fill();
      }

      // 高亮环
      if (n.hl > 0.02) {
        // 浅底上"墨点 + 一整套圆环"像靶心，浅层把环收小、压淡
        ctx.globalAlpha = n.hl * (isShallow ? 0.40 : 0.85);
        ctx.strokeStyle = (n.zone ? TH.cmp[n.k] : TH.node[n.k]) || '#fff';
        ctx.lineWidth = isShallow ? 0.8 : 1.1;
        ctx.beginPath();
        ctx.arc(sx, sy, isShallow ? r * 1.45 + 2 : r * 1.9 + 3 * n.hl, 0, 6.283);
        ctx.stroke();
      }
      // 搜索命中：实心亮点 + 淡淡的脉冲环
      if (matchScores && n.matched) {
        var mc = (n.zone ? TH.cmp[n.k] : TH.node[n.k]) || '#fff';
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = mc;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(2.1, r * 0.62), 0, 6.283);
        ctx.fill();
        var pl = 0.5 + 0.5 * Math.sin(time * 0.0032 + d * 0.6);
        ctx.globalAlpha = 0.07 + 0.16 * pl;
        ctx.strokeStyle = mc;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 1.35 + 2.5 + pl * 4.5, 0, 6.283);
        ctx.stroke();
      }
      // 长期记忆：加一圈缓慢旋转的虚线光环，一眼认出「不会被忘记的那几颗」
      if (forgetOn && n.R >= 0.999) {
        ctx.globalAlpha = (isShallow ? 0.10 : 0.20) + (isShallow ? 0.10 : 0.22) * Math.sin(time * 0.0011 + n.ph);
        ctx.strokeStyle = n.zone ? TH.cmp.memory : TH.node.memory;
        ctx.lineWidth = 0.9;
        var lr = r * 2.2 + 4.5;
        var aa = time * 0.00035 + n.ph;
        ctx.beginPath();
        for (var a2 = 0; a2 < 6.283; a2 += 0.5) {
          ctx.moveTo(sx + Math.cos(aa + a2) * lr, sy + Math.sin(aa + a2) * lr);
          ctx.arc(sx, sy, lr, aa + a2, aa + a2 + 0.26);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      drawn++;
    }

    // 选中星 → 右侧详情面板：一条极淡的光路，一个小光点顺着它跑过去。
    // 面板是块「墙」，光路只画到墙边就淡没了，不横穿整片海。
    if (selIdx >= 0 && document.getElementById('detail').classList.contains('open')) {
      var ln = NODES[selIdx];
      var px0 = W - (window.innerWidth <= 760 ? 0 : 396);
      var lx0 = ln.sx, ly0 = ln.sy;
      // 面板左边缘的尖角跟着这颗星走：一眼看出「这块面板说的是哪一颗」
      // 面板现在从 72px 开始（给顶栏让位），尖角用的是面板内坐标，要换算一下
      var anchorY = Math.max(96, Math.min(H - 96, ly0)) - 72;
      anchorY = Math.max(20, Math.min(H - 72 - 78 - 30, anchorY));
      if (Math.abs(anchorY - lastAnchorY) > 1.5) {
        lastAnchorY = anchorY;
        var dl = document.getElementById('detail');
        if (dl) dl.style.setProperty('--anchor', anchorY.toFixed(0) + 'px');
      }
      if (lx0 > -200 && lx0 < px0 - 30 && ly0 > -80 && ly0 < H + 80) {
        var colL = (ln.zone ? TH.cmp[ln.k] : TH.node[ln.k]) || '#ffffff';
        var tgty = Math.max(140, Math.min(H - 140, ly0));
        var c1x = lx0 + (px0 - lx0) * 0.42, c1y = ly0;
        var c2x = px0 - 30, c2y = ly0 + (tgty - ly0) * 0.45;
        var lg = ctx.createLinearGradient(lx0, ly0, px0, tgty);
        lg.addColorStop(0, hexA(colL, 0.55));
        lg.addColorStop(0.42, hexA(colL, 0.20));
        lg.addColorStop(1, hexA(colL, 0));
        ctx.beginPath();
        ctx.moveTo(lx0, ly0);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, px0 - 2, tgty);
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        // 一个光点沿光路往复，像有东西被送进面板
        var tp = (time * 0.00042) % 1;
        var um = 1 - tp;
        var bx = um * um * um * lx0 + 3 * um * um * tp * c1x + 3 * um * tp * tp * c2x + tp * tp * tp * (px0 - 2);
        var by = um * um * um * ly0 + 3 * um * um * tp * c1y + 3 * um * tp * tp * c2y + tp * tp * tp * tgty;
        ctx.globalAlpha = 0.6 * Math.sin(tp * Math.PI);
        ctx.fillStyle = colL;
        ctx.beginPath();
        ctx.arc(bx, by, 1.9, 0, 6.283);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 框选中的那个框：虚线 + 淡淡的填充，拖的时候一眼知道圈了多大
    if (bulkBox) {
      var qx = Math.min(bulkBox.x0, bulkBox.x1), qy = Math.min(bulkBox.y0, bulkBox.y1);
      var qw = Math.abs(bulkBox.x1 - bulkBox.x0), qh = Math.abs(bulkBox.y1 - bulkBox.y0);
      ctx.save();
      ctx.fillStyle = theme === 'deep' ? 'rgba(140,210,255,.10)' : 'rgba(255,190,150,.07)';
      ctx.fillRect(qx, qy, qw, qh);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme === 'deep' ? 'rgba(150,220,255,.62)' : 'rgba(255,196,150,.48)';
      ctx.strokeRect(qx + .5, qy + .5, qw, qh);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 悬停节点的连线（指向同会话近邻）。
    // 但如果这颗星已经被点中，选中放射线已经连了同一批近邻 —— 再画一遍线会双层、发白，
    // 看起来像"点下去的一瞬多了东西"。所以选中后交给放射线。
    if (hoverIdx >= 0 && hoverIdx !== selIdx) drawHoverLinks(hoverIdx, time);
    if (selIdx >= 0) drawSelectedNode(time);

    // 涟漪：三圈光从被点中的星向外扩散，一圈比一圈淡
    if (echoT0 > 0 && selIdx >= 0) {
      var cN = NODES[selIdx];
      var age = time - echoT0;
      var baseR = Math.min(2.6, Math.max(0.9, cam.s)) * 46;
      for (var ring = 0; ring < 4; ring++) {
        var rp = age - ring * 340;
        if (rp <= 0 || rp > 2000) continue;
        var kk2 = rp / 2000;
        var rr = baseR * (0.05 + kk2 * 2.55);          // 从星点本身长出来，不是凭空一个中等大小的圈
        var aa = Math.sin(Math.min(1, kk2 * 1.7) * Math.PI) * 0.24;   // 先淡入再淡出
        ctx.globalAlpha = aa;
        ctx.strokeStyle = theme === 'deep' ? 'rgba(150,215,255,1)' : 'rgba(255,208,164,1)';
        ctx.lineWidth = 1.4 - kk2 * 0.6;
        ctx.beginPath();
        ctx.arc(cN.sx, cN.sy, rr, 0, 6.283);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // 层次切换：整屏淡到背景再淡回来（用背景图当遮罩，切层瞬间看不出跳变）
    if (layerFade < 1) {
      ctx.globalAlpha = 1 - layerFade;
      ctx.drawImage(bgc, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // --- 会话名标注：全览时告诉人「这团星是哪几段对话」 ---
    // 星图最大的门槛是「看得到形状，不知道形状是谁」。这里只标节点最多的前 8 段，
    // 彼此离得近的让位，避免一屏散着十几个标签谁也看不清。
    if (layerFade >= 1 && !viewAnim) drawSessLabels();
  }

  var _lblKey = '', _lblList = null;
  function drawSessLabels() {
    if (cam.s >= 2.0 || matchScores || ringMode || overlapOn || selIdx >= 0) return;
    if (!SESS) return;
    var key = Math.round(cam.s * 24) + '|' + Math.round(cam.x * 24) + '|' + Math.round(cam.y * 24)
      + '|' + visN + '|' + activeSid + '|' + cam.s.toFixed(2);
    if (key !== _lblKey) {
      _lblKey = key;
      var by = {}, sid;
      for (var i = 0; i < visList.length; i++) {
        var n = NODES[visList[i]];
        if (!n.bright) continue;
        if (activeSid >= 0 && n.sid !== activeSid) continue;
        if (n.sx < 50 || n.sx > W - 50 || n.sy < 76 || n.sy > H - 70) continue;
        var cur = by[n.sid];
        if (!cur || (n.R || 0) > (cur.R || 0)) by[n.sid] = n;
      }
      var arr = [];
      for (sid in by) arr.push(by[sid]);
      arr.sort(function (a, b) {
        return ((SESS[b.sid] && SESS[b.sid].count) || 0) - ((SESS[a.sid] && SESS[a.sid].count) || 0);
      });
      var picked = [];
      for (var k = 0; k < arr.length && picked.length < 8; k++) {
        var n2 = arr[k], ok = true;
        for (var p = 0; p < picked.length; p++) {
          var dx = n2.sx - picked[p].sx, dy = n2.sy - picked[p].sy;
          if (dx * dx + dy * dy < 132 * 132) { ok = false; break; }
        }
        if (ok) picked.push(n2);
      }
      _lblList = picked;
    }
    if (!_lblList || !_lblList.length) return;
    var lk = Math.min(1, Math.max(0, (1.95 - cam.s) / 0.5));   // 越放大越淡，放大后就靠详情认了
    if (lk <= 0.02) return;
    ctx.save();
    ctx.font = '500 11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var j = 0; j < _lblList.length; j++) {
      var n3 = _lblList[j];
      var sv = SESS[n3.sid];
      var t = (sv && sv.title) ? sv.title : '';
      if (!t) continue;
      if (t.length > 13) t = t.slice(0, 12) + '…';
      if (n3.sx < -20 || n3.sx > W + 20 || n3.sy < -20 || n3.sy > H + 20) continue;
      var lx = n3.sx + 9, ly = n3.sy - 9;
      ctx.globalAlpha = 0.55 * lk;
      ctx.fillStyle = theme === 'deep' ? 'rgba(4,10,18,.9)' : 'rgba(252,248,242,.9)';
      ctx.fillText(t, lx + 1, ly + 1);
      ctx.globalAlpha = 0.88 * lk;
      ctx.fillStyle = theme === 'deep' ? '#b6d8f5' : '#4a3a2e';
      ctx.fillText(t, lx, ly);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 选中的那颗星单独画在最上层：大图 + 光晕 + 取景框
  function drawSelectedNode(time) {
    var idx = selIdx;
    if (idx < 0) return;
    var n = NODES[idx];
    if (!n.vis) return;
    var sx = n.sx, sy = n.sy;
    if (sx < -1000) return;
    var zoom = cam.s;
    var col = (n.zone ? TH.cmp[n.k] : TH.node[n.k]) || '#fff';
    var th = n.th ? getThumb(n.th) : null;
    if (zoom > 1.4 && th && th.ready) {
      var ar = n.ar || 1.6;
      var tsz = Math.max(100, Math.min(168, 62 + (zoom - 1.4) * 34));
      var tw0 = tsz, th0 = tw0 / ar;
      if (th0 > tsz * 1.4) { th0 = tsz * 1.4; tw0 = th0 * ar; }
      // 选中星的卡片也会「加载好就突然变大」，同样淡入，别让人看到那一下
      var selFade = th.t ? Math.min(1, (performance.now() - th.t) / 240) : 1;
      selFade = 0.15 + 0.85 * selFade;
      ctx.globalAlpha = selFade;
      ctx.save();
      ctx.shadowColor = hexA(col, 0.95 * selFade);
      ctx.shadowBlur = 30 * selFade;
      roundRect(ctx, sx - tw0 / 2, sy - th0 / 2, tw0, th0, 6);
      ctx.clip();
      ctx.drawImage(th.img, sx - tw0 / 2, sy - th0 / 2, tw0, th0);
      ctx.restore();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      roundRect(ctx, sx - tw0 / 2, sy - th0 / 2, tw0, th0, 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      var sp;
      if (emoMode) sp = sprites.emo[emoSlot(n)];
      else if (n.k === 'image') sp = (n.hu == null)
        ? (n.zone ? sprites.plainC : sprites.plain)
        : (n.zone ? sprites.imageC : sprites.image)[n.hi < 0 ? 1 : n.hi];
      else if (n.k === 'text') sp = n.zone ? sprites.textC : sprites.text;
      else sp = n.zone ? sprites.memoryC : sprites.memory;
      if (sp) {
        var sr = 62;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(sp, sx - sr / 2, sy - sr / 2, sr, sr);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = TH.core;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, 6.283);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    drawSelectHalo(idx, time);
    // 上一颗星：环淡出（240ms），视觉上像"光从这颗移到那颗"
    if (selFrom >= 0 && selFrom !== idx) {
      var k = (performance.now() - selFromT0) / 240;
      if (k >= 1) selFrom = -1;
      else {
        var fn = NODES[selFrom];
        if (fn && fn.vis && fn.sx > -1000) {
          var fcol = (fn.zone ? TH.cmp[fn.k] : TH.node[fn.k]) || '#fff';
          var fr = 26 + (1 - k) * 16;
          ctx.globalAlpha = Math.max(0, 1 - k) * 0.55;
          ctx.strokeStyle = fcol;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(fn.sx, fn.sy, fr, 0, 6.283);
          ctx.stroke();
          // 中心再留一点余光
          ctx.globalAlpha = Math.max(0, 1 - k) * 0.35;
          ctx.fillStyle = fcol;
          ctx.beginPath();
          ctx.arc(fn.sx, fn.sy, 2.4 + (1 - k) * 2, 0, 6.283);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    // 收藏过的：选中状态下也保留星芒
    if (marks.star[nkey(idx)]) {
      var sgl = 0.5 + 0.5 * Math.sin(time * 0.0016 + n.ph);
      var sarm = 34 + 10 * sgl;
      ctx.globalAlpha = 0.35 + 0.35 * sgl;
      ctx.strokeStyle = '#ffd479';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - sarm, sy); ctx.lineTo(sx + sarm, sy);
      ctx.moveTo(sx, sy - sarm); ctx.lineTo(sx, sy + sarm);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  var hoverIdx = -1, selIdx = -1;
  // 选中星「换人」时不要瞬切：旧的那颗淡出 0.24s、新的淡入 0.18s，
  // 否则连点两颗星会看到两圈光环同时亮，割裂。
  var selT0 = 0, selFrom = -1, selFromT0 = 0;
  var lastSelAt = 0;          // 上一次点星的时间，用来识别「连点」
  var relRingSet = {};        // 选中星周围「套光圈」的那几颗（最多 8）
  function selFadeIn() {
    var k = Math.min(1, Math.max(0, (performance.now() - selT0) / 240));
    return k * k * (3 - 2 * k);      // smoothstep：光圈是"长出来"的，不是"蹦出来"的
  }

  function drawHoverLinks(idx, time) {
    var n = NODES[idx];
    var sx = n.sx, sy = n.sy;
    var list = nodesBySid[n.sid] || [];
    var pos = list.indexOf(idx);
    ctx.strokeStyle = theme === 'deep' ? 'rgba(140,210,255,.30)' : 'rgba(255,190,150,.26)';
    for (var k = -2; k <= 2; k++) {
      if (!k) continue;
      var q = list[pos + k];
      if (q == null) continue;
      var m = NODES[q];
      if (!m.vis) continue;
      var mx = m.sx, my = m.sy;
      ctx.globalAlpha = 0.5 / Math.abs(k);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(mx, my);
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function selThumbSize(zoom) { return Math.max(100, Math.min(168, 62 + (zoom - 1.4) * 34)); }

  function drawSelectHalo(idx, time) {
    var A = selFadeIn();
    var n = NODES[idx];
    var sx = n.sx, sy = n.sy;
    if (sx < -1000) return;
    var zoom = cam.s;
    var isThumb = zoom > 1.4 && n.th;
    var pulse = 0.5 + 0.5 * Math.sin(time * 0.0022);
    var col = (n.zone ? TH.cmp[n.k] : TH.node[n.k]) || '#fff';
    ctx.strokeStyle = col;
    if (isThumb) {
      // 放大成照片时：画一个取景框
      var tsz = selThumbSize(zoom);
      var ar = n.ar || 1.6;
      var bw = tsz, bh = tsz / ar;
      if (bh > tsz * 1.4) { bh = tsz * 1.4; bw = bh * ar; }
      var pad = 5 + pulse * 2;
      ctx.globalAlpha = (0.55 + pulse * 0.35) * A;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(bw, bh) * 0.72 + pad, 0, 6.283);
      ctx.stroke();
      // 四角准星
      ctx.globalAlpha = 0.75 * A;
      var arm = 9, hw = bw / 2 + pad, hh = bh / 2 + pad;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (sg) {
        ctx.beginPath();
        ctx.moveTo(sx + sg[0] * hw, sy + sg[1] * (hh - arm));
        ctx.lineTo(sx + sg[0] * hw, sy + sg[1] * hh);
        ctx.lineTo(sx + sg[0] * (hw - arm), sy + sg[1] * hh);
        ctx.stroke();
      });
    } else {
      ctx.globalAlpha = (0.30 + pulse * 0.35) * A;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, 18 + pulse * 10, 0, 6.283);
      ctx.stroke();
      ctx.globalAlpha = (0.14 + pulse * 0.18) * A;
      ctx.beginPath();
      ctx.arc(sx, sy, 28 + pulse * 14, 0, 6.283);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
