  // ================= 主题 = 记忆层 =================
  // deep    深海：沉淀下来的深层记忆（R 高，不容易忘）
  // shallow 浅滩：还在水面漂着的浅层记忆（R 低，正在淡忘）
  // 分层的唯一判据：这条记忆会不会被忘掉？
  //   深海 = 长期记忆：系统明确记下的（fish-memory 条目）、
  //         重要性高的（imp >= 0.5）、以及你亲手收藏的 → 不淡忘，一直亮着
  //   浅滩 = 短期记忆：其余全部 → 随时间一路变暗，最后真的看不见
  // 注意：数据里 2324 条只有 14 条是真正的长期记忆——这不是 bug，
  // 大多数聊天记录本来就该被忘掉。
  var emoMode = false;              // 按情绪上色
  var echoDist = new Float32Array(0);   // 回声：每个节点到选中星的跳数（-1 不算）
  var echoT0 = 0;
  var DEEP_R = 0.5;
  function isDeepLayer(n) {
    // 滞回：跨过 0.5 才算沉下去，但要跌破 0.47 才算漂起来。
    // 不这样做，卡在边界上的星星会跟着时间一点点挪动来回横跳，
    // 画面上就是「什么都没干也在闪」——SurfCore 的留存强度正好是连续变的。
    if (n._deep === undefined) n._deep = n.R >= DEEP_R;
    else if (n._deep && n.R < DEEP_R - 0.03) n._deep = false;
    else if (!n._deep && n.R >= DEEP_R + 0.005) n._deep = true;
    return n._deep;
  }
  var THEMES = {
    deep: {
      layer: 'deep',
      bg0: '#04070d', bg1: '#071119', bg2: '#0b1a2a',
      neb: ['rgba(30,92,150,.34)', 'rgba(78,44,120,.26)', 'rgba(18,96,118,.30)'],
      node: { image: '#ffc46a', text: '#7fdcff', memory: '#c08cff' },
      cmp: { image: '#ff9ec0', text: '#ffd2aa', memory: '#ff8fd0' },
      core: 'rgba(255,255,255,.95)',
      line: 'rgba(120,180,220,.12)',
      sizeScale: 1,
      glowA: 0.55
    },
    shallow: {
      layer: 'shallow',
      // 暮色：同一片海，只是到了天黑前那一刻 —— 还是看星，只是光变暖了。
      // （原来是「晨光」白底，但星是发光体，白底上没法发光，只能变成一堆脏点。）
      bg0: '#100b16', bg1: '#181120', bg2: '#241a29',
      neb: ['rgba(150,92,120,.30)', 'rgba(96,66,124,.28)', 'rgba(196,124,92,.16)'],
      node: { image: '#ffd8a0', text: '#ffb383', memory: '#ffcf8f' },
      cmp: { image: '#ff9ec8', text: '#ffbfae', memory: '#f590d8' },
      core: 'rgba(255,248,238,.95)',
      line: 'rgba(255,196,150,.14)',
      sizeScale: 1.28,
      glowA: 0.55
    }
  };
  var theme = 'deep';
  var TH = THEMES.deep;
  // 浅层 ⇄ 深层 的过渡：先淡出老的那一层，换层，再淡入新的
  var layerFade = 1;
  var layerTrans = null;
  var frameNo = 0;
  var lastBvKey = '';
