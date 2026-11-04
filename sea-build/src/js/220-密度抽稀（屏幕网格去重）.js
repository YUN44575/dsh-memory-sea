  // ================= 密度抽稀（屏幕网格去重） =================
  // 星点太密时，每个格子只保留「最重要的那一颗」，小缩放下一眼看得清结构
  var visList = [];
  var gridArr = new Int32Array(1), gw = 1, gh = 1, GCELL = 22;

  function rebuildGrid() {
    gw = Math.max(1, Math.ceil(W / GCELL) + 2);
    gh = Math.max(1, Math.ceil(H / GCELL) + 2);
    gridArr = new Int32Array(gw * gh);
  }
  function nodeScore(n) {
    return (n.R || 0) * (n.dp ? 0.32 : 1) * (1 + (n.hl || 0) * 3);
  }
  var islandVis = new Int32Array(0);
  function countIslandVis() {
    if (!SEA.islands) return;
    if (islandVis.length !== SEA.islands.length) islandVis = new Int32Array(SEA.islands.length);
    else islandVis.fill(0);
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (n.vis && n.matched && n.isl != null) islandVis[n.isl]++;
    }
  }

  // 每段对话在"全览"时只留几颗代表星（亮的那些），放大才慢慢长回全量。
  // 但「全量」不是不画了——没被选中的星退成一层很淡的星尘，
  // 于是 1206 颗记忆全都还在海里，只是有些亮、有些暗。
  var PER_SID = 6;
  var CMP_MIN_BRIGHT = 22;      // 陪伴海保底亮星数（它只有 33 颗，按会话挑 + 网格去重会把它挑没）
  var DUST_UNTIL = 2.4;         // 相机放大到 2.4 倍以上就不再需要星尘层（全是亮星）
  function buildVisible() {
    visList.length = 0;
    var i, n;
    for (i = 0; i < N; i++) NODES[i].bright = 0;
    if (cam.s >= DUST_UNTIL) {
      // 放大到这一档就「全量点亮」。但一万颗星里大半在屏幕外——
      // 它们照样要进 visList，然后被星尘层和亮星层各遍历一遍才发现画不着。
      // 这里先按视口剔一遍（留 90px 边距，拖动时星星从边上长出来而不是跳出来）。
      // 只在节点多的时候做：少于 1200 颗时全遍历本来就没几个钱，省得引入边界抖动。
      var vpCut = N > 1200;
      var MX0 = 90;
      for (i = 0; i < N; i++) {
        n = NODES[i];
        if (!n.vis) continue;
        if (vpCut && (n.sx < -MX0 || n.sx > W + MX0 || n.sy < -MX0 || n.sy > H + MX0)) continue;
        n.bright = 1; n.rep = 1;
        visList.push(i);
      }
      return;
    }
    // 全览时按会话挑代表星（放大后逐步放宽）
    var keepSid = {};
    if (cam.s < 1.9) {
      // SurfCore 的「会话」只有四组（主人/自己/手动/B站），按每会话挑 6 颗就只剩 24 颗亮星，
      // 那片海会空得像没记忆。这里按会话数反推，让亮星总数回到 150 上下。
      var basePer = PER_SID;
      if (overlapOn) basePer = Math.max(basePer, 16);   // 两片海并排时，左边那段也要看得见
      if (dataSrc === 'sc') {
        var sn2 = Math.max(1, (SEA.sessions || []).length);
        basePer = Math.max(PER_SID, Math.round(150 / sn2));
      }
      var per = basePer + Math.floor(Math.max(0, (cam.s - 1.0)) * 7);
      var order = [];
      for (i = 0; i < N; i++) if (NODES[i].vis) order.push(i);
      order.sort(function (a, b) {
        var A = NODES[a], B = NODES[b];
        return (B.R * 0.6 + (B.k === 'memory' ? 0.4 : 0) + (B.th ? 0.1 : 0))
             - (A.R * 0.6 + (A.k === 'memory' ? 0.4 : 0) + (A.th ? 0.1 : 0));
      });
      for (var oi = 0; oi < order.length; oi++) {
        n = NODES[order[oi]];
        if (activeSid >= 0 && n.sid === activeSid) { n.rep = 1; continue; }
        var sid = n.sid;
        var got = keepSid[sid] || 0;
        if (got < per) { keepSid[sid] = got + 1; n.rep = 1; }
        else n.rep = 0;
      }
    } else {
      for (i = 0; i < N; i++) NODES[i].rep = 1;
    }
    // 屏幕网格去重：一格只亮一颗，避免糊成一团
    if (gridArr.length !== gw * gh) rebuildGrid();
    gridArr.fill(-1);
    for (i = 0; i < N; i++) {
      n = NODES[i];
      if (!n.vis) continue;
      if (!n.rep) continue;
      var gx = (n.sx / GCELL) | 0, gy = (n.sy / GCELL) | 0;
      if (gx < 0 || gx >= gw || gy < 0 || gy >= gh) continue;   // 屏幕外
      var gi = gy * gw + gx;
      var prev = gridArr[gi];
      if (prev < 0) { gridArr[gi] = i; continue; }
      if (nodeScore(n) > nodeScore(NODES[prev])) gridArr[gi] = i;
    }
    for (var g = 0; g < gridArr.length; g++) if (gridArr[g] >= 0) NODES[gridArr[g]].bright = 1;
    // 陪伴海保底：它体量小，被「每会话挑 6 颗 + 屏幕网格去重」筛完常常只剩五六颗，
    // 粉色的那片海在总览里几乎全灭，等于看不见。这里按分数补到 CMP_MIN_BRIGHT 颗。
    {
      var cmpB = 0, cmpCand = [];
      for (i = 0; i < N; i++) {
        n = NODES[i];
        if (!n.vis || n.dm !== 1) continue;
        if (n.bright) cmpB++; else cmpCand.push(i);
      }
      if (cmpB < CMP_MIN_BRIGHT && cmpCand.length) {
        cmpCand.sort(function (a, b) { return nodeScore(NODES[b]) - nodeScore(NODES[a]); });
        for (var ci = 0; ci < cmpCand.length && cmpB < CMP_MIN_BRIGHT; ci++) {
          var cn = NODES[cmpCand[ci]];
          if (cn.sx < 1 || cn.sx > W - 1 || cn.sy < 1 || cn.sy > H - 1) continue;
          cn.bright = 1; cmpB++;
        }
      }
    }
    // 全部可见的星都进绘制列表：亮的画成星，没选中的画成星尘
    for (i = 0; i < N; i++) if (NODES[i].vis) visList.push(i);
  }
