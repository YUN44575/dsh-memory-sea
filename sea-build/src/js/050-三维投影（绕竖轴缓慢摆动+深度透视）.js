  // ================= 三维投影（绕竖轴缓慢摆动 + 深度透视） =================
  var rot = 0;                  // 当前摆角（弧度）
  var rotTgt = 0;               // 摆角目标
  var rotBase = 0;              // 用户拖拽设定的基准角，自动摆动围绕它
  var ROT_AMP = 0.06;           // 自动摆动幅度（用户可自己转，所以收窄）
  var ROT_SPEED = 0.00016;      // 一周期约 39 秒
  var rotOn = true;
  var rotLock = false;          // 聚焦某颗星时锁住角度
  var viewAnim = null;          // 统一视图过渡 {t0,dur,from,to}；用户一动就取消
  var viewAnimDone = null;
  var pitch = 0.24, pitchBase = 0.24, pitchTgt = 0.24;   // 上下俯仰（默认微斜，一眼看出这是立体的）
  // 点开一段对话时，把这段对话的星重新摆成一条盘绕的星座，
  // 按时间顺序连起来才不会乱成一团（布局是按语义排的，同一段对话原本散在各处）
  var constelX = null, constelY = null;
  var PITCH_MAX = 0.78;
  var lastAnchorY = -999;
  var focusIdx = -1, focusSaved = null;

  // 把一段对话的星摆成一条盘绕的弧：从 0 号（最早）盘到最后一颗（最晚）
  function buildConstellation(sid) {
    constelX = null; constelY = null;
    if (sid < 0) return;
    var list = nodesBySid[sid];
    if (!list || list.length < 2) return;
    constelX = new Float64Array(N).fill(1e9);
    constelY = new Float64Array(N).fill(1e9);
    // 以这一段对话可见节点的质心为中心
    var mx = 0, my = 0, cnt = 0;
    for (var q = 0; q < list.length; q++) {
      var nn = NODES[list[q]];
      if (!nn.vis) continue;
      mx += nn.x; my += nn.y; cnt++;
    }
    if (!cnt) { constelX = null; constelY = null; return; }
    mx /= cnt; my /= cnt;
    var R0 = 0.30, TOTAL = list.length;
    for (var q2 = 0; q2 < list.length; q2++) {
      var id = list[q2];
      var t = TOTAL === 1 ? 0.5 : q2 / (TOTAL - 1);
      // 一条向内收紧的螺旋：越往后的星越靠里，时间流看得见
      var ang = t * 6.283 * 1.35 - 0.5;
      var rad = R0 * (1.0 - 0.55 * t);
      // 只加一点点抖动：太多会把连线抖成锯齿，完全不加又像机械臂
      var jr2 = (Math.sin(id * 12.9898) * 43758.5453 % 1) * 0.018;
      var jt2 = (Math.sin(id * 78.233) * 12345.6789 % 1) * 0.022;
      constelX[id] = mx + Math.cos(ang + jt2) * rad * (1.15 + jr2);
      constelY[id] = my + Math.sin(ang + jt2) * rad * 0.62 * (1.0 + jr2 * 0.7);
    }
  }

  // ── 世界坐标：这颗星最终画在哪 ────────────────────────────────────────
  // 布局 → 星座 → 年轮 → 重叠，所有「重排投影」都只准写在这一个函数里。
  // projectAll()（每帧算屏幕位置）和 focusOn()（点星时镜头要转到哪）
  // 都必须调它 —— 以前两处各写一遍，已经因此连续修了三次「点星跑到空处」。
  var _w = { x: 0, y: 0, z: 0 };
  function worldOf(i, out) {
    var n = NODES[i];
    var nx, ny, nz = 0;
    if (ringMode) {
      // 年轮：方位沿用原来的，半径改成「离现在多少天」
      var agd = Math.max(0, (dataNow - (n.t || dataNow)) / DAY);
      // 往后看时，已经忘掉的那些会被时间一路推出去（其它星不动）
      var drift = 0;
      if (n.futC === 'forgotten' && futureDays > 0) {
        // 被时间推出去，但不是整齐地推成一堵墙：按 id 散开一点
        var dk = 0.55 + 0.75 * (((n.i * 37) % 13) / 13);
        drift = futureDays * ringUnit * 0.5 * dk;
      }
      var rr0 = Math.min(1.02, agd * ringUnit + drift);
      if (n._rAng == null) n._rAng = Math.atan2(n.y, n.x);
      nx = Math.cos(n._rAng) * rr0;
      ny = Math.sin(n._rAng) * rr0;
    } else if (constelX && constelX[i] !== 1e9) {
      nx = constelX[i]; ny = constelY[i]; nz = 0;
    } else {
      nx = n.x; ny = n.y; nz = n.z;
    }
    if (overlapOn && !(constelX && constelX[i] !== 1e9)) {
      // 两片海各缩一半、左右摆开：DSH 在左，她的记忆在右
      var side = n.src_ === 'sc' ? 1 : -1;
      nx = nx * 0.54 + side * 0.60;
      ny = ny * 0.54;
      nz = nz * 0.54;
    }
    out.x = nx; out.y = ny; out.z = nz;
  }

  function projectAll() {
    var ca = Math.cos(rot), sa = Math.sin(rot);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var k = cam.s * K, cx = cxOf(), cy = cyOf();
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!n.vis) { n.sx = -1e5; n.sy = -1e5; n.persp = 1; continue; }
      worldOf(i, _w);
      var nx = _w.x, ny = _w.y, nz = _w.z;
      // 先绕竖轴转，再绕横轴俯仰
      var x1 = nx * ca - nz * sa;
      var z1 = nx * sa + nz * ca;
      var y1 = ny * cp - z1 * sp;
      var z2 = ny * sp + z1 * cp;
      var persp = 1 / (1 + z2 * 0.30);
      n.nz = z2;
      n.persp = persp;
      n.sx = cx + (x1 - cam.x) * k * persp;
      n.sy = cy + (y1 - cam.y) * k * persp;
    }
  }

  // 随便一个世界坐标点（岛心等）走同一套投影，拿到屏幕位置
  function projPoint(wxx, wyy) {
    var ca = Math.cos(rot), sa = Math.sin(rot);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x1 = wxx * ca, z1 = wxx * sa;
    var y1 = wyy * cp - z1 * sp, z2 = wyy * sp + z1 * cp;
    var persp = 1 / (1 + z2 * 0.30);
    var k = cam.s * K;
    return { x: cxOf() + (x1 - cam.x) * k * persp, y: cyOf() + (y1 - cam.y) * k * persp, p: persp };
  }