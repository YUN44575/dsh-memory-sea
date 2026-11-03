#!/usr/bin/env node
/**
 * mkdemo-fresh.mjs —— 从零造一份「纯净版」演示数据
 *
 * 和 mkdemo.mjs 的区别：
 *   - mkdemo.mjs 沿用真实数据的骨架（坐标/时间/会话结构），只换文字 → 星图长得像某个人自己的
 *   - 这个脚本**什么都不沿用**：会话、时间、坐标、岛全部现编，只保证前端要的字段齐全
 *
 * 用途：README / 截图 / 演示。跑出来的 out-demo/index.html 打开就是一份陌生人的示例记忆。
 *
 * 用法：node sea-build/mkdemo-fresh.mjs [--out <目录>]
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPaths } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const P = loadPaths();
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUTROOT = oi >= 0 ? args[oi + 1] : join(P.out, '..', 'out-demo');
mkdirSync(OUTROOT, { recursive: true });

const DAY = 86400000;
const NOW = Date.now();
const T1 = NOW;
const T0 = NOW - 31 * DAY;

const rnd = (() => { let s = 20261103; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();

// ---------------- 话题池 ----------------
const TOPICS = {
  project: {
    title: ['接口设计讨论', '排期与分工', '那个报错的原因', '上线前检查', '重构方案对比'],
    ws: '示例 · 项目', cwd: 'C:/demo/project',
    user: [
      '这个接口我想拆成两个，一个读取一个写入，你觉得呢？',
      '昨天那个报错复现了，只在第二次调用的时候出现。',
      '排期能不能往前提两天？我想留点时间做联调。',
      '这段逻辑能不能抽出来？三个地方都在用同一份。',
      '上线前把回滚方案也写一下，万一出问题好退。',
      '这个字段先不用动，等前端确认了再说。',
      '我看了下日志，卡在那个查询上，慢了三倍。',
      '先按最小改动来，跑通再优化。',
      '这两处的命名不一致，要不要统一一下？',
      '今天先到这儿，明天继续。',
      '导出的时候带上时间戳，方便对比。',
      '能不能加个开关，默认关掉？我怕影响现有逻辑。',
    ],
    assistant: [
      '拆成两个更清楚，读的接口可以加缓存，写的保持简单。',
      '复现了，问题在缓存的 key 少了一段，第二次读到了上一次的结果。',
      '排期可以提前，但联调那两天得留出来，否则改动会撞在一起。',
      '抽出来了，三处都换成同一个函数，行为没变，测试也过了。',
      '回滚方案写好了：先切流量，再回滚，最后补数据。',
      '这个字段先留着，前端确认完再决定要不要改名。',
      '慢在那个查询没走索引，加上之后从 800ms 降到 42ms。',
      '最小改动版本已经跑通，只动了两个文件。',
      '命名统一成了 kebab-case，历史的地方加了注释。',
      '今天的改动都提交了，明天从联调开始。',
      '导出的文件名里加了时间戳，格式是 年月日-时分。',
      '开关加好了，默认关闭，打开后才会走新逻辑。',
    ],
  },
  reading: {
    title: ['读书笔记 · 第一章', '读书笔记 · 第三章', '那本书读到一半', '摘抄与想法', '书里的一段话'],
    ws: '示例 · 读书', cwd: 'C:/demo/reading',
    user: [
      '这段我读了三遍还是不太懂，他到底想说什么？',
      '这本书前半部分有点闷，后面才开始好看。',
      '摘了一句话，我觉得说得特别准。',
      '你读过这本吗？想听听你怎么理解第三章。',
      '作者的论证好像有个漏洞，前面说的和后面矛盾了。',
      '这段可以对照上一本书看，观点正好相反。',
      '读到一半放下了，过几天再捡起来。',
      '这句话我抄在本子上了。',
      '他举的那个例子有点牵强。',
      '这本书的译笔不错，读起来很顺。',
      '我想把这几章整理成一篇笔记。',
      '今天只读了两页，心思不在。',
    ],
    assistant: [
      '他想说的是：结论不重要，重要的是推理过程站不站得住。',
      '前半部分是在铺背景，撑过第二章就好读了。',
      '那句是说，人对自己的判断往往比对事实的判断更有信心。',
      '第三章的核心是「习惯来自环境」，和前一章正好接上。',
      '那个矛盾其实是他故意的，第四章会解释为什么。',
      '两本书放在一起看很有意思：一个说要有目标，一个说别太执着目标。',
      '读到一半放下的书，通常过一周再捡起来会更顺。',
      '这句话可以单独拿出来看，不依赖上下文也成立。',
      '例子确实牵强，但论点本身没问题，换个例子会更好。',
      '译笔好的地方主要在长句处理上，没硬翻。',
      '整理成笔记时，建议按「论点—例子—我的想法」三段来写。',
      '两页也是读，不必勉强。',
    ],
  },
  daily: {
    title: ['周末的安排', '今天有点累', '晚上吃什么', '散步时想到的', '收拾房间'],
    ws: '示例 · 日常', cwd: 'C:/demo/daily',
    user: [
      '今天天气不错，想出去走走。',
      '晚上随便吃点吧，不太想做饭。',
      '收拾了一下午，扔掉好多东西。',
      '散步的时候突然想到一个事，回来就忘了。',
      '有点累，今天早点睡。',
      '外面下雨了，窗户没关。',
      '周末想去趟书店，好久没去了。',
      '刚煮了壶茶，坐下来歇会儿。',
      '整理旧照片，翻到几年前的。',
      '今天走了很多路，腿有点酸。',
      '把书架重新排了一遍，按颜色排的。',
      '睡前看会儿书吧。',
    ],
    assistant: [
      '出去走走吧，今天风不大。',
      '那煮点面？十分钟就好。',
      '扔东西最费神，但扔完确实轻松。',
      '这种想到的事，最好当场记下来，不然真的会忘。',
      '早点睡，明天再说。',
      '窗户关上吧，晚上要降温。',
      '书店周末人多，早点去比较好。',
      '喝点热的，歇一会儿。',
      '旧照片翻起来容易停不下来。',
      '走多了泡泡脚会好一些。',
      '按颜色排挺好看的，找起来要适应几天。',
      '睡前看书比看屏幕好。',
    ],
  },
};

// 短应答：真实对话里这类话一定会重复（「继续」「可以」「好」），
// 判重、批量清理这些功能才不是空摆设。
const SHORT = ['继续', '可以', '好', '嗯', '收到', '行', '这样就行', '没问题'];

// 普通句子后面接一个很短的尾缀：真实对话里每句话都不完全一样，
// 不加的话 1083 条会只剩 70 多种文本，判重率 93% 看着像产品坏了。
const TAIL = ['', '', ' 这次先这样。', ' 明天再看。', ' 我记一下。', ' 先放着。', ' 回头说。'];

// ---------------- 会话编排 ----------------
// 8 个工作海（project/reading 各 4）+ 4 个陪伴海（daily），共 12 个
// d0 = 距今几天开始（0 = 今天），span = 持续几天。最近几天要留够密度，
// 否则「近岸」（留存 R >= 0.5，约 4 天窗口）里几乎是空的，星图看着像坏了。
const PLAN = [
  { t: 'project', n: 134, d0: 0,  span: 2 },
  { t: 'project', n: 104, d0: 2,  span: 2 },
  { t: 'project', n: 123, d0: 5,  span: 3 },
  { t: 'project', n: 87,  d0: 11, span: 3 },
  { t: 'project', n: 71,  d0: 20, span: 3 },
  { t: 'reading', n: 109, d0: 0,  span: 2 },
  { t: 'reading', n: 92,  d0: 3,  span: 2 },
  { t: 'reading', n: 62,  d0: 9,  span: 3 },
  { t: 'reading', n: 55,  d0: 24, span: 3 },
  { t: 'daily',   n: 99,  d0: 1,  span: 2 },
  { t: 'daily',   n: 81,  d0: 6,  span: 3 },
  { t: 'daily',   n: 66,  d0: 16, span: 4 },
];

// 话题簇心：工作海在左（两簇），陪伴海在右（一团）
const CLUSTER = {
  project: { x: -0.42, y: 0.20, z: 0.00 },
  reading: { x: -0.18, y: -0.34, z: 0.06 },
  daily:   { x: 0.42, y: -0.02, z: 0.00 },
};

const islands = [];      // 每个会话一个岛，画面上才有「一团一团」的云气
const sessions = [];
const nodes = [];

let seq = 0;
PLAN.forEach((pl, si) => {
  const pool = TOPICS[pl.t];
  const born = NOW - (pl.d0 + pl.span) * DAY;
  const t0 = born + 60 * 60 * 1000;
  const t1 = born + pl.span * DAY;
  const title = pool.title[si % pool.title.length];
  const sid = si;
  const dm = pl.t === 'daily' ? 1 : 0;
  // 在所属簇心里按会话序号散开，每个会话一个小岛
  const cl = CLUSTER[pl.t];
  const ai = si * 1.7;
  const isl = islands.length;
  const island = {
    x: cl.x + Math.cos(ai) * 0.13,
    y: cl.y + Math.sin(ai) * 0.13,
    z: cl.z + (rnd() - 0.5) * 0.10,
    r: 0.11 + rnd() * 0.05,
    n: 0,
  };
  islands.push(island);

  const firstSeq = seq;
  for (let k = 0; k < pl.n; k++) {
    const isUser = k % 5 === 0 || k % 5 === 1;   // 约 40% 是「你说的话」
    const arr = isUser ? pool.user : pool.assistant;
    const isShort = (k > 0 && k % 12 === 0);
    const txt = isShort
      ? SHORT[k % SHORT.length]
      : arr[k % arr.length] + TAIL[(k * 7 + si * 3) % TAIL.length];
    // 时间：会话跨度内先密后疏（模拟聊得越来越少）
    const frac = Math.pow(k / pl.n, 0.85);
    const t = Math.round(t0 + (t1 - t0) * frac);
    const age = Math.max(0, NOW - t) / DAY;
    const tau = 6 + 14 * (0.3 + 0.7 * rnd());
    const R = Math.exp(-age / tau);

    // 坐标：岛内螺旋（按时间由内向外），加抖动
    const ang = k * 2.39996 + isl * 1.7;
    const rad = island.r * Math.sqrt((k + 1) / (pl.n + 2)) * 1.15;
    const jx = (rnd() - 0.5) * 0.02, jy = (rnd() - 0.5) * 0.02, jz = (rnd() - 0.5) * 0.03;

    nodes.push({
      i: nodes.length,
      id: 'demo-' + String(si).padStart(2, '0') + ':' + String(k + 1),
      k: 'text',
      s: isUser ? 'user' : 'assistant',
      sid,
      dm,
      dp: 0,
      dr: null,
      t,
      x: +(island.x + Math.cos(ang) * rad + jx).toFixed(5),
      y: +(island.y + Math.sin(ang) * rad * 0.82 + jy).toFixed(5),
      z: +(island.z + (rnd() - 0.5) * island.r * 0.5 + jz).toFixed(5),
      txt,
      rl: txt.length,
      kw: bigrams(txt),
      hu: null, th: null, ic: 0, ar: 0,
      imp: null, em: null, emo: 0, tg: null,
      w: 0,
      R: +R.toFixed(4),
    });
    island.n++;
  }
  seq = nodes.length;

  sessions.push({
    id: 'demo' + String(si).padStart(2, '0'),
    dm,
    why: dm ? 'byWorkspaceTitle' : 'default',
    ws: pool.ws,
    title,
    label: title,
    cwd: pool.cwd,
    count: pl.n,
    depth: 0,
    born,
    t0,
    t1,
    origin: '',
    preset: 'standard',
    pid: '',
    parent: -1,
  });
});

// 中文 bigram（和前端搜索一致：连续中文切成 2 字）
function bigrams(s) {
  const out = [];
  const re = /[\u4e00-\u9fa5]+/g;
  let m;
  while ((m = re.exec(s))) {
    const w = m[0];
    for (let i = 0; i + 1 < w.length; i++) out.push(w.slice(i, i + 2));
  }
  return [...new Set(out)].slice(0, 10);
}

// ---------------- 判重（和 layout.mjs 同口径：整段文本相同就算同一条）进 ----------------
{
  const key = new Map();
  for (const n of nodes) {
    const k = 't:' + String(n.txt || '').replace(/\s+/g, ' ').trim();
    if (key.has(k)) {
      const first = key.get(k);
      n.dp = 1;
      n.dr = first;
    } else {
      key.set(k, n.id);
    }
  }
}

// ---------------- 关系线：同会话相邻 + 跨会话同话题 ----------------
const edges = [];
for (let i = 1; i < nodes.length; i++) {
  if (nodes[i].sid === nodes[i - 1].sid) edges.push([i - 1, i, +(0.55 + rnd() * 0.2).toFixed(2)]);
}
// 每个会话的第 1 条，连到同话题上一个会话的第 1 条（跨会话的「同一件事」）
const firstOf = new Map();
for (const n of nodes) if (!firstOf.has(n.sid)) firstOf.set(n.sid, n.i);
const byTopic = new Map();
for (const sv of sessions) {
  const t = sv.ws;
  if (!byTopic.has(t)) byTopic.set(t, []);
  byTopic.get(t).push(sv.id);
}
for (const [, ids] of byTopic) {
  for (let i = 1; i < ids.length; i++) {
    const a = firstOf.get(sessions.findIndex(s => s.id === ids[i - 1]));
    const b = firstOf.get(sessions.findIndex(s => s.id === ids[i]));
    if (a != null && b != null) edges.push([a, b, 0.42]);
  }
}

// ---------------- 隐藏层 / 过程层（都是示例文本）----------------
const sys = [
  { kind: 'time-context', n: 386, samples: ['<time-context> 今天是 2026 年 11 月 03 日，星期二，下午三点二十。</time-context>'] },
  { kind: 'runtime-context', n: 184, samples: ['当前工作目录：C:\\demo\\project；系统：Windows；Node 版本 v24。'] },
  { kind: 'skill-catalog', n: 42, samples: ['可用技能清单：office / 前端设计 / 数据分析 …（示例）'] },
  { kind: 'user-approval', n: 15, samples: ['用户批准了一次文件写操作（示例）。'] },
  { kind: 'model-selection', n: 8, samples: ['已切换到示例模型。'] },
];
const proc = { think: 4210, tool: 3876 };

const SEA = {
  builtAt: NOW,
  t0: T0,
  t1: T1,
  nodes,
  sessions,
  islands,
  parked: [],
  sys,
  proc,
  tx: { n: 0, chars: 0 },
  edges,
};

writeFileSync(join(OUTROOT, 'data.js'), 'window.SEA=' + JSON.stringify(SEA) + ';', 'utf8');
writeFileSync(join(OUTROOT, 'texts.js'), 'window.SEA_TX={};', 'utf8');
writeFileSync(join(OUTROOT, 'hidden.js'), 'window.SEA_SYS=[];', 'utf8');
writeFileSync(join(OUTROOT, 'sc-data.js'), 'window.SC=null;', 'utf8');
writeFileSync(join(OUTROOT, 'bridge.js'), 'window.SEA_BRIDGE=[];', 'utf8');
writeFileSync(join(OUTROOT, 'version.js'), 'window.SEA_VER=0;', 'utf8');
writeFileSync(join(OUTROOT, 'zones.json'), JSON.stringify({ builtAt: NOW, zones: {} }), 'utf8');
copyFileSync(join(P.out, 'index.html'), join(OUTROOT, 'index.html'));
try { if (existsSync(join(P.out, 'thumbs'))) mkdirSync(join(OUTROOT, 'thumbs'), { recursive: true }); } catch {}

console.log('fresh demo written to', OUTROOT);
console.log('  nodes', nodes.length, '| sessions', sessions.length, '| islands', islands.length, '| edges', edges.length);
