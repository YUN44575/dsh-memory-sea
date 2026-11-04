  // ================= 会话列表 =================
  // 每个会话属于哪片海（取其节点的域）
  var sessZone = new Array(SESS.length).fill(0);
  // 优先用数据管线算好的归属（domains.json：工作区 / cwd / overrides），
  // 老数据没有 sess.dm 时才回落到「这段会话里有没有陪伴海的星」。
  for (var si0 = 0; si0 < SESS.length; si0++) {
    if (typeof SESS[si0].dm === 'number') sessZone[si0] = SESS[si0].dm ? 1 : 0;
  }
  for (var zi = 0; zi < N; zi++) if (NODES[zi].dm) sessZone[NODES[zi].sid] = 1;

  function syncZoneButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('#zonebar .zb'), function (b) {
      if (b.id === 'srcbtn' || b.id === 'futbtn' || b.id === 'emobtn' || b.id === 'helpbtn') return;   // 这几个不参与「哪片海」的高亮
      b.classList.toggle('on', parseInt(b.getAttribute('data-zone'), 10) === zoneFilter);
    });
  }

  // 会话列表随「全部 / 工作海 / 陪伴海」自动切换
  var sessExpanded = false;
  var parkedOpen = false;     // 空壳会话清单是否展开
  var streamOpen = {};        // 哪几段主会话展开了自己的子会话     // 会话列表只留主干，展开才列全部
  // 这段会话的记忆落在哪一层（深层 / 浅层）：子会话大多在浅层，
  // 在深层看总览时它们既不显示在列表里、也点不到，得能看见并一键跳过去。
  function sidLayer(sid) {
    for (var sl = 0; sl < N; sl++) {
      var sn1 = NODES[sl];
      if (sn1.sid === sid) return isDeepLayer(sn1) ? 'deep' : 'shallow';
    }
    return 'shallow';
  }
  function renderSessionList() {
    var box = document.getElementById('sesslist');
    box.innerHTML = '';
    // 这一层里每个会话还剩多少颗可见的记忆 —— 列表跟着记忆层走
    var layerCnt = new Array(SESS.length).fill(0);
    for (var li = 0; li < N; li++) {
      var ln = NODES[li];
      if (ln.vis) layerCnt[ln.sid] = (layerCnt[ln.sid] || 0) + 1;
    }
    // 子会话挂在它的主会话下面，不再单独占列表一格
    var kidsOf = {};
    for (var si2 = 0; si2 < SESS.length; si2++) {
      var sv = SESS[si2];
      if (sv.depth > 0 && sv.parent >= 0) (kidsOf[sv.parent] = kidsOf[sv.parent] || []).push(si2);
    }
    var arr = SESS.map(function (s, i) { return { s: s, i: i, c: layerCnt[i] || 0 }; })
      .filter(function (o) {
        if (!overlapOn && (dataSrc === 'sc' ? !SESS[o.i].src_ : SESS[o.i].src_)) return false;
        if (SESS[o.i].depth > 0) return false;      // 主列表只放主会话
        var tot = o.c;
        (kidsOf[o.i] || []).forEach(function (k) { tot += layerCnt[k] || 0; });
        o.c = tot;                                   // 数字算上它派出去的这几段
        var kidTotal = 0;
        (kidsOf[o.i] || []).forEach(function (k) { kidTotal += (SESS[k].count || 0); });
        return (zoneFilter < 0 || sessZone[o.i] === zoneFilter) && !marks.arch[skey(o.i)]
          && (o.c > 0 || kidTotal > 0);
      })
      .sort(function (a, b) { return b.c - a.c; });   // 这一层记忆多的排前面 = 主干
    var hd = document.getElementById('sesshead');
    if (hd) {
      var layerName = layerWord(TH.layer === 'deep');
      var zoneName = zoneFilter < 0 ? '' : (zoneFilter === 1 ? ' · 陪伴' : ' · 工作');
      // 对刚用的人，「意识流」这名字太玄：钉一行小字解释它是什么
      var layerTip = TH.layer === 'deep'
        ? '近岸 = 最近这几天的记忆；点右上「近岸」可以切到远洋（更早的）'
        : '远洋 = 更早的记忆；点右上「近岸」可以切回近岸（最近几天的）';
      hd.innerHTML = '<span title="' + layerTip + '">' + (dataSrc === 'sc' ? '她的记忆' : '意识流') + ' · ' + layerName + zoneName
        + '<i class="sh2">= 一段对话</i></span>'
        + (activeSid >= 0
          ? '<span id="quitstream" title="退出这一段（Esc）">✕ 退出</span>'
          : '');
      hd.style.display = 'flex';
      hd.style.alignItems = 'center';
      hd.style.justifyContent = 'space-between';
      var qs = document.getElementById('quitstream');
      if (qs) qs.onclick = function (ev) {
        ev.stopPropagation();
        activeSid = -1; buildConstellation(-1); renderSessionList(); refreshFilter(); flyToSession(-1);
      };
    }
    var TOPN = 24;
    var show = sessExpanded ? arr : arr.slice(0, TOPN);
    // 按工作区（cwd）分组：同一片地上的对话放在一起
    function cwdName(sv) {
      if (!sv || !sv.cwd) return '未分组';
      var BS = String.fromCharCode(92);
      var p2 = String(sv.cwd);
      while (p2.length && (p2[p2.length - 1] === BS || p2[p2.length - 1] === '/')) p2 = p2.slice(0, -1);
      var seg = p2.split(BS).join('/').split('/').filter(Boolean);
      // 从后往前挑第一个"有意义"的段：跳过盘符、Users、用户名、.dsh、worlds/default/room 这类通用层
      var SKIP = { users: 1, user: 1, dsh: 1, '.dsh': 1, worlds: 1, world: 1, default: 1,
                   room: 1, rooms: 1, src: 1, tmp: 1, temp: 1, agents: 1, appdata: 1,
                   local: 1, roaming: 1, programdata: 1, documents: 1 };
      var pick = '';
      for (var k2 = seg.length - 1; k2 >= 0; k2--) {
        var w = seg[k2];
        var lw = w.toLowerCase();
        if (SKIP[lw]) continue;
        if (/^[a-z]:$/i.test(w)) continue;         // C: / D:
        if (/^\d+$/.test(w)) continue;             // 用户名常常就是一串数字
        pick = w; break;
      }
      if (!pick) return '~ 主目录';
      return pick.length > 16 ? pick.slice(0, 15) + '…' : pick;
    }
    // 组名优先用「DSH 里自己建的工作区」（鲸鲸的房间 / QQ 聊天 / 工作 …），
    // 没有工作区的会话才回落到 cwd 末段 —— 这样列表和 DSH 侧栏看到的分组是一致的。
    function groupName(sv) {
      if (sv && sv.ws) return sv.ws;
      return cwdName(sv);
    }
    // 不在任何 DSH 工作区里的会话（比如子代理、插件自己开的），组头给个淡标记
    function groupUngrouped(sv) { return !(sv && sv.ws); }
    var gmap = {}, gsea = {};
    show.forEach(function (o) {
      var g0 = groupName(o.s);
      (gmap[g0] = gmap[g0] || []).push(o);
      if (sessZone[o.i]) gsea[g0] = 1;
    });
    var gorder = Object.keys(gmap).sort(function (a, b) {
      var ta = 0, tb = 0;
      gmap[a].forEach(function (o) { ta += o.c; });
      gmap[b].forEach(function (o) { tb += o.c; });
      return tb - ta;
    });
    var renderItem = function (o) {
      var d = document.createElement('div');
      d.className = 'sitem' + (activeSid === o.i ? ' on' : '');
      var t = sessLabel(o.s);
      var isArch = !!marks.arch[skey(o.i)];
      d.className = 'sitem' + (activeSid === o.i ? ' on' : '') + (isArch ? ' arc' : '');
      d.innerHTML = '<span class="n">' + o.c + '</span><span class="t">' + esc(t) + '</span>'
        + '<span class="arcb" title="' + (isArch ? '取消归档' : '归档这段会话') + '">' + (isArch ? '↩' : '⌫') + '</span>';
      d.title = t;
      var arcEl = d.querySelector('.arcb');
      if (arcEl) arcEl.onclick = function (ev) { ev.stopPropagation(); toggleArchive(o.i); };
      d.onclick = function () {
        var same = activeSid === o.i;
        // 先把自己从"某颗星的相关网络"里摘出来，不然画面会只剩那一小撮
        relatedSet = null; matchScores = null; selIdx = -1;
        if (!same) { closeDetail(); }
        // 点一段对话就只是「看这一段」：不动顶部的海域筛选，
        // 列表保持原样，随时能接着点下一段。
        activeSid = same ? -1 : o.i;
        buildConstellation(-1);   // 不重排：星就待在它原本的位置
        renderSessionList();
        refreshFilter();
        flyToSession(activeSid);
        if (activeSid >= 0) openStream(activeSid);
      };
      box.appendChild(d);
      // 这一段里派出去的子会话：缩进挂在下面，点 ▸ 才展开
      var kids = (kidsOf[o.i] || []).filter(function (k) { return (SESS[k].count || 0) > 0 && !marks.arch[skey(k)]; });
      if (kids.length) {
        if (streamOpen[o.i]) {
          kids.forEach(function (k) {
            var inL = layerCnt[k] || 0;
            var kd = document.createElement('div');
            kd.className = 'sitem kid' + (activeSid === k ? ' on' : '') + (inL ? '' : ' off');
            kd.innerHTML = '<span class="n">' + (inL || (SESS[k].count || 0)) + '</span><span class="t">'
              + esc(sessLabel(SESS[k])) + '</span>'
              + (inL ? '' : '<i class="kl">' + layerWord(TH.layer !== 'deep') + '</i>');
            kd.onclick = function (ev) {
              ev.stopPropagation();
              relatedSet = null; matchScores = null; selIdx = -1; closeDetail();
              activeSid = activeSid === k ? -1 : k;
              // 它的记忆不在当前这层：先切过去，否则点了飞不到任何地方
              if (activeSid >= 0 && !(layerCnt[k] > 0)) {
                var wantL = sidLayer(k);
                if (wantL !== TH.layer) applyTheme(wantL);
              }
              buildConstellation(-1);
              renderSessionList(); refreshFilter(); flyToSession(activeSid);
              if (activeSid >= 0) openStream(activeSid);   // 右边列出这段子会话自己的记录
            };
            box.appendChild(kd);
          });
        }
        var kt = document.createElement('div');
        kt.className = 'sitem kidtog';
        kt.innerHTML = '<span class="t">' + (streamOpen[o.i] ? '▾ 收起 ' : '▸ ') + kids.length + ' 个子会话</span>';
        kt.onclick = function (ev) {
          ev.stopPropagation();
          streamOpen[o.i] = !streamOpen[o.i];
          renderSessionList();
        };
        box.appendChild(kt);
      }
    };
    gorder.forEach(function (g1) {
      var gh = document.createElement('div');
      gh.className = 'grp ' + (gsea[g1] ? 'cmp' : 'wrk');
      var gUng = gmap[g1].every(function (o) { return groupUngrouped(o.s); });
      gh.innerHTML = '<span class="gdot"></span><b>' + esc(g1) + '</b>'
        + (gUng ? '<i class="gq">未分组</i>' : '')
        + '<span class="gc">' + gmap[g1].length + '</span>';
      box.appendChild(gh);
      gmap[g1].forEach(renderItem);
    });
    if (arr.length > TOPN) {
      var more = document.createElement('div');
      more.className = 'sitem more';
      more.innerHTML = '<span class="t">' + (sessExpanded ? '收起' : '＋ 另外 ' + (arr.length - TOPN) + ' 段') + '</span>';
      more.onclick = function () { sessExpanded = !sessExpanded; renderSessionList(); };
      box.appendChild(more);
    }
    // 空壳会话：只建了档、一句话没说过。折叠在列表最底部，不占星图、不挤主干，
    // 但点开能看见 —— 「所有会话都在」这件事要成立，而不是被悄悄丢掉。
    if (dataSrc === 'dsh' && zoneFilter < 0 && activeSid < 0 && PARKED.length) {
      var pk = document.createElement('div');
      pk.className = 'sitem kidtog';
      pk.innerHTML = '<span class="t">' + (parkedOpen ? '▾ ' : '▸ ')
        + PARKED.length + ' 段空白会话（只建了档，没说过话）</span>';
      pk.onclick = function (ev) {
        ev.stopPropagation();
        parkedOpen = !parkedOpen;
        renderSessionList();
      };
      box.appendChild(pk);
      if (parkedOpen) {
        PARKED.slice().sort(function (a, b) { return (b.born || 0) - (a.born || 0); })
          .forEach(function (p) {
            var pd = document.createElement('div');
            pd.className = 'sitem kid';
            var dt = p.born ? new Date(p.born) : null;
            var ds = dt ? (dt.getMonth() + 1) + '/' + dt.getDate() : '—';
            // 没有标题就用目录末段——这些空壳大多是插件自动开的会话，
            // 目录名至少能说明它是在哪儿开的
            var nm = p.title || (p.cwd ? String(p.cwd).split(/[\\/]/).filter(Boolean).pop() : '');
            pd.innerHTML = '<span class="n">' + esc(ds) + '</span><span class="t">'
              + esc((nm || '(没有标题)').slice(0, 20)) + '</span>'
              + (p.lines ? '<i class="kl">' + p.lines + ' 行</i>' : '');
            pd.title = (p.cwd || '未知目录') + ' · ' + (p.lines || 0) + ' 行 · 没有可显示的交流';
            box.appendChild(pd);
          });
      }
    }
  }

  // 点一段对话，镜头就飞过去——不然点了星海不动，像没反应
  function flyToSession(sid) {
    if (sid < 0) {
      camTarget.x = 0; camTarget.y = 0; camTarget.s = 0.92;
      rotLock = false;
      return;
    }
    var sx = 0, sy = 0, cnt = 0;
    for (var i = 0; i < N; i++) {
      var nd = NODES[i];
      if (nd.sid !== sid || !nd.vis) continue;
      // 星已经被摆成星座了，镜头要对着星座的实际位置
      if (constelX && constelX[i] !== 1e9) { sx += constelX[i]; sy += constelY[i]; }
      else { sx += nd.x; sy += nd.y; }
      cnt++;
    }
    if (!cnt) return;
    camTarget.x = sx / cnt;
    camTarget.y = sy / cnt;
    camTarget.s = 2.35;
    rotLock = false;
  }
