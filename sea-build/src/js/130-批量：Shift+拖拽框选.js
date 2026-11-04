  // ================= 批量：Shift+拖拽框选 =================
  var bulkBox = null;       // 正在拖的那个框（屏幕坐标）
  var bulkSel = [];         // 框里的星
  var bulkSet = null;       // 同上的 Set，画环时用
  function showBulkBar() {
    var el = document.getElementById('bulk');
    if (!el) return;
    document.getElementById('bulkCnt').textContent = '已选 ' + bulkSel.length + ' 颗';
    el.classList.add('on');
    document.getElementById('hint').classList.add('out');
  }
  function hideBulkBar() {
    var el = document.getElementById('bulk');
    if (el) el.classList.remove('on');
  }
  function clearBulk() {
    bulkSel = []; bulkSet = null; bulkBox = null; hideBulkBar();
  }
  function clearBulkNoBox() {
    bulkSel = []; bulkSet = null; hideBulkBar();
  }
  // 框里挑星：只挑看得见的；框太小时当作点击
  function collectBox(x0, y0, x1, y1) {
    var out = [];
    var minx = Math.min(x0, x1), maxx = Math.max(x0, x1);
    var miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    for (var i = 0; i < N; i++) {
      var n = NODES[i];
      if (!n.vis) continue;
      if (n.sx < minx || n.sx > maxx || n.sy < miny || n.sy > maxy) continue;
      out.push(i);
    }
    return out;
  }
  function finishBulkBox() {
    if (!bulkBox) return;
    var b = bulkBox;
    bulkBox = null;
    var w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
    if (w < 8 && h < 8) { clearBulk(); return; }   // 只是点了一下
    bulkSel = collectBox(b.x0, b.y0, b.x1, b.y1);
    bulkSet = new Set(bulkSel);
    if (bulkSel.length) showBulkBar(); else hideBulkBar();
  }
  function bindTagInput() {
    var tb = document.getElementById('tagbar');
    if (tb && !tb.__bound) {
      tb.__bound = 1;
      tb.onclick = function () {
        tagFilter = null;
        refreshFilter();
        if (shelfOpen) renderShelf();
      };
    }
    var inp = document.getElementById('dtagIn');
    if (!inp || inp.__bound) return;
    inp.__bound = 1;
    inp.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = inp.value;
      if (!String(v || '').trim()) return;
      // 手里有框选就给整框加，否则给当前这颗加
      var targets = (bulkSel && bulkSel.length) ? bulkSel.slice() : (selIdx >= 0 ? [selIdx] : []);
      if (!targets.length) return;
      addTagToMany(targets, v);
      inp.value = '';
      if (selIdx >= 0) renderTagArea(selIdx);
    });
  }

  function bindBulk() {
    var bkStar = document.getElementById('bkStar');
    var bkHide = document.getElementById('bkHide');
    var bkTag = document.getElementById('bkTag');
    var bkClear = document.getElementById('bkClear');
    if (!bkStar) return;
    bkStar.onclick = function () {
      var now = Date.now();
      bulkSel.forEach(function (i) { marks.star[nkey(i)] = now; });
      saveMarks(); refreshFilter(); if (shelfOpen) renderShelf();
      clearBulk();
    };
    bkHide.onclick = function () {
      bulkSel.forEach(function (i) { marks.hide[nkey(i)] = 1; });
      saveMarks(); refreshFilter(); if (shelfOpen) renderShelf();
      clearBulk();
    };
    bkTag.onclick = function () {
      var name = window.prompt('给这 ' + bulkSel.length + ' 颗加一个标签：', '');
      if (name) addTagToMany(bulkSel.slice(), name);
      clearBulk();
    };
    bkClear.onclick = function () { clearBulk(); };
  }

  function updateTagBar() {
    var el = document.getElementById('tagbar');
    if (!el) return;
    if (!tagFilter) { el.hidden = true; return; }
    el.hidden = false;
    var t = el.querySelector('.tch');
    if (t) t.textContent = '标签 · ' + tagFilter;
  }
