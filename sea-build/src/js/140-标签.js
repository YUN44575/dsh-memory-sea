  // ================= 标签 =================
  function nodeTags(idx) { return (marks.tag && marks.tag[nkey(idx)]) || []; }
  function setNodeTags(idx, arr) {
    if (!marks.tag) marks.tag = {};
    if (arr && arr.length) marks.tag[nkey(idx)] = arr; else delete marks.tag[nkey(idx)];
    saveMarks();
  }
  function addTagToMany(idxs, name) {
    name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 12);
    if (!name || !idxs || !idxs.length) return;
    idxs.forEach(function (i) {
      var t = nodeTags(i).slice();
      if (t.indexOf(name) < 0) t.push(name);
      setNodeTags(i, t);
    });
    refreshFilter();
    if (shelfOpen) renderShelf();
  }
  function removeTagEverywhere(name) {
    Object.keys(marks.tag || {}).forEach(function (k) {
      var t = (marks.tag[k] || []).filter(function (q) { return q !== name; });
      if (t.length) marks.tag[k] = t; else delete marks.tag[k];
    });
    saveMarks();
    if (tagFilter === name) tagFilter = null;
    refreshFilter();
    if (shelfOpen) renderShelf();
  }
  function renderTagArea(idx) {
    var box = document.getElementById('dtagList');
    if (!box) return;
    box.innerHTML = '';
    nodeTags(idx).forEach(function (t) {
      var sp = document.createElement('span');
      sp.className = 'tg';
      sp.innerHTML = esc(t) + '<b>×</b>';
      sp.title = '点一下去掉这个标签';
      sp.onclick = function () {
        setNodeTags(idx, nodeTags(idx).filter(function (q) { return q !== t; }));
        renderTagArea(idx); refreshFilter(); if (shelfOpen) renderShelf();
      };
      box.appendChild(sp);
    });
    // 自动关键词：点一下收成真标签（管理动作从"算法给的"变成"我定的"）
    (NODES[idx].kw || []).slice(0, 4).forEach(function (w) {
      if (nodeTags(idx).indexOf(w) >= 0) return;
      var sp = document.createElement('span');
      sp.className = 'tg auto';
      sp.textContent = w;
      sp.title = '自动关键词，点一下收成标签';
      sp.onclick = function () { addTagToMany([idx], w); renderTagArea(idx); };
      box.appendChild(sp);
    });
  }
