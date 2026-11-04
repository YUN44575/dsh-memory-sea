  // ================= 收藏夹 / 已隐去 =================
  var shelfOpen = false;

  // 管理成果只存在浏览器里，换台机器就没了 —— 所以给一个「导出 / 导入」的出口
  function exportMarks() {
    var payload = {
      app: 'dsh-sea', v: 2, __v: 2, at: new Date().toISOString(),
      star: marks.star, hide: marks.hide, note: marks.note, arch: marks.arch, tag: marks.tag
    };
    var d = new Date();
    var pad = function (v) { return ('0' + v).slice(-2); };
    var name = '意识海-记忆标记-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
      + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function importMarks(file) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var o = JSON.parse(String(fr.result));
        if (!o || typeof o !== 'object') throw new Error('not json');
        ['star', 'hide', 'note', 'arch', 'tag'].forEach(function (k) {
          if (!o[k] || typeof o[k] !== 'object') return;
          Object.keys(o[k]).forEach(function (key) {
            var isIdx = /^\d+$/.test(key);   // v1 文件：键是数组下标；v2：键是稳定 id
            if (k === 'arch') {
              var target = isIdx ? (SESS[Number(key)] ? skey(Number(key)) : null) : key;
              if (target) marks.arch[target] = o[k][key];
              return;
            }
            var idx = isIdx ? Number(key) : idxOfKey(key);
            if (idx < 0 || !NODES[idx]) return;
            marks[k][nkey(idx)] = o[k][key];
          });
        });
        marks.__v = 2;
        saveMarks();
        refreshFilter();
        renderShelf();
        var t = document.getElementById('shtitle');
        if (t) t.textContent = t.textContent + ' · 已导入';
      } catch (e) {
        alert('这个文件读不出来：' + e.message);
      }
    };
    fr.readAsText(file);
  }
  /** 管理态键（id）→ NODES 下标；找不到返回 -1 */
  function idxOfKey(k) {
    var s = String(k);
    for (var i = 0; i < NODES.length; i++) { if (nkey(i) === s) return i; }
    return -1;
  }
  /** {id: 值} → [下标]，丢掉找不到的（会话换了/节点没了） */
  function idxList(map) {
    var out = [];
    Object.keys(map || {}).forEach(function (k) { var i = idxOfKey(k); if (i >= 0) out.push(i); });
    return out;
  }
  /** {会话id: 值} → [会话下标] */
  function sidList(map) {
    var out = [];
    Object.keys(map || {}).forEach(function (k) {
      var s = String(k);
      for (var i = 0; i < SESS.length; i++) { if (skey(i) === s) { out.push(i); break; } }
    });
    return out;
  }

  function renderShelf() {
    var body = document.getElementById('shbody');
    if (!body) return;
    var stars = idxList(marks.star);
    var hides = idxList(marks.hide);
    stars.sort(function (a, b) { return NODES[b].t - NODES[a].t; });
    hides.sort(function (a, b) { return NODES[b].t - NODES[a].t; });
    var html = '';
    html += '<div class="sec">收藏 · ' + stars.length + '</div>';
    if (!stars.length) html += '<div class="empty">还没有收藏。点开任意一颗星，点右上角 ☆</div>';
    for (var i = 0; i < stars.length; i++) html += shelfItem(NODES[stars[i]], stars[i], '星');
    html += '<div class="sec">已隐去 · ' + hides.length + '</div>';
    if (!hides.length) html += '<div class="empty">没有隐去的记忆</div>';
    for (var j = 0; j < hides.length; j++) html += shelfItem(NODES[hides[j]], hides[j], '显');
    // 标签：自己定的分类，点一个只留这一类
    var tagCnt = {}, tagTotal = 0;
    Object.keys(marks.tag || {}).forEach(function (i) {
      (marks.tag[i] || []).forEach(function (t) { tagCnt[t] = (tagCnt[t] || 0) + 1; tagTotal++; });
    });
    var tagNames = Object.keys(tagCnt).sort(function (a, b) { return tagCnt[b] - tagCnt[a]; });
    html += '<div class="sec">标签 · ' + tagNames.length + (tagFilter ? '（正在看「' + esc(tagFilter) + '」）' : '') + '</div>';
    if (!tagNames.length) html += '<div class="empty">还没有标签。点开一颗星，在「标签」里加一个</div>';
    else {
      html += '<div class="taggrid">';
      for (var tg1 = 0; tg1 < tagNames.length; tg1++) {
        html += '<span class="tg' + (tagFilter === tagNames[tg1] ? ' on' : '') + '" data-tag="' + esc(tagNames[tg1]) + '">'
          + esc(tagNames[tg1]) + '<b>' + tagCnt[tagNames[tg1]] + '</b></span>';
      }
      html += '</div>';
    }
    // 写过备注的：这些是「我亲自管过」的记忆
    var notes = idxList(marks.note);
    notes.sort(function (a, b) { return NODES[b].t - NODES[a].t; });
    html += '<div class="sec">备注 · ' + notes.length + '</div>';
    if (!notes.length) html += '<div class="empty">还没有备注。点开任意一颗星，在右下角写一句</div>';
    for (var q1 = 0; q1 < notes.length; q1++) html += shelfItem(NODES[notes[q1]], notes[q1], '备');
    // 归档的会话：整段收起来，不混进主海
    var archSids = sidList(marks.arch);
    html += '<div class="sec">归档的会话 · ' + archSids.length + '</div>';
    if (!archSids.length) html += '<div class="empty">没有归档的会话</div>';
    for (var q2 = 0; q2 < archSids.length; q2++) {
      var sid2 = archSids[q2], ss = SESS[sid2];
      html += '<div class="shitem arcrow" data-sid="' + sid2 + '">'
        + '<div class="ph"></div>'
        + '<div><div class="rt">' + esc(sessLabel(ss)) + '</div>'
        + '<div class="meta"><span>' + ss.count + ' 条</span><span>已归档</span></div></div>'
        + '<span class="un">恢复</span></div>';
    }
    body.innerHTML = html;
    var tgs = body.querySelectorAll('.tg[data-tag]');
    for (var ti2 = 0; ti2 < tgs.length; ti2++) {
      (function (el) {
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var t = el.getAttribute('data-tag');
          tagFilter = (tagFilter === t) ? null : t;
          refreshFilter();
          renderShelf();
          if (tagFilter) { camTarget.x = 0; camTarget.y = 0; camTarget.s = 1.02; }
          toggleShelf();
        });
      })(tgs[ti2]);
    }
    var els = body.querySelectorAll('.shitem');
    for (var k = 0; k < els.length; k++) {
      (function (el) {
        var sidAttr = el.getAttribute('data-sid');
        if (sidAttr != null) {
          el.querySelector('.un').addEventListener('click', function (ev) {
            ev.stopPropagation();
            toggleArchive(parseInt(sidAttr, 10));
          });
          return;
        }
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        var act = el.getAttribute('data-act');
        el.querySelector('.un').addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (act === '显') toggleHide(idx);
          else if (act === '备') {
            delete marks.note[nkey(idx)];
            saveMarks(); refreshFilter(); renderShelf();
          } else toggleStar(idx);
        });
        el.addEventListener('click', function () {
          if (shelfOpen) toggleShelf();
          selectNode(idx);
        });
      })(els[k]);
    }
    document.getElementById('shtitle').textContent =
      '记忆管理 · 收藏' + stars.length + ' · 备注' + notes.length
      + ' · 标签' + tagNames.length + ' · 隐去' + hides.length
      + (tagFilter ? ' · 只看「' + tagFilter + '」' : '');
  }

  function shelfItem(n, idx, act) {
    var thumb = n.th ? '<img class="thumb" loading="lazy" src="' + thumbURL(n.th) + '" alt="">' : '<div class="thumb"></div>';
    var t = (n.txt || '').replace(/^@?\S*\.(png|jpg|jpeg|webp)\s*/i, '').replace(/\s+/g, ' ').trim();
    if (!t) t = SESS[n.sid] ? sessLabel(SESS[n.sid]) : kindLabel(n.k);
    if (t.length > 46) t = t.slice(0, 46) + '…';
    var d = new Date(n.t);
    var ds = (d.getMonth() + 1) + '/' + d.getDate();
    var noteTxt = marks.note[nkey(idx)] ? ('· ' + marks.note[nkey(idx)].slice(0, 14)) : '';
    return '<div class="shitem" data-idx="' + idx + '" data-act="' + act + '">' + thumb
      + '<div class="body"><div class="ttl">' + esc(t) + '</div>'
      + '<div class="meta"><span>' + ds + '</span><span>' + kindLabel(n.k) + '</span><span>' + esc(noteTxt) + '</span></div></div>'
      + '<span class="un">' + (act === '显' ? '恢复' : '取消') + '</span></div>';
  }

  function bindShelfTools() {
    var ex = document.getElementById('shexport');
    var im = document.getElementById('shimport');
    var fl = document.getElementById('shfile');
    if (ex) ex.onclick = function (ev) { ev.stopPropagation(); exportMarks(); };
    if (im) im.onclick = function (ev) { ev.stopPropagation(); fl.click(); };
    if (fl) fl.onchange = function () { importMarks(fl.files && fl.files[0]); fl.value = ''; };
  }

  function toggleShelf() {
    shelfOpen = !shelfOpen;
    var p = document.getElementById('shelf');
    if (shelfOpen) {
      hideResults();
      if (selIdx >= 0) closeDetail();
      renderShelf();
      p.classList.add('open');
      panShiftTgt = -196;
    } else {
      p.classList.remove('open');
      if (focusIdx < 0) panShiftTgt = 0;
      if (!document.getElementById('results').classList.contains('open')
          && !document.getElementById('detail').classList.contains('open')) {
        document.body.classList.remove('panel-open');
      }
    }
  }
