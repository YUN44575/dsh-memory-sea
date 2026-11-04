  // ================= 管理：收藏 / 隐去 / 备忘 =================
  // 🔑 键从「数组下标 i」换成了「稳定 id」（session-xxx:seq / 记忆卡 id）——
  //    下标会随管线重跑整体位移，收藏和标签就会挂到别的星上；id 不会。
  //    旧版（v1）按 i 存的数据在 migrateMarks() 里一次性翻译过来。
  // 📴 存两处：localStorage（离线/双击打开也能用）+ host 的 marks.json（插件里打开时两边共用一份，
  //    以前 file:// 与 http:// 不同源 = 两套管理，就是这个坑）。
  // 通用轻提示：右下角那个 #newver 条。之前各个功能各自写 toast，
  // 而 poster 里的 say 是函数内局部变量 —— 别处调用会直接 ReferenceError。
  var _toastT = null;
  function toast(msg) {
    var el = document.getElementById('newver');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(_toastT);
    _toastT = setTimeout(function () { el.classList.remove('on'); }, 3800);
  }

  var MARKS_KEY = 'sea.marks.v1';
  // 正文分片：data.js 里每条只带前 200 字（星图、列表、tip 都够用），
  // 更长的后半截在 texts.js 里，打开页面后静默补上；补上之前详情会先显示前 200 字。
  var TX = null, txLoading = false, txWait = [];
  function txtOf(n) {
    if (!n) return '';
    var base = n.txt || '';
    if (TX && n.id && TX[n.id]) return base + TX[n.id];
    return base;
  }
  function txtLoaded(n) { return !n || !n.rl || n.rl <= (n.txt || '').length || !!(TX && n.id && TX[n.id]); }
  function loadTX(cb) {
    if (cb) txWait.push(cb);
    if (TX || txLoading) { if (TX) { var q = txWait; txWait = []; q.forEach(function (f) { try { f(); } catch (e) {} }); } return; }
    txLoading = true;
    var el = document.createElement('script');
    el.src = 'texts.js?v=' + (SEA.builtAt || 0);
    el.onload = function () {
      TX = window.SEA_TX || {};
      txLoading = false;
      // 搜索索引里存的是小写正文，全文补上之后要重建一次，否则后半截搜不到
      for (var j = 0; j < N; j++) { NODES[j].txtLower = txtOf(NODES[j]).toLowerCase(); }
      if (typeof selIdx !== 'undefined' && selIdx >= 0) selectNode(selIdx);
      var q = txWait; txWait = [];
      q.forEach(function (f) { try { f(); } catch (e) {} });
    };
    el.onerror = function () { txLoading = false; };
    document.body.appendChild(el);
  }
  var marks = { __v: 2, star: {}, hide: {}, note: {}, arch: {}, tag: {} };
  var tagFilter = null;        // 按标签看海：null = 不过滤
  var marksApiOk = (location.protocol === 'http:' || location.protocol === 'https:');

  function nkey(idx) {
    var n = NODES[idx];
    if (!n) return 'x' + idx;
    return n.id ? String(n.id) : ('i' + idx);
  }
  function skey(sid) {
    var s = SESS[sid];
    if (!s) return 'x' + sid;
    return s.id ? String(s.id) : ('s' + sid);
  }

  try {
    var rawMarks = localStorage.getItem(MARKS_KEY);
    if (rawMarks) {
      var parsed = JSON.parse(rawMarks);
      if (parsed && typeof parsed === 'object') {
        marks.tag = parsed.tag || {};
        marks.star = parsed.star || {};
        marks.hide = parsed.hide || {};
        marks.note = parsed.note || {};
        marks.arch = parsed.arch || {};
        marks.__v = parsed.__v || 1;
      }
    }
  } catch (e) { /* 隐私模式下不可用，忽略 */ }

  /** v1（键=下标）→ v2（键=稳定 id）；跑一次就写回 */
  function migrateMarks() {
    if (marks.__v >= 2) return;
    var conv = function (map) {
      var out = {};
      Object.keys(map || {}).forEach(function (k) {
        if (!/^\d+$/.test(k)) { out[k] = map[k]; return; }   // 已经是 id 的（不该出现）原样保留
        var i = Number(k);
        if (!NODES[i]) return;                               // 节点没了就丢
        out[nkey(i)] = map[k];
      });
      return out;
    };
    var convArch = function (map) {
      var out = {};
      Object.keys(map || {}).forEach(function (k) {
        if (!/^\d+$/.test(k)) { out[k] = map[k]; return; }
        var i = Number(k);
        if (!SESS[i]) return;
        out[skey(i)] = map[k];
      });
      return out;
    };
    marks.star = conv(marks.star);
    marks.hide = conv(marks.hide);
    marks.note = conv(marks.note);
    marks.tag = conv(marks.tag);
    marks.arch = convArch(marks.arch);
    marks.__v = 2;
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch (e) {}
  }

  var marksPushT = null;
  var marksRev = '';      // 服务端那份的版本号（mtime:size），用来判断要不要重拉
  var marksDirty = false; // 本地有还没推上去的改动 → 这期间别被服务端覆盖
  function pushMarks() {
    if (!marksApiOk) return;
    clearTimeout(marksPushT);
    marksPushT = setTimeout(function () {
      try {
        fetch('/sea/api/marks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(marks),
        }).then(function (r) { return r.json(); }).then(function (j) {
          if (j && j.ok && j.rev) marksRev = String(j.rev);
          marksDirty = false;
        }).catch(function () {});
      } catch (e) {}
    }, 500);
  }

  /** 把一份 marks 接管过来（服务端那份优先，它才是持久的） */
  function adoptMarks(m) {
    if (!m || typeof m !== 'object') return;
    marks.tag = m.tag || {};
    marks.star = m.star || {};
    marks.hide = m.hide || {};
    marks.note = m.note || {};
    marks.arch = m.arch || {};
    marks.__v = m.__v || 2;
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch (e) {}
  }

  /** 启动时跟服务端对一次：有就用它的，没有就把本地这份推上去 */
  function syncMarksFromHost() {
    if (!marksApiOk) return;
    try {
      fetch('/sea/api/marks').then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) return;
        var remote = j.marks;
        var remoteN = remote ? Object.keys(remote).filter(function (k) { return k !== '__v'; }).length : 0;
        marksRev = String(j.rev || '');
        if (remoteN) {
          adoptMarks(remote);
          refreshFilter();
          renderSessionList();
          if (shelfOpen) renderShelf();
          if (selIdx >= 0) syncDetailActions(selIdx);
        } else {
          pushMarks();
        }
      }).catch(function () {});
    } catch (e) {}
  }

  /** 8 秒问一次版本号：变了才重拉（AI 用 sea_mark 标的、另一个窗口改的，这里都会跟上） */
  function pollMarks() {
    if (!marksApiOk || marksDirty) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    fetch('/sea/api/marks?rev=1').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      var rv = String(j.rev || '');
      if (!rv || rv === marksRev) return;
      return fetch('/sea/api/marks').then(function (r2) { return r2.json(); }).then(function (j2) {
        if (!j2 || !j2.ok || !j2.marks) return;
        if (marksDirty) return;
        var n = Object.keys(j2.marks).filter(function (k) { return k !== '__v'; }).length;
        marksRev = String(j2.rev || '');
        if (!n) return;
        adoptMarks(j2.marks);
        refreshFilter();
        renderSessionList();
        if (shelfOpen) renderShelf();
        if (selIdx >= 0) syncDetailActions(selIdx);
        if (mgOpen) renderMgmt();
        say('「整理」的标记刚同步过');
      });
    }).catch(function () {});
  }

  function saveMarks() {
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch (e) {}
    marksDirty = true;
    pushMarks();
    var c = Object.keys(marks.star).length;
    var el = document.getElementById('shcnt');
    if (el) el.textContent = c;
    var b = document.getElementById('shbtn');
    if (b) b.classList.toggle('on', c > 0);
  }

  function toggleStar(idx) {
    if (idx == null || idx < 0) return;
    var _sk2 = nkey(idx);
    if (marks.star[_sk2]) delete marks.star[_sk2]; else marks.star[_sk2] = 1;
    saveMarks();
    syncDetailActions(idx);
    if (shelfOpen) renderShelf();
  }

  function toggleArchive(sid) {
    if (sid == null || sid < 0) return;
    var _ak = skey(sid);
    if (marks.arch[_ak]) delete marks.arch[_ak]; else marks.arch[_ak] = 1;
    saveMarks();
    if (activeSid === sid) activeSid = -1;
    if (marks.arch[_ak] && selIdx >= 0 && NODES[selIdx].sid === sid) closeDetail();
    renderSessionList();
    refreshFilter();
    if (shelfOpen) renderShelf();
    if (matchScores) runSearch(document.getElementById('q').value || '');
  }

  function toggleHide(idx) {
    if (idx == null || idx < 0) return;
    var _hk = nkey(idx);
    var willHide = !marks.hide[_hk];
    if (willHide) marks.hide[_hk] = 1; else delete marks.hide[_hk];
    saveMarks();
    // 隐去的正是当前正在看的那颗 → 先把面板收起来，否则"星没了面板还开着"
    if (willHide && idx === selIdx) closeDetail();
    refreshFilter();
    if (selIdx >= 0) syncDetailActions(selIdx);
    if (shelfOpen) renderShelf();
  }

  function setNote(idx, text) {
    if (idx == null || idx < 0) return;
    var t = (text || '').trim();
    if (t) marks.note[nkey(idx)] = t; else delete marks.note[nkey(idx)];
    saveMarks();
  }

  function syncDetailActions(idx) {
    if (idx == null || idx < 0) return;
    var star = document.getElementById('dstar');
    var hide = document.getElementById('dhide');
    var note = document.getElementById('dnote');
    var st = document.getElementById('dnoteState');
    if (star) {
      star.textContent = marks.star[nkey(idx)] ? '★' : '☆';
      star.classList.toggle('on', !!marks.star[nkey(idx)]);
    }
    if (hide) {
      hide.classList.toggle('on', !!marks.hide[nkey(idx)]);
      hide.textContent = marks.hide[nkey(idx)] ? '显' : '隐';
    }
    if (note) note.value = marks.note[nkey(idx)] || '';
    if (st) st.textContent = marks.note[nkey(idx)] ? '已存' : '';
  }
