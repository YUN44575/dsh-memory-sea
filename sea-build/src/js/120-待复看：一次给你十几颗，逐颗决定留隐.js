  // ================= 待复看：一次给你十几颗，逐颗决定留 / 隐 =================
  // 挑法照着「遗忘」来：R（留存强度）最低的 + 很久没碰的，再掺一点随机，
  // 不然每次都给你同十颗，过两遍就腻了。
  var review = { on: false, list: [], i: 0, done: 0 };
  function reviewPool() {
    var cand = [];
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!n.vis) continue;
      if (marks.hide[nkey(i)] || marks.arch[skey(n.sid)]) continue;
      var age = (Date.now() - n.t) / 86400000;            // 多少天没碰
      var score = (1 - Math.min(1, n.R || 0)) * 2 + Math.min(2, age / 20);
      cand.push({ i: i, s: score + Math.random() * 0.8 });
    }
    cand.sort(function (a, b) { return b.s - a.s; });
    return cand.slice(0, 14).map(function (o) { return o.i; });
  }
  function startReview() {
    clearBulk();
    review.list = reviewPool();
    if (!review.list.length) return;
    review.on = true;
    review.i = 0;
    review.done = 0;
    document.getElementById('review').classList.add('on');
    document.getElementById('hint').classList.add('out');
    reviewStep();
  }
  function stopReview() {
    review.on = false;
    document.getElementById('review').classList.remove('on');
  }
  function reviewStep() {
    if (!review.on) return;
    if (review.i >= review.list.length) {
      document.getElementById('rvCnt').textContent = '这一批过完了 · ' + review.done + ' 颗';
      setTimeout(function () { if (review.on) stopReview(); }, 1400);
      return;
    }
    var idx = review.list[review.i];
    var nn = NODES[idx];
    var days = Math.max(0, Math.round((Date.now() - nn.t) / 86400000));
    document.getElementById('rvCnt').textContent =
      '待复看 ' + (review.i + 1) + '/' + review.list.length
      + ' · 留存 ' + (nn.R == null ? '?' : nn.R.toFixed(2)) + ' · ' + days + ' 天前';
    selectNode(idx);
  }
  function reviewAdvance() {
    review.i++;
    reviewStep();
  }
  function bindReview() {
    var b = document.getElementById('rvbtn');
    if (!b || b.__bound) return;
    b.__bound = 1;
    b.onclick = function () { stopReview(); startReview(); };
    document.getElementById('rvKeep').onclick = function () {
      review.done++;
      reviewAdvance();
    };
    document.getElementById('rvHide').onclick = function () {
      var idx = review.list[review.i];
      if (idx != null) { marks.hide[nkey(idx)] = 1; saveMarks(); refreshFilter(); }
      review.done++;
      reviewAdvance();
    };
    document.getElementById('rvTag').onclick = function () {
      var idx = review.list[review.i];
      if (idx == null) return;
      var name = window.prompt('给这颗打标签：', '');
      if (name) addTagToMany([idx], name);
      review.done++;
      reviewAdvance();
    };
    document.getElementById('rvStop').onclick = function () { stopReview(); };
  }
