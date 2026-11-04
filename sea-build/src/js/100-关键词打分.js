  // ================= 关键词打分 =================
  function bigrams(s) {
    var out = {};
    var runs = s.match(/[\u4e00-\u9fa5]+|[a-z0-9]+/g);
    if (!runs) return out;
    for (var a = 0; a < runs.length; a++) {
      var run = runs[a];
      if (/^[a-z0-9]/.test(run)) {
        out[run] = 1;
      } else if (run.length === 1) {
        out[run] = 1;
      } else {
        for (var b = 0; b + 1 < run.length; b++) out[run.substr(b, 2)] = 1;
      }
    }
    return out;
  }

  // 预计算每节点的词袋（关键词 + 正文前 220 字）
  var nodeBags = new Array(N);
  for (var bi = 0; bi < N; bi++) {
    var bag = bigrams((NODES[bi].kw || []).join(' ') + ' ' + (NODES[bi].txtLower || '').slice(0, 220));
    nodeBags[bi] = bag;
  }

  var searchQ = null;   // 当前查询词袋
  var matchScores = null;
  var matchTh = 1;

  function runSearch(text) {
    var t = text.trim().toLowerCase();
    if (!t) {
      searchQ = null; matchScores = null;
      document.getElementById('qcnt').textContent = '';
      hideResults();
      refreshFilter(); return;
    }
    var q = bigrams(t);
    var qkeys = Object.keys(q);
    if (!qkeys.length) { searchQ = null; matchScores = null; hideResults(); refreshFilter(); return; }
    searchQ = qkeys;
    var scored = new Array(N);
    var max = 0;
    for (var a = 0; a < N; a++) {
      // 只搜当前这片海：搜「鲸鲸」不该从另一套数据里捞出一堆来
      if (dataSrc === 'sc' ? NODES[a].src_ !== 'sc' : NODES[a].src_ === 'sc') { scored[a] = 0; continue; }
      if (marks.arch[skey(NODES[a].sid)]) { scored[a] = 0; continue; }   // 归档的会话不参与搜索
      var bag = nodeBags[a];
      var hit = 0;
      for (var b = 0; b < qkeys.length; b++) if (bag[qkeys[b]]) hit++;
      var sc = hit / qkeys.length;
      // 正文直接包含原文，加权
      if (NODES[a].txtLower.indexOf(t) >= 0) sc = Math.max(sc, 0.88);
      // 关键词精确命中加权
      // 我自己写的备注和标签也算「内容」：打了「鲸鲸」标签就该搜得到，
      // 备注里写过的一句话也该搜得到 —— 否则管理成果会沉在海里捞不回来。
      var nt2 = marks.note[nkey(a)];
      if (nt2) {
        var nl = String(nt2).toLowerCase();
        if (nl.indexOf(t) >= 0) sc = Math.max(sc, 0.94);
        else {
          var nb = bigrams(nl), nh = 0;
          for (var q2 in q) if (nb[q2]) nh++;
          if (nh) sc = Math.max(sc, (nh / qkeys.length) * 0.9);
        }
      }
      var tgs3 = marks.tag[nkey(a)];
      if (tgs3 && tgs3.length) {
        for (var tg4 = 0; tg4 < tgs3.length; tg4++) {
          var tl = String(tgs3[tg4]).toLowerCase();
          if (tl.indexOf(t) >= 0 || t.indexOf(tl) >= 0) { sc = Math.max(sc, 0.96); break; }
        }
      }
      var kw = NODES[a].kw || [];
      for (var c = 0; c < kw.length; c++) if (kw[c].indexOf(t) >= 0 || t.indexOf(kw[c]) >= 0) { sc += 0.25; break; }
      scored[a] = sc;
      if (sc > max) max = sc;
    }
    var th = Math.max(0.24, max * 0.36);
    var cnt = 0;
    for (var d = 0; d < N; d++) if (scored[d] > th) cnt++;
    if (!cnt) {
      matchScores = null;
      document.getElementById('qcnt').textContent = '没有找到';
      hideResults();
      refreshFilter();
      // 只说「没有找到」等于把人晾在那儿：告诉他下一步能做什么
      var nfh = [];
      if (typeof srcFiltering === 'function' && srcFiltering()) nfh.push('点右上「来源」把来源全打开');
      if (TH && TH.layer !== 'deep') nfh.push('点「' + (TH.layer === 'shallow' ? '远洋' : '近岸') + '」换一层看看');
      nfh.push('换个更短的词、或者只搜一个关键词');
      toast('没找到「' + text.trim() + '」· ' + nfh.join('，'));
      return;
    }
    matchTh = th;
    matchScores = scored;
    document.getElementById('qcnt').textContent = cnt + ' 颗';
    refreshFilter();
    zoomToMatches(scored, th);
    showResults(text.trim(), scored, th);
  }
