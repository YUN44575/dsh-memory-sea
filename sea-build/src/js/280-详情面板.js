  // ================= 详情面板 =================
  var detail = document.getElementById('detail');

  // 「这段里有密钥，已遮住」那一行：点一下才展开原文
  function renderSensitive(idx, hits) {
    var holder = document.getElementById('dreveal');
    if (!holder) return;
    holder.innerHTML = '';
    if (!hits) { holder.style.display = 'none'; return; }
    holder.style.display = 'flex';
    var sp = document.createElement('span');
    sp.className = 'rlhint';
    sp.textContent = revealSet[idx]
      ? ('原文里有 ' + hits + ' 处密钥 / 手机号')
      : ('已遮住 ' + hits + ' 处密钥 / 手机号这类内容');
    holder.appendChild(sp);
    var b = document.createElement('button');
    b.className = 'rlbtn';
    b.textContent = revealSet[idx] ? '重新遮住' : '显示原文';
    b.onclick = function () {
      if (revealSet[idx]) delete revealSet[idx]; else revealSet[idx] = 1;
      selectNode(idx);
    };
    holder.appendChild(b);
  }

  // 点左侧某一段会话 → 右侧按时间列出这一段的所有记忆
  function openStream(sid) {
    var s = SESS[sid] || {};
    var ids = (nodesBySid[sid] || []).filter(function (i) { return NODES[i].vis; });
    ids.sort(function (a, b) { return NODES[a].t - NODES[b].t; });
    selIdx = -1;
    document.getElementById('dkind').textContent =
      '意识流 · ' + sessLabel(s) + ' · ' + ids.length + ' 条';
    var im = document.getElementById('dimg'); im.style.display = 'none';
    document.getElementById('dmeta').innerHTML =
      (s.cwd ? '工作区 · ' + esc(s.cwd) + '<br>' : '')
      + '从 ' + fmtDate(s.t0) + ' 到 ' + fmtDate(s.t1);
    document.getElementById('dtags').innerHTML = '';
    var drev = document.getElementById('dreveal');
    if (drev) { drev.style.display = 'none'; drev.innerHTML = ''; }
    var box = document.getElementById('dtext');
    box.innerHTML = '<div class="tl">' + ids.map(function (i) {
      var n = NODES[i];
      var who = n.s === 'user' ? '你' : (n.s === 'assistant' ? 'AI' : (n.s || ''));
      var tx = maskText((n.txt || (n.th ? '〔图〕' : '')).replace(/\s+/g, ' ')).slice(0, 180);
      return '<div class="tlrow" data-i="' + i + '">'
        + '<span class="tm">' + fmtDate(n.t) + '</span>'
        + '<span class="who">' + esc(who) + '</span>'
        + '<div class="tx">' + esc(tx || '（只有光影）') + '</div></div>';
    }).join('') + '</div>';
    Array.prototype.forEach.call(box.querySelectorAll('.tlrow'), function (row) {
      row.onclick = function () { selectNode(+row.getAttribute('data-i')); };
    });
    document.getElementById('detail').classList.add('open');
    document.body.classList.add('panel-open');
    syncDetailActions(-1);
  }

  /**
   * 从「回顾」跳到某颗星之前，先把它这会儿被谁挡着弄清楚：
   * 层（近岸/远洋）、来源筛选、标签筛选、搜索、隐去、归档 —— 任何一个没摆对，
   * 跳过去就是"界面动了但看不到那颗星"。
   */
  function revealNode(idx) {
    var n = NODES[idx];
    if (!n) return false;
    if (marks.hide[nkey(idx)]) {
      toast('这一条你隐去了 · 打开「整理 → 看隐去的」能找回来');
      return false;
    }
    if (marks.arch[skey(n.sid)]) {
      toast('这段对话归档了 · 打开「整理 → 归档会话」能取消');
      return false;
    }
    var dirty = false;
    // 搜索还开着、这条又不在命中里 → 清掉搜索
    if (matchScores && !matchScores[idx]) {
      var qi = document.getElementById('q');
      if (qi) qi.value = '';
      runSearch('');
      dirty = true;
    }
    // 正在按标签看海，这条又没那个标签
    if (tagFilter && (marks.tag[nkey(idx)] || []).indexOf(tagFilter) < 0) {
      tagFilter = null;
      dirty = true;
    }
    // 来源被关掉了
    if (dataSrc === 'dsh' && typeof srcOn === 'object' && srcOn && srcOn[n.s] === 0) {
      srcOn[n.s] = 1; saveSrc(); dirty = true;
    }
    // 层不对就换层（applyTheme 自己会 refreshFilter）
    if (!matchScores && !(dataSrc === 'dsh' && typeof srcOn === 'object' && srcFiltering())) {
      var deep = isDeepLayer(n);
      if (TH.layer === 'deep' && !deep) { applyTheme('shallow'); dirty = false; }
      else if (TH.layer === 'shallow' && deep) { applyTheme('deep'); dirty = false; }
    }
    if (dirty) refreshFilter();
    if (!n.vis && !marks.hide[nkey(idx)]) {
      // 还有别的东西挡着（未来视、重叠、今天带子…）：兜底放开一次
      if (typeof futureDays === 'number' && futureDays > 0) { futureDays = 0; if (typeof syncFutBtns === 'function') syncFutBtns(); dirty = true; }
      if (overlapOn) { overlapOn = false; dirty = true; }
      if (dirty) refreshFilter();
    }
    return !!n.vis;
  }

  /** 从浮层里跳过去看某一颗星（整理/回顾/体检里所有"点一下"都走这里） */
  /**
   * 「这件事，别处也提过」—— 把 computeRelated 里落在别的会话的那几颗挑出来。
   * 星图上它们本来就亮着（相关星），但一片星点里看不出「哪个是别的会话」，
   * 所以在详情里排成一行行的，点一下跳过去。按离当前这条的时间远近排序。
   */
  function renderCrossRel(idx) {
    var box = document.getElementById('dxrel');
    var list = document.getElementById('dxlist');
    if (!box || !list) return;
    var n = NODES[idx];
    if (!n || !relatedSet) { box.style.display = 'none'; return; }
    var rows = [];
    relatedSet.forEach(function (d) {
      if (d === idx) return;
      var m = NODES[d];
      if (!m || m.src_ === 'sc') return;
      if (m.sid === n.sid) return;              // 同一段对话的，上面「前后几条」已经有了
      if (marks.hide[nkey(d)]) return;
      rows.push(d);
    });
    rows.sort(function (a, b) {
      return Math.abs(NODES[a].t - n.t) - Math.abs(NODES[b].t - n.t);
    });
    rows = rows.slice(0, 5);
    list.innerHTML = '';
    if (!rows.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    rows.forEach(function (d) {
      var m = NODES[d];
      var sv = SESS[m.sid];
      var title = (sv && sv.title) ? sv.title : '另一段对话';
      var gap = m.t - n.t;
      var ago = gap === 0 ? '同一时刻'
        : (gap > 0 ? '+' + fmtGap(gap) : '-' + fmtGap(-gap));
      var row = document.createElement('div');
      row.className = 'dxitem';
      row.innerHTML = '<span class="dxs">' + esc(title) + ' · <b>' + ago + '</b></span>'
        + '<span class="dxt">' + esc((m.txt || '（图）').replace(/\s+/g, ' ').slice(0, 72)) + '</span>';
      row.onclick = function () { goNode(d); };
      list.appendChild(row);
    });
  }

  /** 把毫秒差说成人话：'3 分钟' / '2 小时' / '5 天' */
  function fmtGap(ms) {
    var m = ms / 60000;
    if (m < 1) return '刚刚';
    if (m < 60) return Math.round(m) + ' 分钟';
    var h = m / 60;
    if (h < 24) return Math.round(h) + ' 小时';
    return Math.round(h / 24) + ' 天';
  }

  function goNode(idx) {
    closeMgmt();
    if (revealNode(idx)) {
      selectNode(idx);
      return true;
    }
    return false;
  }

  function selectNode(idx) {
    // 先把面板推出来（0.42s 滑入），内容在动画进行时再填 —— 点击的反馈在下一帧就开始了，
    // 不用等下面这一整段 DOM 构建。这是「点了就有」和「点了等一下」的区别。
    if (idx >= 0 && NODES[idx]) {
      detail.classList.add('open');
      document.body.classList.add('panel-open');
    }
    // 点星之后把 hover 高亮全清掉：不然鼠标扫过一片星，那些星的光圈会一直留着
    for (var _hi = 0; _hi < N; _hi++) { if (NODES[_hi].hlTarget) NODES[_hi].hlTarget = 0; }
    var nowSel = performance.now();
    var rapid = (nowSel - lastSelAt) < 420 && selIdx >= 0;   // 连点：手快的时候
    if (idx !== selIdx) {
      selFrom = selIdx;                // 上一颗：让它的环淡出
      selFromT0 = nowSel;
      // 连点时不再把 selT0 推回去 —— 否则每次点都从头播一遍「暗下去再亮起来」，
      // 点得快就会一直在闪。只有隔了足够久、或者从没选中过时才重播。
      if (!rapid) selT0 = nowSel;
    }
    lastSelAt = nowSel;
    selIdx = idx;
    var n = NODES[idx];
    syncDetailActions(idx);
    document.getElementById('dkind').textContent = kindName(n.k).toUpperCase() + ' · ' + fmtDate(n.t);
    var im = document.getElementById('dimg');
    if (n.th) { im.src = thumbURL(n.th); im.style.display = 'block'; }
    else { im.style.display = 'none'; }

    var s = SESS[n.sid] || {};
    document.getElementById('dmeta').innerHTML =
      '会话 · ' + esc(sessLabel(s)) + '<br>' +
      (s.cwd ? '工作区 · ' + esc(s.cwd) + '<br>' : '') +
      '来源 · ' + esc(srcName(n.s)) +
      // 同一句话在世界的对话副本里也有一条：说明它当时真被"过了一遍脑子"
      (n.w ? '<br><i class="wdup">这件事世界那边也记了一笔 · ' + fmtDate(n.w) + '</i>' : '');

    var txt = txtOf(n).trim();
    // texts.js 还没到：先说清楚"这是前半截，全文在路上"，别让人以为消息就只有这么长
    if (!txtLoaded(n) && !txLoading) loadTX();
    var txtTail = (!txtLoaded(n)) ? (' …（全文 ' + (n.rl || 0) + ' 字，正在加载后半截）') : '';
    var mi = maskInfo(txt);
    document.getElementById('dtext').textContent =
      ((revealSet[idx] ? txt : mi.text) || '（这一颗星里没有文字，只有光影。）') + txtTail;
    renderSensitive(idx, mi.n);

    var tg = document.getElementById('dtags');
    tg.innerHTML = '';
    var words = (n.kw || []).slice(0, 6);
    if (n.tg) words = (n.tg || []).slice(0, 4).concat(words);
    words.slice(0, 6).forEach(function (w) {
      var sp = document.createElement('span');
      sp.textContent = w;
      tg.appendChild(sp);
    });

    // 「这段对话」：按时间排好的同一段对话，当前这条标出来，上下各露 2 条。
    // 原来的做法是"取 4 条相关的"，没有前后感；现在直接给顺序和位置。
    var list = nodesBySid[n.sid] || [];
    var pos = list.indexOf(idx);
    var relBox = document.getElementById('drel');
    var relList = document.getElementById('drelist');
    var relTitle = document.getElementById('dreltitle');
    relList.innerHTML = '';
    if (list.length > 1 && pos >= 0) {
      relBox.style.display = 'block';
      relTitle.textContent = '这段对话 · 第 ' + (pos + 1) + ' / ' + list.length + ' 条';
      var _h = '';
      var _from = Math.max(0, pos - 2), _to = Math.min(list.length - 1, pos + 2);
      if (_from > 0) _h += '<div class="thrmore">↑ 前面还有 ' + _from + ' 条</div>';
      for (var _k = _from; _k <= _to; _k++) {
        var _qi = list[_k], _m = NODES[_qi];
        var _cur = _k === pos;
        var _tag = _cur ? '当前' : (_k < pos ? '前 ' + (pos - _k) : '后 ' + (_k - pos));
        _h += '<div class="thr' + (_cur ? ' cur' : '') + '"' + (_cur ? '' : ' data-thr="' + _qi + '"') + '>' +
          '<span class="tk">' + _tag + '</span>' +
          '<span class="tt">' + esc((_m.txt || '（无文字）').replace(/\s+/g, ' ').slice(0, 64)) + '</span>' +
          '</div>';
      }
      if (_to < list.length - 1) _h += '<div class="thrmore">↓ 后面还有 ' + (list.length - 1 - _to) + ' 条</div>';
      relList.innerHTML = _h;
      Array.prototype.forEach.call(relList.querySelectorAll('[data-thr]'), function (el) {
        el.onclick = function () {
          var _t = Number(el.getAttribute('data-thr'));
          selectNode(_t); flyTo(NODES[_t]);
        };
      });
    } else { relBox.style.display = 'none'; }

    renderTagArea(idx);
    detail.classList.add('open');
    document.body.classList.add('panel-open');
    var lg0 = document.getElementById('legend');
    if (lg0) lg0.classList.add('hide');
    document.getElementById('hint').classList.add('out');
    // 点一下先让详情出来 —— 关联计算（computeRelated + buildEcho + 跨会话）慢，
    // 放到下一帧做，体感从"点了等一下"变成"点了就有"。
    // 再往后推 70ms：让面板滑入动画先起步，重活别在动画第一帧抢主线程。
    setTimeout(function () {
      // 只留相关的记忆（同会话 + 语义相近），其余隐去
      relatedSet = computeRelated(idx);
      // 相关星按离选中星的远近排队，越近越先亮 —— 像光从这颗星散出去
      {
        var _sn = NODES[idx];
        var _q = [];
        relatedSet.forEach(function (d) {
          if (d === idx) return;
          var _dn = NODES[d];
          _q.push([Math.hypot((_dn.sx || 0) - (_sn.sx || 0), (_dn.sy || 0) - (_sn.sy || 0)), d]);
        });
        _q.sort(function (a, b) { return a[0] - b[0]; });
        for (var _i = 0; _i < _q.length; _i++) {
          NODES[_q[_i][1]].relDelay = Math.min(320, _i * 26);
        }
        // 只有最近这 8 颗套光圈。以前是按"屏幕距离 relK > 0.55"判断，
        // 放大以后 250px 能圈进几十颗，点一下冒出一片圆环 —— 割裂感就是这么来的。
        relRingSet = {};
        for (var _r = 0; _r < Math.min(8, _q.length); _r++) relRingSet[_q[_r][1]] = 1;
      }
      buildEcho(idx);
      for (var ei = 0; ei < N; ei++) if (echoDist[ei] >= 0) relatedSet.add(ei);
      renderCrossRel(idx);
      refreshFilter();
    }, 70);
    if (!rapid) focusOn(idx);
    else if (cam.s > 2.2) {
      // 已经推到近处了：连点时只轻轻把星挪到画面中间，不重设缩放/角度
      worldOf(idx, _w);
      startViewAnim({ x: _w.x, y: _w.y, s: cam.s, rot: rot, pitch: pitch, pan: -196 }, 260);
    }
  }

  // 把目标角拉回离 base 最近的那个等价角（差永远 ≤ π）。
  // 不做这一步，rot 累积到 7.0 之后再设目标 0.7，镜头就会风车一样多转一圈。
  function nearAng(t, base) {
    var d = t - base;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return base + d;
  }

  // 选中：先把这颗星转到正对着观者的角度（绕竖轴），再推近放大
  function normAng(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function focusOn(idx) {
    var n = NODES[idx];
    if (!n) return;
    if (focusIdx < 0 || !focusSaved) {
      focusSaved = { x: camTarget.x, y: camTarget.y, s: camTarget.s, pan: panShiftTgt, rot: rot, pitch: pitch };
    }
    focusIdx = idx;
    // 这颗星到底画在哪，交给 worldOf —— 和每帧渲染用的是同一份换算，
    // 年轮 / 重叠 / 星座三种重排都不会再让镜头跑到空处。
    worldOf(idx, _w);
    var wx = _w.x, wy = _w.y, wz = _w.z;
    if (ringMode) {
      // 年轮是俯视图：不缩放、不回正（这两样就是「乱拉镜头」），
      // 只有当这颗星已经偏出画面中心太远时，才轻轻平移过去。
      // 年轮里点星：也推近（否则自己那一圈看不清），方位角不动
      // —— 年轮是俯视极坐标，一转「圆心=现在」这个语义就歪了。
      // 关键：cam.x / cam.y 是「相机看向的那个点」，用的是**转过视角之后**的坐标，
      // 所以这里必须先套一遍 rot/pitch 再给镜头，否则用户先把画布转一圈再点星，
      // 镜头会跑到别处，星就飞出画面了。
      var csR = Math.cos(rot), ssR = Math.sin(rot), cpR = Math.cos(pitch), spR = Math.sin(pitch);
      var zzR = wx * ssR + wz * csR;
      var x1r = wx * csR - wz * ssR;
      var y1r = wy * cpR - zzR * spR;
      var sTgtR = cam.s < 1.15 ? 1.85 : cam.s;
      // 视角侧得太狠（圆盘快成一条线）时点星，星会全挤在线上看不清。
      // 这里把俯仰收回到 ±0.42 rad（约 24°）：还留着立体感，但圈还看得出是圈。
      var pTgtR = Math.max(-0.62, Math.min(0.62, pitch));
      startViewAnim({ x: x1r, y: y1r, s: sTgtR, rot: rot, pitch: pTgtR, pan: -196 }, 460);
      return;
    }
    // 其它模式：视角跟着选中的星转，把它转到「正对面」（旋转后 z 归零），镜头再推过去。
    // 这样不管它在海的哪一侧，点开的星总是正面朝着你。
    var L = Math.hypot(wx, wz);
    var rTgt = rot, x1, y1;
    if (L > 0.06) {
      rTgt = nearAng(Math.atan2(-wz, wx), rot);
      // 转到正面后，这颗星的投影 x 就等于它的水平半径，投影 y 只受俯角影响
      x1 = L;
      y1 = wy * Math.cos(pitch);
    } else {
      // 快贴着转轴了，转过去没什么意义，保持当前角度
      var ca = Math.cos(rot), sa = Math.sin(rot), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var z1 = wx * sa + wz * ca;
      x1 = wx * ca - wz * sa;
      y1 = wy * cp - z1 * sp;
    }
    // 点星时：视角转过去（让它正面朝着你）—— 这个可以有；
    // 但缩放一律不动，不推近也不拉远，否则每点一下画面就「呼」一下。
    // 点星：视角朝它转过去（限幅，不让整片海甩一圈），但从远处点就推近。
    var dRot0 = ((rTgt - rot + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    dRot0 = Math.max(-2.0, Math.min(2.0, dRot0));   // 约 115°，绝大多数星一步就能转到正面
    rTgt = rot + dRot0;
    // 关键：镜头目标必须用**转完之后的角度**去算投影。
    // 之前拿「完全转到正面」的 L 当目标，只转一部分时星就跑到画面外，看起来像「点了看不到」。
    var csR2 = Math.cos(rTgt), ssR2 = Math.sin(rTgt), cpR2 = Math.cos(pitch), spR2 = Math.sin(pitch);
    var zzR2 = wx * ssR2 + wz * csR2;
    x1 = wx * csR2 - wz * ssR2;
    y1 = wy * cpR2 - zzR2 * spR2;
    rotLock = true;
    rotBase = rTgt;
    rotTgt = rTgt;
    var sTgt = cam.s < 1.55 ? 2.35 : cam.s;
    startViewAnim({
      x: x1, y: y1, s: sTgt,
      rot: rTgt, pitch: pitch, pan: -196,
    }, 620);
  }

  function focusOut() {
    if (focusIdx < 0) return;
    focusIdx = -1;
    // 退出时把视角也转回原处，别让用户回不到刚才那片海
    var toRot = (focusSaved && focusSaved.rot != null) ? nearAng(focusSaved.rot, rot) : rot;
    var toPitch = (focusSaved && focusSaved.pitch != null) ? focusSaved.pitch : pitch;
    rotLock = true;
    rotBase = toRot;
    rotTgt = toRot;
    var to = focusSaved
      ? { x: focusSaved.x, y: focusSaved.y, s: focusSaved.s }
      : { x: cam.x, y: cam.y, s: cam.s };
    focusSaved = null;
    startViewAnim({
      x: to.x, y: to.y, s: to.s,
      rot: toRot, pitch: toPitch, pan: 0,
    }, 800);
  }

  // 统一的视图过渡：起点取当前值，终点给目标值，easeInOutCubic 一次性插完
  function startViewAnim(to, dur) {
    viewAnim = {
      t0: performance.now(),
      dur: dur || 760,
      from: { x: cam.x, y: cam.y, s: cam.s, rot: rot, pitch: pitch, pan: panShift },
      to: {
        x: to.x !== undefined ? to.x : cam.x,
        y: to.y !== undefined ? to.y : cam.y,
        s: to.s !== undefined ? to.s : cam.s,
        rot: to.rot !== undefined ? nearAng(to.rot, rot) : rot,
        pitch: to.pitch !== undefined ? to.pitch : pitch,
        pan: to.pan !== undefined ? to.pan : panShift,
      },
    };
  }
