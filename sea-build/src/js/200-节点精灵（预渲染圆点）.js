  // ================= 节点精灵（预渲染圆点） =================
  var sprites = {};
  function makeSprite(color, soft, solid) {
    var S = 96;
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    if (solid) {
      g.addColorStop(0, color);
      g.addColorStop(0.26, color);
      g.addColorStop(0.40, hexA(color, 0.55));
      g.addColorStop(0.62, hexA(color, 0.12));
      g.addColorStop(1, hexA(color, 0));
    } else {
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(soft ? 0.07 : 0.10, color);
      g.addColorStop(soft ? 0.15 : 0.20, hexA(color, soft ? 0.5 : 0.62));
      g.addColorStop(soft ? 0.30 : 0.36, hexA(color, 0.16));
      g.addColorStop(0.62, hexA(color, 0.035));
      g.addColorStop(1, hexA(color, 0));
    }
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return c;
  }
  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function hsl2hex(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    var to = function (v) { var x = Math.round(v * 255); return ('0' + x.toString(16)).slice(-2); };
    return '#' + to(f(0)) + to(f(8)) + to(f(4));
  }
  function emoSlot(n) {
    var e = n.emo == null ? 0 : n.emo;
    if (n.src_ === 'sc') {
      // SurfCore 的 emotional 是 1~8 的「浓度」，不是高兴/难受的正负 ——
      // 直接按 DSH 那套公式会全部顶到最后一格（一片金黄）。这里改成：淡 → 青，浓 → 暖金。
      var t = Math.min(1, Math.max(0, (e - 1) / 7));
      return Math.round(3 + t * 4);
    }
    return Math.max(0, Math.min(7, Math.round((e + 1) / 2 * 7)));
  }

  function buildSprites() {
    var solid = theme === 'shallow';
    var imgS = [], imgC = [];
    // 没有色彩指纹的图（大部分是截图/黑白图）走主题主色：
    // 深海是暖金，浅层是海蓝——不然浅色底上一片橙点会显得脏
    var plainS = makeSprite(TH.node.image, false, solid);
    var plainC = makeSprite(TH.cmp.image, false, solid);
    for (var i = 0; i < 12; i++) {
      // 浅层是白天：饱和度压低、亮度抬高，让每个点像水彩颜料落在纸上，不脏
      var col = theme === 'deep'
        ? hsl2hex(i * 30, 82, 66)
        : hsl2hex(i * 30, 42, 47);
      imgS.push(makeSprite(col, false, solid));
      // 陪伴海的图片：色相收窄到桃红区间（335°–25°），一眼能认出归属
      var ch = (335 + i * 4.2) % 360;
      var colc = theme === 'deep'
        ? hsl2hex(ch, 76, 70)
        : hsl2hex(ch, 46, 50);
      imgC.push(makeSprite(colc, false, solid));
    }
    // 情绪色：难受(紫 280°) → 平静(青 190°) → 高兴(暖金 45°)
    var emoS = [];
    for (var e = 0; e < 8; e++) {
      var eh = 280 - e * 33.6;
      emoS.push(makeSprite(theme === 'deep' ? hsl2hex(eh, 72, 68) : hsl2hex(eh, 56, 44), false, solid));
    }
    sprites = {
      image: imgS,
      imageC: imgC,
      plain: plainS,
      plainC: plainC,
      emo: emoS,
      text: makeSprite(TH.node.text, !solid, solid),
      textC: makeSprite(TH.cmp.text, !solid, solid),
      memory: makeSprite(TH.node.memory, false, solid),
      memoryC: makeSprite(TH.cmp.memory, false, solid),
      mistW: makeMist(theme === 'deep' ? '190,225,255' : '176,126,168'),
      mistC: makeMist(theme === 'deep' ? '255,175,205' : '222,140,158'),
      // 星云气：工作海青蓝，陪伴海桃红（总览里就能分辨两片海）
      gas: makeMist(theme === 'deep' ? '196,226,255' : '228,168,150'),
      gasC: makeMist(theme === 'deep' ? '255,182,214' : '255,168,200'),
      // 云气的冷暖杂色：全一色会像一团牛奶，掺一点紫、一点青才有星云的感觉
      gasV: makeMist(theme === 'deep' ? '186,178,255' : '182,142,208'),
      gasT: makeMist(theme === 'deep' ? '150,232,236' : '255,190,150'),
      // 情绪：三档温度（暖橙 / 暖粉 / 暗红）
      emoW: makeMist('255,176,124'),
      emoP: makeMist('255,126,150'),
      emoR: makeMist('255,96,90')
    };
  }

  // 一团很柔的雾，用来给每个记忆岛垫一层体量（像星云气体）
  function makeMist(rgb) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var x = cv.getContext('2d');
    var g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.00, 'rgba(' + rgb + ',0.55)');
    g.addColorStop(0.28, 'rgba(' + rgb + ',0.26)');
    g.addColorStop(0.58, 'rgba(' + rgb + ',0.08)');
    g.addColorStop(1.00, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    return cv;
  }
