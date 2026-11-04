  // ================= 整理 · 管理视图 =================
  // 星图是「发现层」：一眼看形状。这里是「管理层」：看得清、找得到、改得动。
  // 同一个数据（NODES/SESS + marks），换一种呈现 —— 列表比星点精确，适合真下手整理。
  var mgOpen = false, mgTab = 'list', mgPage = 240, mgSel = {}, mgOpenSess = {}, mgFilter = '';
  var MG_SRC_COLOR = {
    user: '#7fdcff', assistant: '#c08cff', qq: '#ff6fa5', 'agent-message': '#ffb45e',
    'dsh-world-life': '#6fe3b0', 'dsh-world-history': '#4fb8e8', 'world-diary': '#f0d070',
    'fish-memory': '#b38cff',
  };


  function mgToast(msg) {
    var tip = document.getElementById('newver');
    if (!tip) return;
    tip.textContent = msg;
    tip.classList.add('on');
    clearTimeout(mgToast._t);
    mgToast._t = setTimeout(function () { tip.classList.remove('on'); }, 1800);
  }

  function mgSrcName(k) { return (typeof srcName === 'function' ? srcName(k) : k) || k; }

  function openMgmt(tab) {
    // 整理是全屏层，详情面板留在下面会变成「关了整理又冒出一块」的错觉
    try { closeDetail(); } catch (e) {}
    mgFilter = '';
    var hv0 = document.getElementById('mghide');
    if (hv0) hv0.checked = false;
    mgOpen = true;
    if (tab) mgTab = tab;
    var el = document.getElementById('mgmt');
    if (el) el.classList.add('open');
    renderMgmt();
    var q = document.getElementById('mgq');
    if (q) setTimeout(function () { try { q.focus(); } catch (e) {} }, 60);
  }
  function closeMgmt() {
    mgOpen = false;
    var el = document.getElementById('mgmt');
    if (el) el.classList.remove('open');
    mgSel = {};
  }

  /** 当前要展示的那批节点（跟星图当前的过滤保持一致，再叠上这里自己的条件） */
  function mgRows() {
    var q = String((document.getElementById('mgq') || {}).value || '').trim().toLowerCase();
    var onlyStar = !!(document.getElementById('mgstar') || {}).checked;
    var showHide = !!(document.getElementById('mghide') || {}).checked;
    var sort = (document.getElementById('mgsort') || {}).value || 't';
    var f = mgFilter || '';
    var out = [];
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      var hit = marks.hide[nkey(i)];
      // 「隐去」这张卡要能看见隐去的东西，别的筛选都按默认（藏起来的不看）
      if (f === 'hide') { if (!hit) continue; }
      else {
        if (hit) continue;
        // 从体检卡片点进来时是"看这一类有多少条"，不该再被"近岸/远洋"的层挡住，
        // 不然卡片上写 184、点进去只有 49。
        if (!f && !n.vis) continue;
      }
      if (f && f !== 'hide' && !mgPass(i, f)) continue;
      if (onlyStar && !marks.star[nkey(i)]) continue;
      if (q) {
        var hay = (n.txt || '') + ' ' + (n.kw || []).join(' ') + ' ' + (nodeTags(i) || []).join(' ') +
          ' ' + (marks.note[nkey(i)] || '') + ' ' + (SESS[n.sid] ? sessLabel(SESS[n.sid]) : '');
        if (hay.toLowerCase().indexOf(q) < 0) continue;
      }
      out.push(i);
    }
    if (sort === 'to') out.sort(function (a, b) { return NODES[a].t - NODES[b].t; });
    else if (sort === 's') out.sort(function (a, b) {
      if (NODES[a].sid !== NODES[b].sid) return NODES[a].sid - NODES[b].sid;
      return NODES[a].t - NODES[b].t;
    });
    else out.sort(function (a, b) { return NODES[b].t - NODES[a].t; });
    // 「重复的」不是按时间看，是把同一组摊在一起，才看得出哪几句是一回事
    if (f === 'dup') out.sort(function (a, b) {
      var ka = mgDupKey(a), kb = mgDupKey(b);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return NODES[a].t - NODES[b].t;
    });
    return out;
  }

  var _mgDupMap = null;
  /** 重复 id → 组内成员下标（含代表点） */
  function mgDupMap() {
    if (_mgDupMap) return _mgDupMap;
    var m = {}, idm = mgIdMap();
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (!n.dr) continue;
      (m[n.dr] || (m[n.dr] = [])).push(i);
    }
    Object.keys(m).forEach(function (k) {
      var gi = idm[k];
      if (gi != null) m[k].unshift(gi);
    });
    _mgDupMap = m;
    return m;
  }

  function mgDupKey(i) {
    var n = NODES[i];
    return n.dr || ('#' + (n.id || i));
  }

  /** 体检卡片点进去时用：这一条算不算那类 */
  function mgPass(i, f) {
    var n = NODES[i];
    var k = nkey(i);
    switch (f) {
      case 'all': return true;
      case 'star': return !!marks.star[k];
      case 'tag': return (nodeTags(i) || []).length > 0;
      case 'note': return !!marks.note[k];
      case 'arch': return !!marks.arch[skey(n.sid)];
      case 'img': return !!n.th;
      case 'dup': return !!n.dp;
      case 'world': return !!n.w;
      case 'nosrc': return n.sid < 0;
      default:
        if (f.indexOf('src:') === 0) return n.s === f.slice(4);
        return true;
    }
  }

  function mgFilterName(f) {
    if (!f) return '';
    if (f.indexOf('src:') === 0) return '来源 · ' + mgSrcName(f.slice(4));
    return ({
      all: '全部', star: '★ 收藏', tag: '打了标签的', note: '写了备注的',
      hide: '隐去的', arch: '归档会话里的', img: '带图片的', dup: '重复的',
      world: '世界也记了一笔', nosrc: '没有来源'
    })[f] || f;
  }

  /** 一条记忆在清单里长什么样 */
  function mgRowHtml(i) {
    var n = NODES[i];
    var k = nkey(i);
    var ss = SESS[n.sid];
    var tgs = nodeTags(i);
    var note = marks.note[k];
    var hid = !!marks.hide[k];
    var st = !!marks.star[k];
    var d = new Date(n.t);
    var tm = ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2) +
      ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var tx = String(n.txt || '').replace(/\s+/g, ' ')
      .replace(/\*\*/g, '').replace(/`/g, '').replace(/^#+\s*/, '').replace(/^>\s*/, '').slice(0, 300);
    // 只看重复时，标出这一句跟几句撞了（同组的行会挨在一起）
    var dmark = '';
    if (mgFilter === 'dup') {
      var dmm = mgDupMap();
      var dlen = (dmm[n.dr || n.id] || []).length;
      if (dlen > 1) dmark = '<span class="bd dupbd">×' + dlen + '</span>';
    }
    return '<div class="mrow' + (mgSel[k] ? ' sel' : '') + (mgFilter === 'dup' ? ' duprow' : '') + '" data-i="' + i + '">' +
      '<span class="ck"></span>' +
      '<span class="tm">' + tm + '</span>' +
      '<span class="sc" style="color:' + (MG_SRC_COLOR[n.s] || '#7fa8cc') + '">' + esc(mgSrcName(n.s)) + '</span>' +
      '<span class="ss" title="' + esc(ss ? sessLabel(ss) : '') + '">' + esc(ss ? sessLabel(ss) : '—') + '</span>' +
      '<span class="tx">' + esc(tx || '（空）') + '</span>' +
      dmark +
      (tgs.length ? '<span class="bd">' + tgs.length + ' 标签</span>' : '') +
      (note ? '<span class="bd">备注</span>' : '') +
      (st ? '<span class="bd">★</span>' : '') +
      '<span class="bt">' +
      '<b data-act="star">' + (st ? '取消★' : '★') + '</b>' +
      '<b data-act="hide">' + (hid ? '恢复' : '隐去') + '</b>' +
      '<b data-act="open">打开</b>' +
      '</span>' +
      '</div>';
  }

  /** 把清单里的记忆按会话归拢成一段一段 */
  function mgGroups(rows) {
    var map = {}, order = [];
    var fmt = function (t) { var d = new Date(t); return (d.getMonth() + 1) + '.' + d.getDate(); };
    for (var r = 0; r < rows.length; r++) {
      var i = rows[r], n = NODES[i], sid = String(n.sid);
      if (!map[sid]) {
        var sv = SESS[n.sid];
        map[sid] = {
          sid: n.sid,
          title: sv ? sessLabel(sv) : ('会话 ' + sid),
          rows: [], t0: Infinity, t1: 0,
          subN: sv ? (function () {
            var c = 0;
            for (var q = 0; q < SESS.length; q++) {
              var x = SESS[q];
              if (x && x.pid && x.pid === sv.id) c++;
            }
            return c;
          })() : 0
        };
        order.push(map[sid]);
      }
      map[sid].rows.push(i);
      if (n.t < map[sid].t0) map[sid].t0 = n.t;
      if (n.t > map[sid].t1) map[sid].t1 = n.t;
    }
    order.forEach(function (g) {
      g.rows.sort(function (a, b) { return NODES[b].t - NODES[a].t; });
      g.span = fmt(g.t0) + ' → ' + fmt(g.t1);
    });
    order.sort(function (a, b) { return b.t1 - a.t1; });
    return order;
  }

  function syncMgFoot(rows) {
    var foot = document.getElementById('mgfoot');
    if (!foot) return;
    var sel = Object.keys(mgSel);
    if (sel.length) {
      foot.classList.add('on');
      var n1 = foot.querySelector('.mgf n');
      if (n1) n1.textContent = sel.length + ' 条';
    } else foot.classList.remove('on');
  }

  function renderMgmt() {
    var body = document.getElementById('mgbody');
    var foot = document.getElementById('mgfoot');
    var cnt = document.getElementById('mgcount');
    if (!body) return;

    var _th = document.getElementById('mgtabhint');
    if (_th) {
      _th.innerHTML = mgTab === 'health'
        ? '把这批记忆的状态摊成数字：多少条、多少重复、哪句说过就再没提过。<b>点任意一张卡</b>，看它包含哪些记忆。'
        : mgTab === 'review'
          ? '选一段时间，出一张那几天的卡：每天多少条、哪句再没提过、发过哪些图。<b>点卡片里的条目</b>能跳回星图那颗星。'
          : '这是同一批记忆的另一种看法：一行一条，能搜、能筛、能批量收藏 / 隐去 / 打标签。星图上不好动手的事在这里做。';
    }
    // tab 高亮
    var tabs = document.querySelectorAll('.mgtab');
    for (var t = 0; t < tabs.length; t++) tabs[t].classList.toggle('on', tabs[t].getAttribute('data-mgtab') === mgTab);

    // 「只看某某」的提示条：从体检卡片点进来后才出现
    var fbar = document.getElementById('mgfilter');
    if (fbar) {
      if (mgFilter && mgTab === 'list') {
        fbar.classList.add('on');
        fbar.innerHTML = '<span>只看</span><b>' + esc(mgFilterName(mgFilter)) + '</b><i id="mgfclr">✕ 看全部</i>';
        var clr = document.getElementById('mgfclr');
        if (clr) clr.addEventListener('click', function () { mgFilter = ''; renderMgmt(); });
      } else {
        fbar.classList.remove('on');
        fbar.innerHTML = '';
      }
    }

    if (mgTab === 'health') {
      if (foot) foot.classList.remove('on');
      renderMgHealth();
      return;
    }
    if (mgTab === 'review') {
      if (foot) foot.classList.remove('on');
      renderMgReview();
      return;
    }

    var rows = mgRows();
    var sortV = (document.getElementById('mgsort') || {}).value || 't';

    // 「按会话」= 按会话折成一段一段，一段一段地看，而不是一条一条地刷
    if (sortV === 's') {
      var groups = mgGroups(rows);
      var h2 = '';
      if (cnt) cnt.textContent = rows.length + ' 条 · 分 ' + groups.length + ' 段对话';
      groups.forEach(function (g) {
        var open = !!mgOpenSess[g.sid];
        var show = open ? Math.min(g.rows.length, 160) : Math.min(g.rows.length, 2);
        h2 += '<div class="mggrp' + (open ? ' on' : '') + '">' +
          '<div class="mggh" data-gsess="' + g.sid + '">' +
          '<i>' + (open ? '▾' : '▸') + '</i><b>' + esc(g.title) + '</b>' +
          '<span>' + g.rows.length + ' 条</span>' +
          '<em>' + esc(g.span) + '</em>' +
          (g.subN ? '<u>含 ' + g.subN + ' 段子会话</u>' : '') +
          '</div>';
        for (var q2 = 0; q2 < show; q2++) h2 += mgRowHtml(g.rows[q2]);
        if (g.rows.length > show) {
          h2 += '<div class="mgo mgopen" data-gsess="' + g.sid + '">' +
            (open ? '这一组还有 ' + (g.rows.length - show) + ' 条没列出来' : '还有 ' + (g.rows.length - show) + ' 条 · 点这里展开') +
            '</div>';
        }
        h2 += '</div>';
      });
      if (!rows.length) h2 = '<div class="mgo">这里没有符合条件的记忆。</div>';
      body.innerHTML = h2;
      syncMgFoot(rows);
      return;
    }

    if (cnt) cnt.textContent = rows.length + ' 条 · 显示 ' + Math.min(rows.length, mgPage);

    var html = '';
    var limit = Math.min(rows.length, mgPage);
    for (var r = 0; r < limit; r++) html += mgRowHtml(rows[r]);
    if (mgFilter === 'hide' && rows.length) {
      html = '<div class="mgtrashbar">回收站 · 隐去的都在这里，星图上暂时不显示'
        + '<button id="mgrestoreall">全部恢复</button></div>' + html;
    }
    if (!rows.length) html = '<div class="mgo">这里没有符合条件的记忆。</div>';
    else if (rows.length > limit) html += '<div class="mgo" id="mgmore">还有 ' + (rows.length - limit) + ' 条 · 点这里再多看 ' + Math.min(240, rows.length - limit) + ' 条</div>';
    body.innerHTML = html;

    // 选中条
    var selN = Object.keys(mgSel).length;
    if (foot) {
      if (selN) {
        foot.classList.add('on');
        foot.innerHTML = '已选 <b>' + selN + '</b> 条' +
          '<button data-mgbulk="star">收藏</button>' +
          '<button data-mgbulk="unstar">取消收藏</button>' +
          '<button data-mgbulk="hide">隐去</button>' +
          '<button data-mgbulk="unhide">恢复</button>' +
          '<button data-mgbulk="tag">打标签…</button>' +
          '<button data-mgbulk="clear">清空选择</button>';
      } else foot.classList.remove('on');
    }

    var more = document.getElementById('mgmore');
    if (more) more.onclick = function () { mgPage += 240; renderMgmt(); };
    var ra = document.getElementById('mgrestoreall');
    if (ra) ra.onclick = function (ev) { ev.stopPropagation(); mgRestoreAll(); };
  }

  /** 体检：把「这一堆记忆的健康状况」变成几个数字 */
  var _mgIdMap = null, _mgDupGroups = null;
  function mgIdMap() {
    if (_mgIdMap) return _mgIdMap;
    var m = {};
    for (var i = 0; i < NODES.length; i++) { var k = nkey(i); if (m[k] == null) m[k] = i; }
    _mgIdMap = m;
    return m;
  }

  /** 重复组：每条重复节点记着"跟谁重复"（dr = 代表点 id），按代表点归组 */
  function mgDupGroups() {
    var byRep = {}, out = [];
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if ((dataSrc === 'sc') !== (n.src_ === 'sc')) continue;
      if (!n.dr) continue;
      if (marks.hide[nkey(i)]) continue;      // 已经隐去的不再算，处理完这组就该消失
      (byRep[n.dr] || (byRep[n.dr] = [])).push(i);
    }
    var idm = mgIdMap();
    Object.keys(byRep).forEach(function (repId) {
      var mem = byRep[repId].slice();
      var gi = idm[repId];
      if (gi != null && !marks.hide[nkey(gi)]) mem.unshift(gi);
      if (mem.length >= 2) out.push(mem);     // 只剩代表点（或只剩副本）就不算重复了
    });
    out.sort(function (a, b) { return b.length - a.length; });
    return out;
  }

  function mgHideDupCopies(gi) {
    var groups = _mgDupGroups || window.__mgDupGroups || [];
    var mem = groups[gi];
    if (!mem || mem.length < 2) return;
    for (var k = 1; k < mem.length; k++) marks.hide[nkey(mem[k])] = 1;
    saveMarks(); refreshFilter(); renderMgmt();
    mgToast('留下了最早那一条，其余 ' + (mem.length - 1) + ' 条已隐去');
  }

  function renderMgHealth() {
    var body = document.getElementById('mgbody');
    var cnt = document.getElementById('mgcount');
    if (!body) return;
    // 只算当前这片海的节点：DSH 海是 1614 条，SurfCore 海是它的记忆卡
    var mine = [];
    for (var i0 = 0; i0 < NODES.length; i0++) {
      if ((dataSrc === 'sc') === (NODES[i0].src_ === 'sc')) mine.push(i0);
    }
    var n = mine.length;
    var dup = 0, orphan = 0, worldB = 0, withNote = 0, withTag = 0, withThumb = 0;
    for (var mi = 0; mi < n; mi++) {
      var i = mine[mi];
      var o = NODES[i];
      if (o.dp) dup++;
      if (o.sid < 0) orphan++;
      if (o.w) worldB++;
      if (o.th) withThumb++;
      if (marks.note[nkey(i)]) withNote++;
      if ((nodeTags(i) || []).length) withTag++;
    }
    var stars = idxList(marks.star).length;
    var hides = idxList(marks.hide).length;
    var archs = sidList(marks.arch).length;
    var tagNames = {};
    Object.keys(marks.tag || {}).forEach(function (k) { (marks.tag[k] || []).forEach(function (x) { tagNames[x] = 1; }); });
    if (cnt) cnt.textContent = n + ' 条记忆 · ' + SESS.length + ' 个会话';

    // 时间跨度
    var t0 = Infinity, t1 = 0;
    for (var mj = 0; mj < n; mj++) { var jn = NODES[mine[mj]]; if (jn.t < t0) t0 = jn.t; if (jn.t > t1) t1 = jn.t; }
    var spanDays = t0 === Infinity ? 0 : Math.round((t1 - t0) / 86400000);

    // 每张卡都能点开看：第 4 个字段是「点进去筛什么」，空字符串 = 不可点
    var cards = [
      ['记忆总数', n, '约 ' + spanDays + ' 天', 'all'],
      ['★ 收藏', stars, '你亲手留下的', 'star'],
      ['标签', Object.keys(tagNames).length, '共打在 ' + withTag + ' 条上', 'tag'],
      ['备注', withNote, '你写下的那句话', 'note'],
      ['隐去', hides, '不想再看见的', 'hide'],
      ['归档会话', archs, '整段收起来', 'arch'],
      ['图片', withThumb, '带缩略图', 'img'],
      ['重复', dup, '一模一样说过几遍', 'dup'],
      ['世界也记了一笔', worldB, '那边有对照', 'world'],
      ['没有来源', orphan, '孤儿节点', 'nosrc'],
    ];
    var html = '<div class="mghint">点任意一张卡，看它包含哪些记忆 · 共 <b>' + n + '</b> 条</div>';
    html += '<div class="mghealth">';
    cards.forEach(function (c) {
      var can = c[3] && (c[3] === 'all' ? true : c[1] > 0);
      html += '<div class="mghc"' + (can ? ' data-mgf="' + c[3] + '"' : '') + '>' +
        '<div class="k">' + esc(c[0]) + '</div><div class="v">' + c[1] + '</div>' +
        '<div class="n2">' + esc(c[2]) + '</div></div>';
    });
    html += '</div>';

    // 每类来源的条数
    var bySrc = {};
    for (var s2 = 0; s2 < n; s2++) { var sn = NODES[mine[s2]].s; bySrc[sn] = (bySrc[sn] || 0) + 1; }
    html += '<div class="mghealth">';
    Object.keys(bySrc).sort(function (a, b) { return bySrc[b] - bySrc[a]; }).forEach(function (k) {
      html += '<div class="mghc" data-mgf="src:' + esc(k) + '">' +
        '<div class="k" style="color:' + (MG_SRC_COLOR[k] || '#6c8aa8') + '">' + esc(mgSrcName(k)) + '</div>' +
        '<div class="v">' + bySrc[k] + '</div><div class="n2">条</div></div>';
    });
    html += '</div>';
    // 重复对照：同一张图/同一段模板被反复发，在向量空间里完全重合，星图上会变成一圈细弧。
    // 这里把它们成组摊开，看清楚"重复"到底是什么，再一键只留一条。
    var groups = mgDupGroups();
    if (groups.length) {
      html += '<div class="rvsec">重复的 ' + dup + ' 条 · 分成 ' + groups.length + ' 组</div>';
      html += '<div class="dupwrap">';
      groups.slice(0, 24).forEach(function (mem, gi) {
        var rep0 = NODES[mem[0]];
        var t0 = new Date(rep0.t);
        var tx = String(rep0.txt || '').replace(/\s+/g, ' ')
          .replace(/\*\*/g, '').replace(/`/g, '').replace(/^#+\s*/, '').slice(0, 120);
        html += '<div class="dupgrp">';
        html += '<div class="duph"><b>' + mem.length + ' 次</b><span>' +
          (t0.getMonth() + 1) + '.' + t0.getDate() + ' ' + ('0' + t0.getHours()).slice(-2) + ':' +
          ('0' + t0.getMinutes()).slice(-2) + '</span>' +
          '<em data-dupgrp="' + gi + '">只留一条，其它隐去</em></div>';
        html += '<div class="duptx">' + esc(tx || '（空）') + '</div>';
        html += '</div>';
      });
      html += '</div>';
      if (groups.length > 24) html += '<div class="mgo">还有 ' + (groups.length - 24) + ' 组没列出来。</div>';
      _mgDupGroups = groups;
      window.__mgDupGroups = groups;
    }

    html += '<div class="mgo">体检结果会随管线重跑更新；收藏/标签/备注是你自己的，不受影响。' +
      '想把这些带走：右边「星图」导出图片，或者在详情里复制原话。</div>';
    body.innerHTML = html;
  }

  function mgToggleSel(i) {
    var k = nkey(i);
    if (mgSel[k]) delete mgSel[k]; else mgSel[k] = 1;
    renderMgmt();
  }

  function mgBulk(act) {
    var idxs = [];
    Object.keys(mgSel).forEach(function (k) { var i = idxOfKey(k); if (i >= 0) idxs.push(i); });
    if (!idxs.length) return;
    if (act === 'star' || act === 'unstar') {
      idxs.forEach(function (i) {
        var k = nkey(i);
        if (act === 'star') marks.star[k] = Date.now(); else delete marks.star[k];
      });
      saveMarks(); refreshFilter(); renderMgmt();
      if (shelfOpen) renderShelf();
      mgToast('已' + (act === 'star' ? '收藏' : '取消收藏') + ' ' + idxs.length + ' 条');
    } else if (act === 'hide') {
      idxs.forEach(function (i) { marks.hide[nkey(i)] = 1; });
      saveMarks(); refreshFilter(); renderMgmt();
      mgToast('隐去 ' + idxs.length + ' 条');
    } else if (act === 'unhide') {
      idxs.forEach(function (i) { delete marks.hide[nkey(i)]; });
      saveMarks(); refreshFilter(); renderMgmt();
      mgToast('恢复 ' + idxs.length + ' 条');
    } else if (act === 'tag') {
      var name = prompt('给这 ' + idxs.length + ' 条打一个标签（12 字以内）');
      if (!name) return;
      addTagToMany(idxs, name);
      renderMgmt();
    } else if (act === 'clear') {
      mgSel = {};
      renderMgmt();
    }
  }

  // 事件：列表点击（用事件委托，行是动态生成的）
  (function bindMgmt() {
    var box = document.getElementById('mgbody');
    if (box) {
      box.addEventListener('click', function (ev) {
        var t = ev.target;
        // 体检页的「只留一条，其它隐去」不在 .mrow 里，先单独认
        var dg = t && t.closest ? t.closest('[data-dupgrp]') : null;
        if (dg) { ev.stopPropagation(); mgHideDupCopies(Number(dg.getAttribute('data-dupgrp'))); return; }
        // 体检卡片 → 跳到清单并只看这一类
        var fc = t && t.closest ? t.closest('[data-mgf]') : null;
        if (fc && mgTab !== 'list') {
          ev.stopPropagation();
          mgFilter = fc.getAttribute('data-mgf');
          mgTab = 'list';
          mgPage = 240;
          var hv = document.getElementById('mghide');
          if (hv) hv.checked = (mgFilter === 'hide');
          renderMgmt();
          return;
        }
        var gh = t && t.closest ? t.closest('[data-gsess]') : null;
        if (gh) {
          ev.stopPropagation();
          var gsid = gh.getAttribute('data-gsess');
          if (mgOpenSess[gsid]) delete mgOpenSess[gsid]; else mgOpenSess[gsid] = 1;
          renderMgmt();
          return;
        }
        var act = t && t.getAttribute && t.getAttribute('data-act');
        var row = t;
        while (row && row !== box && !(row.classList && row.classList.contains('mrow'))) row = row.parentNode;
        if (!row || row === box) return;
        var i = Number(row.getAttribute('data-i'));
        if (act === 'star') {
          var k = nkey(i);
          if (marks.star[k]) delete marks.star[k]; else marks.star[k] = Date.now();
          saveMarks(); refreshFilter(); renderMgmt();
          return;
        }
        if (act === 'hide') {
          marks.hide[nkey(i)] = 1;
          saveMarks(); refreshFilter(); renderMgmt();
          return;
        }
        if (act === 'open') {
          closeMgmt();
          selectNode(i);
          return;
        }
        // 点行 = 选中
        mgToggleSel(i);
      });
    }
    var foot = document.getElementById('mgfoot');
    if (foot) {
      foot.addEventListener('click', function (ev) {
        var b = ev.target;
        var act = b && b.getAttribute && b.getAttribute('data-mgbulk');
        if (act) mgBulk(act);
      });
    }
    var close = document.getElementById('mgclose');
    if (close) close.addEventListener('click', function (ev) { ev.stopPropagation(); closeMgmt(); });

    var tabs = document.querySelectorAll('.mgtab');
    for (var t2 = 0; t2 < tabs.length; t2++) {
      tabs[t2].addEventListener('click', function (ev) {
        mgTab = ev.currentTarget.getAttribute('data-mgtab');
        mgPage = 240;
        renderMgmt();
      });
    }
    var q = document.getElementById('mgq');
    if (q) q.addEventListener('input', function () { mgPage = 240; renderMgmt(); });
    ['mgstar', 'mghide', 'mgsort'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { mgPage = 240; renderMgmt(); });
    });
    var btn = document.getElementById('mgbtn');
    if (btn) btn.onclick = function () { if (mgOpen) closeMgmt(); else openMgmt(); };
    // 整理视图打开时，Esc 只关这一层（否则会一路退到关闭整个意识海）
    document.addEventListener('keydown', function (e) {
      if (mgOpen && (e.key === 'Escape' || e.key === 'Esc')) {
        e.stopPropagation(); e.preventDefault(); closeMgmt();
      }
    }, true);
  })();
