  // ================= 交互 =================
  cv.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (mouse.down) {
      var dx = e.clientX - mouse.sx, dy = e.clientY - mouse.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) mouse.moved = true;
      if (mouse.mode === 'box') {
        if (bulkBox) { bulkBox.x1 = e.clientX; bulkBox.y1 = e.clientY; }
        mouse.moved = true;
        hideTip();
        return;
      }
      if (mouse.mode === 'rot') {
        // 右键拖拽 = 转视角（水平绕竖轴，垂直俯仰）
        rotBase = mouse.rot0 - dx * 0.0062;
        pitchBase = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, mouse.pitch0 + dy * 0.0042));
        pitchTgt = pitchBase;
        if (rotLock) { rotLock = false; rotTgt = rot; }
      } else {
        // 左键拖拽 = 平移整片海
        camTarget.x = mouse.camx - dx / (cam.s * K);
        camTarget.y = mouse.camy - dy / (cam.s * K);
      }
      // 拖的时候不更新 hover，但把之前残留的高亮清掉，避免拖过一片就留下一圈圈
      if (hoverIdx >= 0) { NODES[hoverIdx].hlTarget = 0; hoverIdx = -1; }
      hideTip();
      return;
    }
    var idx = pick(e.clientX, e.clientY);
    if (idx !== hoverIdx) {
      if (hoverIdx >= 0) NODES[hoverIdx].hlTarget = 0;
      hoverIdx = idx;
      if (idx >= 0) { NODES[idx].hlTarget = 1; showTip(idx, e.clientX, e.clientY); }
      else hideTip();
    } else if (idx >= 0) {
      showTip(idx, e.clientX, e.clientY);
    }
    cv.classList.toggle('pointing', idx >= 0);
  });

  // 右键菜单一律吃掉：右键现在是"转视角"手势，不能让浏览器菜单弹出来打断
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  cv.addEventListener('mousedown', function (e) {
    mouse.down = true; mouse.moved = false;
    viewAnim = null;                      // 用户一动就接管，别跟他抢
    mouse.sx = e.clientX; mouse.sy = e.clientY;
    mouse.camx = camTarget.x; mouse.camy = camTarget.y;
    mouse.rot0 = rotBase; mouse.pitch0 = pitchBase;
    // 左键 = 移动（平移整片海）；右键 / 中键 = 转视角；Shift+左键 = 框选一批星
    mouse.mode = (e.shiftKey && e.button === 0) ? 'box'
      : ((e.button === 2 || e.button === 1) ? 'rot' : 'pan');
    if (mouse.mode === 'box') {
      stopReview();
      bulkBox = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      clearBulkNoBox();
    }
    cv.classList.add('dragging');
    hideTip();
    e.preventDefault();
  });

  window.addEventListener('mouseup', function (e) {
    if (!mouse.down) return;
    mouse.down = false;
    cv.classList.remove('dragging');
    if (mouse.mode === 'box') { finishBulkBox(); return; }
    if (!mouse.moved) {
      var idx = pick(e.clientX, e.clientY);
      if (idx >= 0) selectNode(idx);
      else closeDetail();
    }
  });

  cv.addEventListener('dblclick', function (e) {
    // 双击空白处：回到全览（视角也归位）
    var idx = pick(e.clientX, e.clientY);
    if (idx >= 0) return;
    closeDetail();
    camTarget.x = 0; camTarget.y = 0; camTarget.s = 1.02;
    rotBase = 0; pitchBase = 0; pitchTgt = 0; rotLock = false;
  });

  cv.addEventListener('wheel', function (e) {
    e.preventDefault();
    viewAnim = null;
    var factor = Math.exp(-e.deltaY * 0.0013);
    var ns = Math.max(0.42, Math.min(14, camTarget.s * factor));
    // 围绕鼠标位置缩放
    var wx = s2wx(e.clientX);
    var wy = s2wy(e.clientY);
    cam.s = ns;
    camTarget.s = ns;
    cam.x = camTarget.x = wx - (e.clientX - cxOf()) / (ns * K);
    cam.y = camTarget.y = wy - (e.clientY - cyOf()) / (ns * K);
    hideTip();
  }, { passive: false });

  // 触屏：单指旋转 / 双指缩放
  var touch = null;
  cv.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      touch = { mode: 'rot', x: e.touches[0].clientX, y: e.touches[0].clientY, rot0: rotBase, pitch0: pitchBase };
    } else if (e.touches.length === 2) {
      var a = e.touches[0], b = e.touches[1];
      touch = { mode: 'zoom', d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: camTarget.s };
    }
  }, { passive: true });

  cv.addEventListener('touchmove', function (e) {
    if (!touch) return;
    e.preventDefault();
    if (touch.mode === 'rot' && e.touches.length === 1) {
      var t = e.touches[0];
      rotBase = touch.rot0 - (t.clientX - touch.x) * 0.008;
      pitchBase = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, touch.pitch0 + (t.clientY - touch.y) * 0.006));
      pitchTgt = pitchBase;
      if (rotLock) { rotLock = false; rotTgt = rot; }
    } else if (touch.mode === 'zoom' && e.touches.length === 2) {
      var a = e.touches[0], b = e.touches[1];
      var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      camTarget.s = Math.max(0.42, Math.min(14, touch.s * d / touch.d));
    }
    hideTip();
  }, { passive: false });

  cv.addEventListener('touchend', function () { touch = null; });
