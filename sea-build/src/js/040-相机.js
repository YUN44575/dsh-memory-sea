  // ================= 相机 =================
  var cam = { x: 0, y: 0, s: 1.18 };
  var camTarget = { x: 0, y: 0, s: 1.02 };
  var K = 1;

  function baseScale() { return Math.min(W, H) * 0.545; }
  var panShift = 0, panShiftTgt = 0;   // 详情面板打开时整片海左移，让选中的星落在可视区中心
  function cxOf() { return W / 2 + 102 + panShift; }   // 左边会话列表占了 205px，中心要往右让
  function cyOf() { return H / 2 - 10; }
  function w2sx(wx) { return cxOf() + (wx - cam.x) * cam.s * K; }
  function w2sy(wy) { return cyOf() + (wy - cam.y) * cam.s * K; }
  function s2wx(sx) { return cam.x + (sx - cxOf()) / (cam.s * K); }
  function s2wy(sy) { return cam.y + (sy - cyOf()) / (cam.s * K); }
