  // ================= 过滤状态 =================
  var kinds = { image: true, text: true, memory: true };
  var activeSid = -1;           // -1 = 全部
  var timeRange = [SEA.t0, SEA.t1];

  function nodeVisible(n) {
    if (!kinds[n.k]) return false;
    if (zoneFilter >= 0 && n.dm !== zoneFilter) return false;
    // 点开一段对话时，别的星不隐藏、只变暗 —— 要的是"这一段连成星座"，
    // 不是"只准看这一段"（隐藏了就没法退出、也看不到它在海里的位置）
    if (n.t < timeRange[0] || n.t > timeRange[1]) return false;
    return true;
  }

  var visDirty = true;
  var relatedSet = null;        // 选中某颗星后，只保留与它相关的记忆
  function refreshFilter() {
    var threshold = 0;
    if (matchScores) threshold = matchTh;
    for (var k = 0; k < N; k++) {
      var n = NODES[k];
      // 一次只看一片海
      if (!overlapOn && (dataSrc === 'sc' ? n.src_ !== 'sc' : n.src_ === 'sc')) { n.vis = 0; n.matched = 1; continue; }
      // 来源维度：按"谁说的话"筛。一旦筛了就不再按层卡 —— 那 47 条团队协作消息
      // 恰好都被 t-SNE 投到浅层，不放开就会「点了协作还是看不见」。
      if (dataSrc === 'dsh' && typeof srcOn === 'object' && srcFiltering() && !srcOn[n.s]) {
        n.vis = 0; n.matched = 1; continue;
      }
      var v = nodeVisible(n);
      if (relatedSet && !relatedSet.has(k)) v = false;
      if (tagFilter && (marks.tag[nkey(k)] || []).indexOf(tagFilter) < 0) v = false;
      if (marks.hide[nkey(k)]) v = false;
      if (marks.arch[skey(n.sid)]) v = false;      // 归档的整段会话不进主海
      // 主题就是记忆层：深海只看沉下去的，浅滩只看还漂着的
      // 但搜索时不按层卡——在浅层里搜到一条深层记忆，它必须能被看见，
      // 否则右边列表有、画面上没有，会让人以为搜错了。
      if (!matchScores) {
        if (futureDays > 0) {
          // 「往后看」时不按层卡：整片海铺开，让星自己一颗颗按留存强度暗下去，
          // 不然深层视图里只看到"记得的那批"，看不出海在缩小。
        } else if (!(dataSrc === 'dsh' && typeof srcOn === 'object' && srcFiltering())) {
          // 按来源筛的时候也不按层卡：筛完就该看到这一类的全部，不该再少一半
          if (TH.layer === 'deep' && !isDeepLayer(n)) v = false;
          else if (TH.layer === 'shallow' && isDeepLayer(n)) v = false;
        }
      }
      if (matchScores) {
        var s = matchScores[k];
        if (s > threshold) { n.matched = 1; n.score = s; }
        else { n.matched = 0; }
      } else { n.matched = 1; n.score = 0; }
      n.vis = v ? 1 : 0;
    }
    visDirty = true;
    countVisible();
    updateTagBar();
  }

  // 与某颗星"相关"的记忆：同一段意识流里时间最近的 40 条 + 语义最相近的 120 条