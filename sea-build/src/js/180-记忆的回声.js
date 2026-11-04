  // ================= 记忆的回声 =================
  // 关系边有三种：同一段对话里挨着的、关键词撞上的、位置挨着的。
  // 点一颗星的时候，从它出发 BFS，一圈一圈往外亮。
  var adj = null;
  function buildAdj() {
    adj = [];
    for (var i = 0; i < N; i++) adj.push([]);
    var seen = new Set();
    function link(a, b) {
      if (a === b || a < 0 || b < 0) return;
      var key = a < b ? a * 100000 + b : b * 100000 + a;
      if (seen.has(key)) return;
      seen.add(key);
      adj[a].push(b); adj[b].push(a);
    }
    // 同一段意识流里时间上挨着的
    for (var si = 0; si < nodesBySid.length; si++) {
      var list = nodesBySid[si];
      if (!list) continue;
      for (var k = 0; k < list.length; k++) {
        for (var d = 1; d <= 2; d++) {
          if (k + d < list.length) link(list[k], list[k + d]);
        }
      }
    }
    // 关键词撞上的（高频词跳过，否则会把全图连成一坨）
    var inv = {};
    for (var q = 0; q < N; q++) {
      var kws = NODES[q].kw || [];
      for (var w = 0; w < kws.length; w++) {
        var key2 = kws[w];
        (inv[key2] || (inv[key2] = [])).push(q);
      }
    }
    for (var kk in inv) {
      var arr = inv[kk];
      if (arr.length < 2 || arr.length > 40) continue;
      for (var x = 0; x < arr.length; x++) {
        for (var y = x + 1; y < arr.length; y++) link(arr[x], arr[y]);
      }
    }
    // 位置挨着的
    var CELL = 0.045, grid = {};
    for (var g = 0; g < N; g++) {
      var key3 = Math.floor(NODES[g].x / CELL) + ',' + Math.floor(NODES[g].y / CELL);
      (grid[key3] || (grid[key3] = [])).push(g);
    }
    for (var key4 in grid) {
      var cell = grid[key4];
      if (cell.length > 26) continue;
      for (var u = 0; u < cell.length && u < 8; u++) {
        for (var v = u + 1; v < cell.length && v < 8; v++) {
          var A = NODES[cell[u]], B = NODES[cell[v]];
          if (Math.hypot(A.x - B.x, A.y - B.y) < 0.03) link(cell[u], cell[v]);
        }
      }
    }
  }

  function buildEcho(center) {
    if (!adj) buildAdj();
    echoDist = new Float32Array(N).fill(-1);
    echoT0 = performance.now();
    echoDist[center] = 0;
    var frontier = [center];
    for (var depth = 1; depth <= 3; depth++) {
      var next = [];
      for (var f = 0; f < frontier.length; f++) {
        var i0 = frontier[f], nb = adj[i0] || [];
        for (var q = 0; q < nb.length; q++) {
          var j = nb[q];
          if (echoDist[j] < 0) { echoDist[j] = depth; next.push(j); }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
  }

  function clearEcho() { echoDist = new Float32Array(N).fill(-1); echoT0 = 0; }

  function computeRelated(idx) {
    var set = new Set();
    var n = NODES[idx];
    set.add(idx);
    var list = nodesBySid[n.sid] || [];
    var pos = list.indexOf(idx);
    if (pos >= 0) {
      for (var k = -20; k <= 20; k++) {
        var q = list[pos + k];
        if (q != null) set.add(q);
      }
    }
    var kw = n.kw || [];
    if (kw.length) {
      var bag = new Set(kw);
      var cand = [];
      for (var j = 0; j < N; j++) {
        if (set.has(j)) continue;
        if (marks.arch[skey(NODES[j].sid)]) continue;
        var m = NODES[j];
        if (!m.kw || !m.kw.length) continue;
        var hit = 0;
        for (var q2 = 0; q2 < m.kw.length; q2++) if (bag.has(m.kw[q2])) hit++;
        if (hit >= 2) cand.push([j, hit]);
      }
      cand.sort(function (a, b) { return b[1] - a[1]; });
      var LIM = Math.min(cand.length, 120);
      for (var t = 0; t < LIM; t++) set.add(cand[t][0]);
    }
    return set;
  }

  function countVisible() {
    var c = 0, cw = 0, cc = 0, cLong = 0;
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!(n.vis && n.matched)) continue;
      c++;
      if (n.dm) cc++; else cw++;
      if (n.R >= 0.999) cLong++;
    }
    var el = document.getElementById('statsub');
    visN = c;
    if (relatedSet) {
      el.innerHTML = '与这颗星相关 <b>' + c + '</b> 颗';
      return;
    }
    if (overlapOn) {
      var oD = 0, oS = 0;
      for (var oi = 0; oi < N; oi++) {
        var on = NODES[oi];
        if (!on.matched) continue;
        if (on.src_ === 'sc') oS++; else oD++;
      }
      var pr = (window.BRIDGE && window.BRIDGE.pairs) ? window.BRIDGE.pairs.length : 0;
      el.innerHTML = 'DSH <b>' + oD + '</b> 段记忆 · 她的记忆 <b>' + oS + '</b> · 重叠 <b>' + pr + '</b> 处';
    } else if (dataSrc === 'sc') {
      // 深/浅两层各有多少条：算整片海，不是只算当前这一层看得见的
      var cD = 0, cS = 0, cG = 0, cForget = 0;
      for (var gi = 0; gi < N; gi++) {
        var gn0 = NODES[gi];
        if (gn0.src_ !== 'sc' || !gn0.matched) continue;
        if (gn0.ghost) cG++;
        else if (futureDays > 0 && gn0.futC === 'forgotten') cForget++;
        else if (gn0.R >= DEEP_R) cD++; else cS++;
      }
      if (emoMode) {
        var eHot = 0, eCalm = 0;
        for (var ei = 0; ei < N; ei++) {
          var en = NODES[ei];
          if (dataSrc === 'sc' ? en.src_ !== 'sc' : en.src_ === 'sc') continue;
          if (en.emo >= 1) eHot++; else eCalm++;
        }
        el.innerHTML = '<b>' + (eHot + eCalm) + '</b> 条记忆 · 心里有过波澜 <b>' + eHot
          + '</b> · 平静的 <b>' + eCalm + '</b>';
        return;
      }
      if (futureDays > 0) {
        var cAll = cD + cS + cG + cForget;
        el.innerHTML = '往后 <b>+' + futureDays + '</b> 天 · 还记得 <b>' + cD + '</b> · 正在模糊 <b>'
          + cS + '</b> · 已经忘掉 <b>' + (cForget + cG) + '</b>　（现在 ' + cAll + ' 条）';
      } else {
        el.innerHTML = '她的记忆 <b>' + (cD + cS + cG) + '</b> 条 · 记得 <b>' + cD + '</b> · 淡了 <b>' + cS + '</b>'
          + (cG ? ' · 忘了 <b>' + cG + '</b>' : '');
      }
    } else {
      el.innerHTML = '<b>' + c + '</b> 颗记忆 · 工作 <b>' + cw + '</b> · 陪伴 <b>' + cc + '</b>';
    }
    var tv = document.getElementById('tv');
    if (tv && (travelOn || travelPaused)) {
      var d = new Date(TNOW);
      tv.textContent = (travelOn ? '⏸ ' : '↺ ') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
      tv.title = travelOn ? '再点一下停在这一刻' : '再点一下回到现在';
    }
  }
