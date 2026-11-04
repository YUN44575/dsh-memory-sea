  // ================= 敏感内容打码 =================
  // 会话正文里真的有 sk-… 这类密钥、手机号。管理记忆的系统应该先遮住，
  // 想看原文再点一下 —— 不做这一步，「导出 / 分享」就等于把密钥一起给出去了。
  var SENS_RES = [
    /sk-[A-Za-z0-9_-]{12,}/g,
    /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
    /xox[baprs]-[A-Za-z0-9-]{10,}/g,
    /AKIA[0-9A-Z]{16}/g,
    /AIza[0-9A-Za-z_-]{30,}/g,
    /Bearer\s+[A-Za-z0-9._-]{16,}/g,
    /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g
  ];
  var revealSet = {};        // idx → 1：这一颗已经点开看过原文（只存在内存里）
  function maskInfo(str) {
    var n = 0;
    var text = String(str == null ? '' : str);
    for (var i = 0; i < SENS_RES.length; i++) {
      text = text.replace(SENS_RES[i], function (m) {
        n++;
        var head = m.length > 24 ? 6 : 4;
        return m.slice(0, head) + '••••••' + m.slice(-3);
      });
    }
    return { text: text, n: n };
  }
  function maskText(str) { return maskInfo(str).text; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function closeDetail() {
    var lg1 = document.getElementById('legend');
    if (lg1) lg1.classList.remove('hide');
    detail.classList.remove('open');
    if (!document.getElementById('results').classList.contains('open')
        && !document.getElementById('shelf').classList.contains('open')) {
      document.body.classList.remove('panel-open');
    }
    selIdx = -1;
    if (relatedSet) { relatedSet = null; refreshFilter(); }
    clearEcho();
    focusOut();
  }
  document.getElementById('dclose').onclick = closeDetail;
  document.getElementById('dstar').onclick = function () { toggleStar(selIdx); };
  document.getElementById('dhide').onclick = function () { toggleHide(selIdx); };
  document.getElementById('shbtn').onclick = toggleShelf;
  document.getElementById('shclose').onclick = toggleShelf;
  (function () {
    var nt = document.getElementById('dnote');
    var timer = null;
    nt.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        setNote(selIdx, nt.value);
        var st = document.getElementById('dnoteState');
        if (st) st.textContent = nt.value.trim() ? '已存' : '';
        if (shelfOpen) renderShelf();
      }, 500);
    });
    nt.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { nt.blur(); }
    });
  })();
  document.getElementById('rclose').onclick = function () {
    hideResults();
    runSearch('');
    var inp = document.querySelector('#search input');
    if (inp) inp.value = '';
  };

  function flyTo(n) {
    // 详情里点关联记忆：同样走"转正 → 放大"
    focusOn(n.i);
  }
