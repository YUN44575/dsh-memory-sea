  // ================= 检索结果面板（照参考图：左侧划线定位，右侧列表带缩略图和命中度） =================
  function showResults(qtext, scored, th) {
    var idxs = [];
    for (var i = 0; i < N; i++) {
      if (scored[i] <= th) continue;
      if (dataSrc === 'sc' ? NODES[i].src_ !== 'sc' : NODES[i].src_ === 'sc') continue;
      idxs.push(i);
    }
    idxs.sort(function (a, b) { return scored[b] - scored[a]; });
    var panel = document.getElementById('results');
    var list = document.getElementById('rlist');
    var peak = idxs.length ? scored[idxs[0]] : 1;
    var html = '';
    var shown = 0, seen = {};
    for (var k = 0; k < idxs.length && shown < 12; k++) {
      var n = NODES[idxs[k]];
      // 同一条模板消息会出现几十遍，列表里只留最早那条
      var sig = n.th ? ('t' + n.th) : ('x' + (n.txt || '').replace(/\s+/g, '').slice(0, 24));
      if (seen[sig]) continue;
      seen[sig] = 1;
      var thumb = '';
      if (n.th) {
        var tUrl = thumbURL(n.th);
        if (tUrl) thumb = '<img class="thumb" src="' + tUrl + '" alt="" loading="lazy">';
      }
      if (!thumb) thumb = '<div class="thumb"></div>';
      var title = maskText(n.txt || '').replace(/^@?\S*\.(png|jpg|jpeg|webp)\s*/i, '').trim();
      if (!title) title = SESS[n.sid] ? sessLabel(SESS[n.sid]) : '';
      if (!title) title = n.k === 'image' ? '一张图' : '一段记忆';
      title = title.replace(/\s+/g, ' ');
      if (title.length > 60) title = title.slice(0, 60) + '…';
      var d = new Date(n.t);
      var dateStr = (d.getMonth() + 1) + '/' + d.getDate();
      var pct = Math.round(Math.min(1, n.score / peak) * 100);
      // 为什么这一条被搜到？命中的可能是「我写的备注 / 标签」而不是正文
      var ql = String(qtext).trim().toLowerCase();
      var hitWhy = '';
      if (ql) {
        var tgs5 = marks.tag[n.id || ('i' + n.i)] || [];
        for (var w5 = 0; w5 < tgs5.length; w5++) {
          var tl5 = String(tgs5[w5]).toLowerCase();
          if (tl5.indexOf(ql) >= 0 || ql.indexOf(tl5) >= 0) { hitWhy = '标签'; break; }
        }
        if (!hitWhy && marks.note[n.id || ('i' + n.i)] && String(marks.note[n.id || ('i' + n.i)]).toLowerCase().indexOf(ql) >= 0) hitWhy = '备注';
      }
      html += '<div class="ritem" data-idx="' + n.i + '">'
        + '<div class="num">' + (shown + 1) + '</div>' + thumb
        + '<div class="body"><div class="ttl">' + escapeHtml(title) + '</div>'
        + '<div class="meta"><span>' + dateStr + '</span><span>' + kindLabel(n.k) + '</span>'
        + (hitWhy ? '<span class="why">' + hitWhy + '</span>' : '')
        + '<span class="score">' + pct + '%</span></div></div></div>';
      shown++;
    }
    document.getElementById('rtitle').textContent = '「' + qtext + '」· ' + shown + ' 条';
    list.innerHTML = html;
    panel.classList.add('open');
    document.body.classList.add('panel-open');
    panShiftTgt = -196;
    var items = list.querySelectorAll('.ritem');
    for (var w = 0; w < items.length; w++) {
      items[w].addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-idx'), 10);
        selectNode(idx);
      });
    }
  }

  function hideResults() {
    var p = document.getElementById('results');
    if (p && p.classList.contains('open')) {
      p.classList.remove('open');
      if (focusIdx < 0) panShiftTgt = 0;
      if (!document.getElementById('shelf').classList.contains('open')
          && !document.getElementById('detail').classList.contains('open')) {
        document.body.classList.remove('panel-open');
      }
    }
  }

  function kindLabel(k) {
    return k === 'image' ? '图像' : (k === 'memory' ? '长期记忆' : '话语');
  }

  // 会话的显示名：layout.mjs 会给人设注入型的会话生成一个可读的 label
  //（「【当前时间】2026/10/30 01:50:4」→「鲸鲸 · 怎么帮你解决」），没有就用原标题
  function sessLabel(sv) {
    if (!sv) return '';
    return sv.label || sv.title || ('会话 ' + (sv.id || ''));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
