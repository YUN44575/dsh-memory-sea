(function () {
  'use strict';

  // 两片海可以切：DSH 会话（window.SEA）/ SurfCore 记忆（window.SC）
  // 两套数据各自归一化到单位圆，共用同一套渲染；切换时只换 SEA 引用 + 过滤，
  // 所以它们永远不会在同一个画面里重叠。
  // 还没跑过 setup（没有 data.js 里的数据）：别白屏，直接说清楚下一步做什么
  if (!window.SEA || !Array.isArray(window.SEA.nodes) || !window.SEA.nodes.length) {
    var boot0 = document.getElementById('boot');
    if (boot0) {
      boot0.innerHTML = '<div class="bc">'
        + '<div class="bs">还没有记忆数据</div>'
        + '<div class="bt">这个插件刚装上时是空的 —— 它要先把你 DSH 里的会话采集进来。<br>'
        + '打开一个终端，粘这一行（跑 3~5 秒，跑完刷新这一页）：</div>'
        + '<div class="bcmd"><code id="bootcmd">node sea-build/setup.mjs</code><b id="bootcopy">复制</b></div>'
        + '<div class="bt2">从插件里打开时这里会自动换成完整路径（含插件目录）；<br>直接双击本地文件打开的话，先 cd 到插件目录再跑。</div>'
        + '</div>';
      var bcmdEl = document.getElementById('bootcmd');
      var bcopyEl = document.getElementById('bootcopy');
      function bindCopy(cmd) {
        bcopyEl.onclick = function () {
          try { navigator.clipboard.writeText(cmd); } catch (e) {}
          bcopyEl.textContent = '已复制';
          setTimeout(function () { bcopyEl.textContent = '复制'; }, 1600);
        };
      }
      bindCopy('node sea-build/setup.mjs');
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        // 服务端知道插件真实装在哪，问它要完整命令
        fetch('/sea/api/status').then(function (r) { return r.json(); }).then(function (j) {
          if (!j || !j.setupCmd) return;
          bcmdEl.textContent = j.setupCmd;
          bindCopy(j.setupCmd);
        }).catch(function () {});
      }
    }
    return;
  }
  var DSHSEA = window.SEA;
  var SCSEA = window.SC || null;
  var DSHN = DSHSEA.nodes.length;
  var ALLNODES = DSHSEA.nodes.slice();
  for (var _u0 = 0; _u0 < ALLNODES.length; _u0++) ALLNODES[_u0].src_ = 'dsh';
  if (SCSEA) {
    var _sidOff = DSHSEA.sessions.length;
    for (var _u1 = 0; _u1 < SCSEA.nodes.length; _u1++) {
      var _sn = SCSEA.nodes[_u1];
      _sn.src_ = 'sc';
      _sn.i = DSHN + _u1;
      _sn.sid = _sidOff + _sn.sid;
      ALLNODES.push(_sn);
    }
    for (var _u2 = 0; _u2 < SCSEA.sessions.length; _u2++) SCSEA.sessions[_u2].src_ = 'sc';
    SCSEA.edges = SCSEA.edges.map(function (e) { return [DSHN + e[0], DSHN + e[1]]; });
  }
  var dataSrc = 'dsh';
  var overlapOn = false;   // 两片海并排 + 连桥                 // 'dsh' | 'sc'
  var SEA = DSHSEA;
  var NODES = ALLNODES;
  var SESS = DSHSEA.sessions.concat(SCSEA ? SCSEA.sessions : []);
  // 空壳会话（只建了档、一句话没说过）：不进星图，但保留在数据里，
  // 让"所有会话都看得见"这件事成立 —— 它们折叠在会话列表最底部
  var PARKED = DSHSEA.parked || [];
  var N = NODES.length;
