  // ================= 缩略图 =================
  var thumbCache = {};
  var loadBudget = 16;
  var busyDrag = false;
  function thumbURL(sha) { return 'thumbs/' + sha + '.jpg'; }
  function getThumb(sha, cb) {
    if (thumbCache[sha]) return thumbCache[sha];
    if (loadBudget <= 0) return null;
    loadBudget--;
    var img = new Image();
    var rec = { img: img, ready: false, t: 0 };
    img.onload = function () { rec.ready = true; rec.t = performance.now(); };
    img.src = thumbURL(sha);
    thumbCache[sha] = rec;
    return rec;
  }
