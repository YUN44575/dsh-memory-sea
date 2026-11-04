  // ================= 节点数据 =================
  var bySid = {};
  var nodesBySid = SESS.map(function () { return []; });
  for (var i = 0; i < N; i++) {
    var nd = NODES[i];
    if (!nodesBySid[nd.sid]) nodesBySid[nd.sid] = [];
    nodesBySid[nd.sid].push(i);
  }
