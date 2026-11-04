  // ================= 往后看：按 SurfCore 的遗忘规则推演未来 =================
  // 规则是照 src/memory-card.js 的 targetClarity() 抄的（阈值 68/46/24/12、
  // 时间惩罚 0.35（主人重要记忆 0.12）、fuzzyAfterDays 之后才开始罚）。
  var SC_CFG = { recentDays: 7, fuzzyAfterDays: 7, forgetAfterDays: 60, minOwnerImportance: 65 };
  var CLAR_RANK = { vivid: 3, clear: 2, fuzzy: 1, trace: 0, forgotten: -1 };
  var RANK_CLAR = ['trace', 'fuzzy', 'clear', 'vivid'];
  var futureDays = 0;
  function scTarget(n, atMs) {
    if (n.pinned) return 'vivid';
    var imp = n.impRaw == null ? 0 : n.impRaw;
    var ageDays = Math.max(0, (atMs - (n.t || atMs)) / DAY);
    var sinceSeen = Math.max(0, (atMs - (n.seen || n.t || atMs)) / DAY);
    var ownImp = !!n.owner && imp >= SC_CFG.minOwnerImportance;
    var prot = n.initial === 1;
    if (ageDays > SC_CFG.forgetAfterDays && imp < 50 && !ownImp && !prot) return 'forgotten';
    var r = imp;
    r += Math.min(12, (n.recall || 0) * 2);
    if (ageDays <= SC_CFG.recentDays) r += 18;
    if (sinceSeen <= 2) r += 8;
    var rate = (ownImp || prot) ? 0.12 : 0.35;
    r -= Math.min(80, Math.max(0, ageDays - SC_CFG.fuzzyAfterDays) * rate);
    if (ownImp || prot) r = Math.max(r, 55);
    if (ageDays <= SC_CFG.recentDays) r = Math.max(r, 50);
    if (r >= 68) return 'vivid';
    if (r >= 46) return 'clear';
    if (r >= 24) return 'fuzzy';
    if (r >= 12) return 'trace';
    return 'forgotten';
  }
  // 每天最多降一档，所以不能直接取 N 天后的目标档，要一天一天走过去
  function futureClarity(n, days) {
    var cur = CLAR_RANK[n.clarity] != null ? n.clarity : 'vivid';
    if (!days) return cur;
    var base = dataNow || TNOW;
    // 只有四档、一天最多掉一档 → 走满 4 天一定已经到终点了，不必真的一天一天模拟。
    // （每天滑一次要跑 251×365 次 scTarget，那才是拖动卡的真凶。）
    if (days >= 4) {
      var tgt = scTarget(n, base + days * DAY);
      var c0 = CLAR_RANK[cur], t0 = CLAR_RANK[tgt];
      if (t0 < c0) return RANK_CLAR[Math.max(-1, t0)] || 'forgotten';
      if (t0 > c0) return RANK_CLAR[Math.min(3, c0 + 1)];
      return cur;
    }
    for (var d = 1; d <= days; d++) {
      var tg = scTarget(n, base + d * DAY);
      var ci = CLAR_RANK[cur], ti = CLAR_RANK[tg];
      if (ti < ci) {
        if (ci - 1 < 0) cur = 'forgotten';
        else if (ti < ci - 1) cur = RANK_CLAR[ci - 1];
        else cur = tg;
      } else if (ti > ci) {
        cur = RANK_CLAR[Math.min(3, ci + 1)];
      }
    }
    return cur;
  }
  function futureR(n) {
    if (n.k === 'ghost') return 0.02;
    var c = n.futC || 'vivid';
    var base = c === 'vivid' ? 0.92 : c === 'clear' ? 0.74 : c === 'fuzzy' ? 0.44 : c === 'trace' ? 0.26 : 0.03;
    return base * (0.86 + 0.14 * (n.imp || 0.5));
  }

  // 两个数据源的「层」说的不是同一件事：
  //   SurfCore 有真实的遗忘机制 → 深层 = 还记得，浅层 = 正在淡
  //   DSH 只是聊天记录、按时间衰减 → 深层 = 近几天的，浅层 = 更早的
  // 所以叫法要分开，否则用户看不懂「深层」对一段会话到底指什么。
  function layerWord(deep) {
    if (dataSrc === 'sc') return deep ? '深层' : '浅层';
    return deep ? '近岸' : '远洋';
  }
  function layerHint(deep) {
    if (dataSrc === 'sc') {
      return deep ? '深层 · 还记得的那些' : '浅层 · 正在淡忘的那些';
    }
    return deep ? '近岸 · 最近几天说的话' : '远洋 · 更早说过的话';
  }

  function retentionOf(n) {
    if (n.k === 'ghost') return 0.02;
    if (n.src_ === 'sc') return futureDays > 0 ? futureR(n) : surfcoreR(n);
    var imp = n.imp == null ? 0 : n.imp;
    // 长期记忆：明确的长期记忆条目，或重要性很高的事，不随时间衰减
    if (n.k === 'memory' || imp >= 0.6) return 1;
    // 短期记忆：艾宾浩斯式的指数遗忘，越重要衰减越慢（τ = 6~20 天）
    var tau = (6 + 14 * imp) * DAY;
    var age = Math.max(0, TNOW - (n.t || TNOW));
    return Math.exp(-age / tau);
  }

  for (var j = 0; j < N; j++) {
    var n = NODES[j];
    n.idx = j;
    n.ph = (j * 2.399963) % 6.283;        // 黄金角相位：呼吸不同步
    n.r0 = n.k === 'memory' ? 2.9 : (n.k === 'image' ? 2.15 : 1.65);
    if (n.ic > 1) n.r0 += Math.min(1.6, Math.log(n.ic) * 0.7);
    if (n.imp != null) n.r0 += n.imp * 1.1;
    n.hi = (n.k === 'image' && n.hu != null) ? Math.round(n.hu / 30) % 12 : -1;
    n.txtLower = (n.txt || '').toLowerCase();
    n.matched = 1;
    n.hl = 0;
    n.zone = n.dm ? 1 : 0;
    // 伪随机深度：让星云有厚度，自转时前后穿插
    n.z = (hashUnit(j * 127.1 + 311.7) * 2 - 1) * 0.62;
    n.R = retentionOf(n);
    n.sx = -1e5; n.sy = -1e5; n.persp = 1;
    // 归属到最近的岛（雾和骨架按"岛上还有没有可见的星"来画）
    if (SEA.islands) {
      var bi = 0, bd = 1e9;
      for (var ii = 0; ii < SEA.islands.length; ii++) {
        var il0 = SEA.islands[ii];
        var dd = Math.hypot(n.x - il0.x, n.y - il0.y);
        if (dd < bd) { bd = dd; bi = ii; }
      }
      n.isl = bi;
    }
  }

  function hashUnit(x) {
    var v = Math.sin(x * 0.0001 + 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  // 把"剩余强度 R"换成 0~1 的相对分位（最久远的 0，最新的 1），
  // 这样不管数据跨度多少天，旧记忆和新鲜记忆在视觉上始终拉得开。
  // 把"剩余强度 R"换成 0~1 的相对分位（最久远的 0，最新的 1），
  // 这样不管数据跨度多少天，旧记忆和新鲜记忆在视觉上始终拉得开。
  var _rankBuf = new Float64Array(0);
  function buildRetentionRank(force) {
    if (_rankBuf.length !== N) _rankBuf = new Float64Array(N);
    for (var i = 0; i < N; i++) _rankBuf[i] = NODES[i].R;
    var sorted = Array.prototype.slice.call(_rankBuf).sort(function (a, b) { return a - b; });
    for (var j2 = 0; j2 < N; j2++) {
      var v = NODES[j2].R, lo = 0, hi = sorted.length;
      while (lo < hi) { var m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
      var nr = lo / Math.max(1, sorted.length - 1);
      // 平滑追上去，别让整片海在快进时跳
      if (force || NODES[j2].rn == null) NODES[j2].rn = nr;
      else NODES[j2].rn += (nr - NODES[j2].rn) * 0.35;
    }
  }
  buildRetentionRank(true);

  // 重算整片海的留存（快进时按时间推进，静止时只跟真实时钟走）
  function recomputeRetention() {
    for (var i = 0; i < N; i++) NODES[i].R = retentionOf(NODES[i]);
    buildRetentionRank(false);
  }
