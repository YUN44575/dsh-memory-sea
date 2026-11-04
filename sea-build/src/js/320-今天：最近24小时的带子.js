  // ================= 今天：最近 24 小时的带子 =================
  var todayOpen = false;
  function toggleToday() {
    todayOpen = !todayOpen;
    var el = document.getElementById('today');
    document.getElementById('todaybtn').classList.toggle('on', todayOpen);
    if (todayOpen) {
      hideResults();
      if (selIdx >= 0) closeDetail();
      renderToday();
      el.classList.add('open');
    } else {
      el.classList.remove('open');
    }
  }
  function renderToday() {
    var strip = document.getElementById('tstrip');
    var cut = TNOW - 86400000;
    var list = [];
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (n.t < cut || n.t > TNOW) continue;
      if (marks.hide[nkey(i)] || marks.arch[skey(n.sid)]) continue;
      list.push(n);
    }
    list.sort(function (a, b) { return a.t - b.t; });
    document.getElementById('tcnt').textContent = list.length;
    var html = '';
    for (var j = 0; j < list.length; j++) {
      var m = list[j];
      var d = new Date(m.t);
      var hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      var label = hh + ' · ' + (m.k === 'image' ? ('图 ' + (m.ic || 1) + ' 张')
        : m.k === 'memory' ? '长期记忆' : (m.txt || '').slice(0, 18));
      var bg = m.th ? "background-image:url('thumbs/" + m.th + ".jpg')" : '';
      html += '<div class="titem' + (m.k === 'text' ? ' text' : '')
        + '" data-i="' + m.i + '" style="' + bg + '"><span class="tlab">' + label + '</span></div>';
    }
    strip.innerHTML = html || '<div style="color:var(--dim);font-size:12px;padding-bottom:14px">这 24 小时里没有记忆</div>';
    var items = strip.querySelectorAll('.titem');
    for (var q = 0; q < items.length; q++) {
      items[q].addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-i'), 10);
        selectNode(idx);
      });
    }
  }
  document.getElementById('tclose').onclick = function () { if (todayOpen) toggleToday(); };

  // 快进：让时间流起来，看着一批星慢慢变暗、沉下去
  // 时间：现在是 → 往前走 → 停在那一刻 → 回到现在（点三下转一圈）
  var tvState = 0;   // 0=现在 1=在走 2=停住
  // 「这片海怎么看」：第一次来先讲一遍，之后从 ⋯ 里点开
  (function () {
    var g = document.getElementById('guide');
    if (!g) return;
    var shut = function (mark) {
      g.classList.remove('open');
      if (mark) { try { localStorage.setItem('sea.guide.v1', '1'); } catch (e) {} }
    };
    document.getElementById('guideX').onclick = function () { shut(1); };
    document.getElementById('guideOk').onclick = function () { shut(1); };
    g.addEventListener('click', function (e) { if (e.target === g) shut(1); });
    var hb = document.getElementById('helpbtn');
    if (hb) hb.onclick = function () {
      // 帮助和引导别叠在一起：先收掉引导再开说明
      try { document.getElementById('tour').classList.remove('on'); } catch (e) {}
      g.classList.add('open');
    };
    // 第一次来不直接甩一整篇说明（读不完也不知道从哪下手），
    // 改成四步「跟点」：说到哪个元素，就把哪个元素框出来。
    var TOUR = [
      { sel: '#topbar', pos: 'bottom', title: '这是一片「记忆星海」',
        text: '你在 DSH 里说过的每一句话，都在这里变成一颗星。下面四步，一分钟就能上手。' },
      { sel: '#q', pos: 'bottom', title: '想找什么，直接搜',
        text: '输入一个词或一句话，海里立刻只留下跟它相关的星。记不清原话也没关系，搜你大概记得的词。' },
      { sel: '#sesslist', pos: 'right', title: '左边是你的会话清单',
        text: '按你建的工作区分好组了。点其中一段，属于这段对话的星会亮起来，还能顺着往下读。' },
      { sel: '#sea', pos: 'center', title: '点一颗星，看它当时说了什么',
        text: '星越大 = 这条你反复提过；外面有虚线圈 = 被标成了长期记忆。右边随时能翻全文、打标签。' }
    ];
    var tourEl = document.getElementById('tour');
    var spotEl = document.getElementById('tspot');
    var cardEl = document.getElementById('tcard');
    var tourK = 0;
    function saveTour() { try { localStorage.setItem('sea.tour.v1', '1'); } catch (e) {} }
    function tourEnd(openGuide) {
      tourEl.classList.remove('on');
      saveTour();
      if (openGuide) g.classList.add('open');
    }
    function placeCard(r, pos) {
      var W = window.innerWidth, H = window.innerHeight;
      var cw = 330, ch = cardEl.offsetHeight || 190, GAP = 14;
      var x, y;
      if (pos === 'center' || !r) { x = (W - cw) / 2; y = H - ch - 70; }
      else if (pos === 'right') { x = Math.min(r.right + GAP, W - cw - 16); y = Math.max(16, Math.min(r.top + 30, H - ch - 16)); }
      else { x = Math.max(16, Math.min(r.left + r.width / 2 - cw / 2, W - cw - 16)); y = r.bottom + GAP; if (y + ch > H - 16) y = Math.max(16, r.top - ch - GAP); }
      cardEl.style.left = x + 'px';
      cardEl.style.top = y + 'px';
    }
    function tourStep(k) {
      if (k >= TOUR.length) { tourEnd(false); return; }
      if (k < 0) k = 0;
      tourK = k;
      var st = TOUR[k];
      document.getElementById('tstep').textContent = (k + 1) + ' / ' + TOUR.length;
      document.getElementById('ttitle').textContent = st.title;
      document.getElementById('ttext').textContent = st.text;
      document.getElementById('tprev').style.visibility = k === 0 ? 'hidden' : 'visible';
      document.getElementById('tnext').textContent = k === TOUR.length - 1 ? '开始用' : '下一步';
      var el = document.querySelector(st.sel);
      var r = el ? el.getBoundingClientRect() : null;
      if (r && st.pos !== 'center') {
        var pad = 6;
        spotEl.style.display = 'block';
        spotEl.style.left = (r.left - pad) + 'px';
        spotEl.style.top = (r.top - pad) + 'px';
        spotEl.style.width = (r.width + pad * 2) + 'px';
        spotEl.style.height = (r.height + pad * 2) + 'px';
      } else {
        // 全屏的星图：不挖洞（挖了整块都被框住），只留气泡
        spotEl.style.display = 'none';
        spotEl.style.boxShadow = '0 0 0 9999px rgba(4,7,13,.62)';
      }
      placeCard(r, st.pos);
    }
    function startTour() {
      tourEl.classList.add('on');
      tourStep(0);
    }
    document.getElementById('tnext').onclick = function () { tourStep(tourK + 1); };
    document.getElementById('tprev').onclick = function () { tourStep(tourK - 1); };
    document.getElementById('tskip').onclick = function () { tourEnd(false); };
    window.addEventListener('resize', function () { if (tourEl.classList.contains('on')) tourStep(tourK); });
    var tSeen = null, seen = null;
    try { tSeen = localStorage.getItem('sea.tour.v1'); } catch (e) {}
    try { seen = localStorage.getItem('sea.guide.v1'); } catch (e) {}
    // 看过老版长说明的人算「已上手」，不再弹四步
    if (!tSeen && seen) { saveTour(); tSeen = '1'; }
    if (!tSeen) setTimeout(startTour, 1200);
  })();
