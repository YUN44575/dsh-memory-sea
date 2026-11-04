  // ================= 回顾：把一段时间折成一张卡 =================
  // 问题意识：星图能看出"这堆记忆长得像什么"，看不出"上个月我到底在忙什么"。
  // 这里选一段时间，把它压成：那段时间的样子 + 这堆记忆的健康状况 + 值得再看一眼的几条。
  var rvPreset = '7', rvFrom = 0, rvTo = 0;

  function rvRange() {
    var now = (typeof SEA !== 'undefined' && SEA.t1) ? SEA.t1 : Date.now();
    var t0 = (typeof SEA !== 'undefined' && SEA.t0) ? SEA.t0 : now - 30 * 864e5;
    if (rvPreset === 'all') return [t0, now];
    if (rvPreset === 'today') {
      var d0 = new Date(now); d0.setHours(0, 0, 0, 0);
      return [Math.max(t0, d0.getTime()), now];
    }
    if (rvPreset === '30') return [Math.max(t0, now - 30 * 864e5), now];
    if (rvPreset === '7') return [Math.max(t0, now - 7 * 864e5), now];
    return [rvFrom || Math.max(t0, now - 7 * 864e5), rvTo || now];
  }

  /** 全量的「这个词最后一次出现在什么时候」，用来判断"后来再没提过" */
  var rvLastWord = null;
  function rvBuildWordIndex() {
    if (rvLastWord) return rvLastWord;
    var m = {};
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      var kw = n.kw || [];
      for (var j = 0; j < kw.length; j++) {
        var w = kw[j];
        if (!w || w.length < 2) continue;
        if (!m[w] || m[w] < n.t) m[w] = n.t;
      }
    }
    rvLastWord = m;
    return m;
  }

  function rvDayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function rvData() {
    var rg = rvRange(), a = rg[0], b = rg[1];
    var idx = [], byDay = {}, bySrc = {}, bySess = {}, sessLast = {}, worldN = 0, dupN = 0, noteN = 0, imgN = 0, imgList = [];
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      // 只算当前这片海：DSH 海和 SurfCore 海不能混着数
      if ((dataSrc === 'sc') !== (n.src_ === 'sc')) continue;
      if (n.t < a || n.t > b) continue;
      idx.push(i);
      var dk = rvDayKey(n.t);
      byDay[dk] = (byDay[dk] || 0) + 1;
      bySrc[n.s] = (bySrc[n.s] || 0) + 1;
      if (n.sid >= 0) {
        bySess[n.sid] = (bySess[n.sid] || 0) + 1;
        if (!sessLast[n.sid] || n.t > NODES[sessLast[n.sid]].t) sessLast[n.sid] = i;
      }
      if (n.w) worldN++;
      if (n.dp) dupN++;
      if (n.th) imgN++;
      if (marks.note[nkey(i)]) noteN++;
      if (n.th && imgList.length < 12) imgList.push(i);
    }
    idx.sort(function (x, y) { return NODES[x].t - NODES[y].t; });

    // 后来再没提过的：这段时间里说的话，那些关键词在整片海里此后没再出现
    var last = rvBuildWordIndex();
    var forgotten = [];
    for (var k = 0; k < idx.length; k++) {
      var nn = NODES[idx[k]];
      var kw2 = (nn.kw || []).filter(function (w) { return w && w.length >= 2 && !/[0-9]/.test(w); });
      if (!kw2.length) continue;
      var gone = true;
      for (var q = 0; q < kw2.length; q++) { if (last[kw2[q]] > nn.t) { gone = false; break; } }
      if (gone) forgotten.push(idx[k]);
    }

    // 每天一条的高度
    var days = Object.keys(byDay).sort();
    var maxDay = 1;
    days.forEach(function (d) { if (byDay[d] > maxDay) maxDay = byDay[d]; });
    var sessRank = Object.keys(bySess).sort(function (x, y) { return bySess[y] - bySess[x]; }).slice(0, 5);

    return {
      a: a, b: b, n: idx.length, idx: idx, days: days, byDay: byDay, maxDay: maxDay,
      bySrc: bySrc, bySess: bySess, sessLast: sessLast, worldN: worldN, dupN: dupN, noteN: noteN, imgN: imgN,
      sessRank: sessRank, forgotten: forgotten, imgList: imgList,
    };
  }

  function rvPicks(d) {
    // 值得再看一眼：最长的 / 带图的 / 你写过备注的 / 后来再没提过的
    var out = [], used = {};
    function push(i, why) {
      if (i == null || used[i] || out.length >= 6) return;
      used[i] = 1;
      out.push({ i: i, why: why });
    }
    if (d.forgotten.length) push(d.forgotten[d.forgotten.length - 1], '说完就再没提过');
    var longest = d.idx.slice().sort(function (x, y) { return (NODES[y].txt || '').length - (NODES[x].txt || '').length; })[0];
    push(longest, '那几天说得最长的一段');
    for (var i = d.idx.length - 1; i >= 0 && out.length < 6; i--) { if (NODES[d.idx[i]].th) { push(d.idx[i], '带着一张图'); break; } }
    for (var j = 0; j < d.idx.length && out.length < 6; j++) { if (marks.note[nkey(d.idx[j])]) { push(d.idx[j], '你给它写过备注'); break; } }
    var mid = d.idx[Math.floor(d.idx.length / 2)];
    push(mid, '那段时间正当中的一句');
    if (d.forgotten.length > 1) push(d.forgotten[0], '说完就再没提过');
    return out;
  }

  function rvCardText(d) {
    var fd = function (t) { var x = new Date(t); return (x.getMonth() + 1) + '.' + x.getDate(); };
    var L = [];
    L.push('## ' + fd(d.a) + ' → ' + fd(d.b) + '（' + d.days.length + ' 天）');
    L.push('');
    L.push('一共 ' + d.n + ' 条记忆' + (d.idx.length ? '，来自 ' + Object.keys(d.bySrc).length + ' 类来源' : '') + '。');
    if (d.days.length) {
      var mx = d.days.slice().sort(function (x, y) { return d.byDay[y] - d.byDay[x]; })[0];
      L.push('最多的一天是 ' + mx + '（' + d.byDay[mx] + ' 条）。');
    }
    L.push('');
    L.push('**这段时间里：**');
    L.push('- 有 ' + d.worldN + ' 条，世界那边也记了一笔');
    L.push('- 有 ' + d.dupN + ' 条是重复的');
    L.push('- 你给 ' + d.noteN + ' 条写过备注');
    if (d.imgN) L.push('- ' + d.imgN + ' 条带着图');
    if (d.forgotten.length) L.push('- ' + d.forgotten.length + ' 条说完就再没提过');
    if (d.imgList.length) L.push('- ' + d.imgList.length + ' 张图（至少）');
    return L.join('\n');
  }

  function rvCopy() {
    var d = rvData();
    var txt = rvCardText(d);
    try {
      navigator.clipboard.writeText(txt);
      mgToast('这一段时间已经复制成文字了');
    } catch (e) {
      mgToast('复制失败，可以手动选中');
    }
  }

  function renderMgReview() {
    var body = document.getElementById('mgbody');
    var cnt = document.getElementById('mgcount');
    if (!body) return;
    if (mgTab !== 'review') return;
    var d = rvData();
    if (cnt) cnt.textContent = d.n + ' 条 · ' + d.days.length + ' 天';

    var fd = function (t) { var x = new Date(t); return (x.getMonth() + 1) + '.' + x.getDate(); };
    var h = '<div class="rvwrap">';

    // 时间选择
    h += '<div class="rvbar">';
    h += '<button class="rvbtn' + (rvPreset === 'today' ? ' on' : '') + '" data-rv="today">今天</button>';
    h += '<button class="rvbtn' + (rvPreset === '7' ? ' on' : '') + '" data-rv="7">最近 7 天</button>';
    h += '<button class="rvbtn' + (rvPreset === '30' ? ' on' : '') + '" data-rv="30">最近 30 天</button>';
    h += '<button class="rvbtn' + (rvPreset === 'all' ? ' on' : '') + '" data-rv="all">全部</button>';
    h += '<span class="rvsp"></span>';
    h += '<button class="rvbtn" id="rvcopy">复制成文字</button>';
    h += '</div>';

    if (!d.n) {
      h += '<div class="mgo">这段时间里没有记忆。换个范围试试。</div></div>';
      body.innerHTML = h;
      bindRv();
      return;
    }

    // 卡片一：这段时间的样子
    h += '<div class="rvcard">';
    h += '<div class="rvh"><b>' + fd(d.a) + ' → ' + fd(d.b) + '</b><span>' + d.days.length + ' 天 · ' + d.n + ' 条记忆</span></div>';
    h += '<div class="rvchart">';
    var maxH = 46;
    d.days.forEach(function (dk) {
      var v = d.byDay[dk];
      var hh = Math.max(2, Math.round(v / d.maxDay * maxH));
      h += '<i style="height:' + hh + 'px" title="' + dk + '：' + v + ' 条"></i>';
    });
    h += '</div>';
    var mxDay = d.days.slice().sort(function (x, y) { return d.byDay[y] - d.byDay[x]; })[0];
    h += '<div class="rvfoot">最多的一天 <b>' + mxDay + '</b>（' + d.byDay[mxDay] + ' 条）</div>';

    // 来源
    var srcKeys = Object.keys(d.bySrc).sort(function (x, y) { return d.bySrc[y] - d.bySrc[x]; });
    h += '<div class="rvsec">来源</div><div class="rvsrc">';
    srcKeys.forEach(function (k) {
      h += '<span><i style="background:' + (MG_SRC_COLOR[k] || '#7fa8cc') + '"></i>' + esc(mgSrcName(k)) + ' <b>' + d.bySrc[k] + '</b></span>';
    });
    h += '</div>';

    // 会话
    if (d.sessRank.length) {
      h += '<div class="rvsec">说得最多的几段对话</div><div class="rvsess">';
      d.sessRank.forEach(function (sid) {
        var s = SESS[sid];
        if (!s) return;
        var li = d.sessLast[sid];
        h += '<div' + (li >= 0 ? ' class="rvsgo" data-i="' + li + '" title="跳到这一段里最近的一条"' : '') +
             '><span>' + esc(sessLabel(s)) + '</span><b>' + d.bySess[sid] + ' 条</b></div>';
      });
      h += '</div>';
    }

    // 这几天的图
    if (d.imgList.length) {
      h += '<div class="rvsec">这几天发过的图</div><div class="rvimgs">';
      d.imgList.forEach(function (ii) {
        h += '<img src="thumbs/' + esc(NODES[ii].th) + '.jpg" data-i="' + ii + '" alt="">';
      });
      h += '</div>';
    }
    h += '</div>';

    // 卡片二：这堆记忆的健康状况
    h += '<div class="rvcard">';
    h += '<div class="rvh"><b>这堆记忆的状况</b></div>';
    h += '<div class="rvhealth">';
    h += '<div><b>' + d.worldN + '</b><span>世界那边也记了一笔</span></div>';
    h += '<div><b>' + d.dupN + '</b><span>重复的</span></div>';
    h += '<div><b>' + d.noteN + '</b><span>你写过备注</span></div>';
    h += '<div><b>' + d.imgN + '</b><span>带着图</span></div>';
    h += '<div><b>' + d.forgotten.length + '</b><span>说完就再没提过</span></div>';
    h += '</div>';
    if (d.forgotten.length) {
      h += '<div class="rvhint">「说完就再没提过」＝ 那段话里的关键词，在这之后整片海都没再出现。不是不重要，是它只出现了一次。</div>';
    }
    h += '</div>';

    // 卡片三：值得再看一眼
    var picks = rvPicks(d);
    if (picks.length) {
      h += '<div class="rvcard">';
      h += '<div class="rvh"><b>值得再看一眼</b></div>';
      picks.forEach(function (p) {
        var n = NODES[p.i];
        var t = new Date(n.t);
        var tm = (t.getMonth() + 1) + '.' + t.getDate() + ' ' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
        var tx = String(n.txt || '').replace(/\s+/g, ' ')
          .replace(/\*\*/g, '').replace(/`/g, '').replace(/^#+\s*/, '').slice(0, 180);
        var s2 = SESS[n.sid];
        h += '<div class="rvpick" data-i="' + p.i + '">' +
          '<div class="rvt"><span>' + tm + '</span><span>' + esc(s2 ? sessLabel(s2) : '—') + '</span><em>' + esc(p.why) + '</em></div>' +
          '<div class="rvtx">' + esc(tx) + '</div></div>';
      });
      h += '</div>';
    }

    h += '</div>';
    body.innerHTML = h;
    bindRv();
  }

  function bindRv() {
    var body = document.getElementById('mgbody');
    if (!body) return;
    var btns = body.querySelectorAll('.rvbtn[data-rv]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (ev) {
        rvPreset = ev.currentTarget.getAttribute('data-rv');
        renderMgReview();
      });
    }
    var cp = document.getElementById('rvcopy');
    if (cp) cp.addEventListener('click', rvCopy);
    var imgs2 = body.querySelectorAll('.rvimgs img');
    for (var k = 0; k < imgs2.length; k++) {
      imgs2[k].addEventListener('click', function (ev) {
        goNode(Number(ev.currentTarget.getAttribute('data-i')));
      });
    }
    var sgo = body.querySelectorAll('.rvsgo');
    for (var m2 = 0; m2 < sgo.length; m2++) {
      sgo[m2].addEventListener('click', function (ev) {
        goNode(Number(ev.currentTarget.getAttribute('data-i')));
      });
    }
    var picks = body.querySelectorAll('.rvpick');
    for (var j = 0; j < picks.length; j++) {
      picks[j].addEventListener('click', function (ev) {
        goNode(Number(ev.currentTarget.getAttribute('data-i')));
      });
    }
  }
