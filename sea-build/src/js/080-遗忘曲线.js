  // ================= 遗忘曲线 =================
  var DAY = 86400000;
  // "现在"从数据采集那一刻开始算，页面开着就一秒一秒往前走。
  // （直接用 Date.now() 的话，数据刚采完、所有记忆都还"崭新"，遗忘永远不发生）
  var openedAt = Date.now();
  var dataNow = SEA.t1 || openedAt;
  var TNOW = dataNow;
  var realNow = dataNow;
  // 快进：1 秒 ≈ 1.6 小时，把"几天后才看得出"的遗忘压缩成能看见的过程
  var travelOn = false, travelPaused = false;
  var travelNow = 0;
  var TRAVEL_SPEED = 86400000 / 2200;
  var travelLast = 0;
  var forgetOn = true;
  var zoneFilter = -1;      // -1 全部 / 0 工作海 / 1 陪伴海
  var visN = 871;           // 当前画面里真正可见的记忆数（云气浓度按它归一）

  // SurfCore 的记忆自带一套「像人一样忘」的设定：
  //   长期记住的（置顶 / 初次相遇 / 约定 / 主人重要事）→ 永远深层
  //   其余的 → 重要度 + 最近性 + 被重温次数，越久越不重要越淡
  function surfcoreR(n) {
    // SurfCore 自己的留存公式（importance + 召回加成 + 近况加成 − 时间惩罚），
    // 这里做等价简化：重要 / 想得起 / 记忆本身清不清楚，三样决定她记得多牢。
    if (n.ghost) return 0.02;                 // 档案里还在、但已经忘了的
    var imp = n.imp == null ? 0 : n.imp;      // 0..1
    var days = Math.max(0, (TNOW - (n.t || TNOW)) / DAY);
    var recency = Math.exp(-days / 9);
    var recall = Math.min(1, (n.recall || 0) / 3);
    if (n.longTerm) {
      // 长期记住的那一档：稳稳在深层，但深浅之间仍能看出轻重
      return Math.min(1, 0.70 + 0.30 * imp);
    }
    var r = 0.44 * imp + 0.26 * recency + 0.10 * recall;
    if (n.clarity === 'fuzzy') r *= 0.62;
    else if (n.clarity === 'trace') r *= 0.30;
    return Math.max(0.02, Math.min(0.96, r));
  }
