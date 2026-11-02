// SurfCore 记忆 → 意识海的一片海
//   衰减记忆卡（memory-card.json）→ 真记忆，按"留存强度"分深层/浅层
//   全量记忆卡（memory-card-full.jsonl）里已经不在衰减卡的 → 极暗的"档案星尘"
// 产出 sea-build/out/sc-data.js（window.SC）+ out/sc-version.js（缓存刷新用）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { loadPaths } from './paths.mjs';
const P = loadPaths();
const ROOT = P.surfcore;
const OUTDIR = P.out;

// ---------- 0. 没装 SurfCore 就直接退出（别人的 DSH 不一定有这一片海）----------
if (!existsSync(ROOT)) {
  console.log('跳过：没有 surfcore 目录（' + ROOT + '），这片海不生成');
  process.exit(0);
}

// ---------- 1. 找当前角色 ----------
const cur = JSON.parse(readFileSync(ROOT + '/characters/current.json', 'utf8'));
const CHARDIR = cur.dir.replace(/\\/g, '/');
const MEM = CHARDIR + '/memory';

const cardPath = MEM + '/memory-card.json';
const fullPath = MEM + '/memory-card-full.jsonl';
if (!existsSync(cardPath)) { console.error('找不到 ' + cardPath); process.exit(1); }

const card = JSON.parse(readFileSync(cardPath, 'utf8'));
const decayed = card.records || [];

const full = [];
if (existsSync(fullPath)) {
  for (const line of readFileSync(fullPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { full.push(JSON.parse(t)); } catch (e) { /* 坏行跳过 */ }
  }
}
// 全量卡是 append-only：同 id 可能有多版，最后一行最新
const fullLatest = new Map();
for (const r of full) if (r && r.id) fullLatest.set(r.id, r);
const decayedIds = new Set(decayed.map(r => r.id));
const ghosts = [...fullLatest.values()].filter(r => !decayedIds.has(r.id));

console.log('角色', cur.name || cur.id);
console.log('衰减卡', decayed.length, '条 / 全量卡', fullLatest.size, '条 / 已消失(档案)', ghosts.length, '条');

// ---------- 2. 时间与强度 ----------
const now = Date.now();
const pn = (s, d) => { const t = Date.parse(s); return Number.isFinite(t) ? t : d; };
const dayOf = (t) => Math.max(0, (now - t) / 86400000);

// 「长期记住」的硬条件：置顶 / 初次相遇 / 约定 / 重要度达到永不遗忘线
const OWNER_LINE = 65;
function isLongTerm(r) {
  if (r.pinned || r.isInitial || r.firstMet) return true;
  if (r.kind === 'promise') return true;
  if ((r.importance || 0) >= OWNER_LINE && (r.source || '').indexOf('owner') >= 0) return true;
  return false;
}

// 分成两组，前端按 k 走两套留存曲线（memory=不衰减，text=艾宾浩斯）
function nodeOf(r, ghost) {
  const t = pn(r.createdAt, now);
  const imp = Math.max(0, Math.min(100, r.importance || 0));
  const longTerm = !ghost && isLongTerm(r);
  const title = (r.title || '').trim();
  let body = (r.text || '').trim();
  const reply = (r.botReply || '').trim();
  if (reply) body += '\n\n她回：' + reply;
  const txt = (title ? title + '\n\n' : '') + body;
  return {
    id: r.id,
    ghost: ghost ? 1 : 0,
    k: longTerm ? 'memory' : (ghost ? 'ghost' : 'text'),
    longTerm: longTerm ? 1 : 0,
    s: srcToSpeaker(r.source, ghost),
    src: srcGroup(r),
    plat: r.platform || '',
    kind: r.kind || '',
    t: t,
    imp: +(imp / 100).toFixed(3),   // 前端统一用 0~1（DSH 那边也是）
    impRaw: imp,
    clarity: r.clarity || '',
    pinned: r.pinned ? 1 : 0,
    initial: (r.isInitial || r.firstMet) ? 1 : 0,
    recall: r.recallCount || 0,
    emo: r.emotional || 0,
    seen: pn(r.lastSeenAt, t),                    // 最后一次被提到：复习效应靠它
    owner: ((r.tags || []).indexOf('owner') >= 0 && imp >= OWNER_LINE) ? 1 : 0,
    title: title,
    txt: txt,
    tags: (r.tags || []).slice(0, 8),
    kw: keywords(title + ' ' + body),
    days: +dayOf(t).toFixed(1)
  };
}

function srcToSpeaker(source, ghost) {
  if (ghost) return 'archive';
  const s = source || '';
  if (s.indexOf('self') >= 0) return 'assistant';
  if (s.indexOf('bili') >= 0) return 'assistant';
  return 'user';
}

function srcGroup(r) {
  const s = r.source || '';
  if (s === 'manual') return 'manual';
  if (s.indexOf('bili') >= 0) return 'bili';
  if (s.indexOf('self') >= 0) return 'self';
  if (s.indexOf('owner') >= 0) return 'owner';
  return 'other';
}

// ---------- 3. 关键词（给搜索/标签用）----------
const STOP = new Set(('的了是我你他她它在有和就不人都一上也很到说要去看好这那什么怎么可以这个那个但是因为所以如果然后还吧吗呢啊呀哦嗯请帮我们你们他们现在时候问题一下需要应该觉得知道没有自己会着过把被给让对从向以于为与之其此那些个们来去干什么样么呢吧哈嗯啊哦唉呀').split(''));
function tokenize(s) {
  const out = [];
  const t = String(s || '').toLowerCase();
  for (const m of t.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = m[0];
    if (run.length === 1) { if (!STOP.has(run)) out.push(run); continue; }
    for (let i = 0; i + 1 < run.length; i++) {
      const bg = run.slice(i, i + 2);
      if (STOP.has(bg[0]) && STOP.has(bg[1])) continue;
      out.push(bg);
    }
  }
  for (const m of t.matchAll(/[a-z0-9_][a-z0-9_.\-]{1,}/g)) if (m[0].length > 2) out.push(m[0]);
  return out;
}
function keywords(text) {
  const tf = new Map();
  for (const w of tokenize(text)) tf.set(w, (tf.get(w) || 0) + 1);
  return [...tf.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(x => x[0]);
}

// ---------- 4. 建节点 ----------
const realNodes = decayed.map(r => nodeOf(r, false));
const ghostNodes = ghosts.map(r => nodeOf(r, true));
const nodes = realNodes.concat(ghostNodes);
const N = nodes.length;
const M = realNodes.length;
console.log('节点', N, '（真记忆', M, '+ 档案星尘', ghostNodes.length, '）');

// ---------- 5. 语义布局：TF-IDF → kmeans → 簇心按时间排 + 簇内时间螺旋 ----------
const df = new Map();
const tfs = [];
for (const n of nodes) {
  const tf = new Map();
  for (const w of tokenize(n.txt + ' ' + n.tags.join(' '))) tf.set(w, (tf.get(w) || 0) + 1);
  tfs.push(tf);
  for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
}
const vocab = [...df.keys()].filter(w => df.get(w) >= 2 && df.get(w) < N * 0.6);
const vidx = new Map(vocab.map((w, i) => [w, i]));
const V = vocab.length;
const idf = new Float64Array(V);
for (let i = 0; i < V; i++) idf[i] = Math.log(1 + N / df.get(vocab[i]));
const vecs = [];   // 稀疏向量
for (let i = 0; i < N; i++) {
  const v = [];
  for (const [w, c] of tfs[i]) {
    const j = vidx.get(w);
    if (j === undefined) continue;
    v.push([j, (1 + Math.log(c)) * idf[j]]);
  }
  let s = 0;
  for (const [, x] of v) s += x * x;
  s = Math.sqrt(s) || 1;
  for (const p of v) p[1] /= s;
  vecs.push(v);
}
const cos = (a, b) => {
  let i = 0, j = 0, s = 0;
  while (i < a.length && j < b.length) {
    if (a[i][0] === b[j][0]) { s += a[i][1] * b[j][1]; i++; j++; }
    else if (a[i][0] < b[j][0]) i++; else j++;
  }
  return s;
};

// kmeans++（只对真记忆分簇，档案星尘最后单独放到外围）
const K = Math.max(6, Math.min(14, Math.round(Math.sqrt(M) / 1.6)));
const seed = 20261101;
let rs = seed;
const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
let cents = [vecs[Math.floor(rnd() * M)]];
const centOf = (arr) => {   // 稀疏向量求和归一化
  const m = new Map();
  for (const v of arr) for (const [j, x] of v) m.set(j, (m.get(j) || 0) + x);
  const out = [...m.entries()].sort((a, b) => a[0] - b[0]);
  let s = 0; for (const [, x] of out) s += x * x; s = Math.sqrt(s) || 1;
  return out.map(([j, x]) => [j, x / s]);
};
while (cents.length < K) {
  const d2 = [];
  let sum = 0;
  for (let i = 0; i < M; i++) {
    let best = 0;
    for (const c of cents) { const s = cos(vecs[i], c); if (s > best) best = s; }
    const d = Math.pow(1 - best, 2);
    d2.push(d); sum += d;
  }
  if (sum <= 0) break;
  let r = rnd() * sum, pick = 0;
  for (let i = 0; i < M; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
  cents.push(vecs[pick]);
}
let assign = new Int32Array(M).fill(-1);
for (let it = 0; it < 18; it++) {
  let moved = 0;
  for (let i = 0; i < M; i++) {
    let bi = 0, bs = -2;
    for (let c = 0; c < cents.length; c++) { const s = cos(vecs[i], cents[c]); if (s > bs) { bs = s; bi = c; } }
    if (assign[i] !== bi) { assign[i] = bi; moved++; }
  }
  const groups = cents.map(() => []);
  for (let i = 0; i < M; i++) groups[assign[i]].push(vecs[i]);
  cents = groups.map((g, c) => g.length ? centOf(g) : cents[c]);
  if (!moved) break;
}

// 每个簇的时间中位数 → 簇心沿时间螺旋铺开
const cl = [];
for (let c = 0; c < cents.length; c++) {
  const idxs = [];
  for (let i = 0; i < M; i++) if (assign[i] === c) idxs.push(i);
  if (idxs.length < 2) continue;      // 太小的簇并掉
  const ts = idxs.map(i => nodes[i].t).sort((a, b) => a - b);
  cl.push({ c, idxs, tm: ts[Math.floor(ts.length / 2)], n: idxs.length });
}
cl.sort((a, b) => a.tm - b.tm);

// 簇心：时间越晚越靠外（像海一圈圈积起来），角度按序错开
const R0 = 0.40, R1 = 0.92;
for (let k = 0; k < cl.length; k++) {
  const f = cl.length === 1 ? 0.5 : k / (cl.length - 1);
  const ang = f * Math.PI * 2 * 0.86 + 0.5;
  const rad = R0 + (R1 - R0) * Math.pow(f, 0.82);
  cl[k].cx = Math.cos(ang) * rad;
  cl[k].cy = Math.sin(ang) * rad * 0.86;
  cl[k].rad = 0.075 + 0.085 * Math.sqrt(cl[k].n / 8);
}

// 簇内：按时间做小螺旋（同一簇里越新的越靠外缘）
for (const c of cl) {
  c.idxs.sort((a, b) => nodes[a].t - nodes[b].t);
  const m = c.idxs.length;
  for (let j = 0; j < m; j++) {
    const f = m === 1 ? 0 : j / (m - 1);
    const ang = f * Math.PI * 2 * 0.42 + c.cx * 3.1 + c.cy * 2.7;
    const rad = c.rad * (0.28 + 0.72 * Math.pow(f, 0.62));
    const i = c.idxs[j];
    nodes[i].x = c.cx + Math.cos(ang) * rad;
    nodes[i].y = c.cy + Math.sin(ang) * rad * 0.90;
  }
}
// 档案星尘：海的外围一圈，分两圈错开
for (let g = 0; g < ghostNodes.length; g++) {
  const i = M + g;
  const ang = g * 2.399963 + 0.9;
  const rad = 1.02 + 0.16 * ((g % 3) / 2);
  nodes[i].x = Math.cos(ang) * rad;
  nodes[i].y = Math.sin(ang) * rad * 0.88;
}

// 归一化到单位圆（按 99 分位半径，别让一两个离群点把海压小）
const rs2 = nodes.map(n => Math.hypot(n.x, n.y)).sort((a, b) => a - b);
const p99 = rs2[Math.floor(rs2.length * 0.995)] || 1;
const sc = 1 / Math.max(0.001, p99);
for (const n of nodes) { n.x *= sc; n.y *= sc; n.z = (Math.sin(n.x * 91.7 + n.y * 37.3) * 0.5) * 0.55; }
let cxs = 0, cys = 0;
for (const n of nodes) { cxs += n.x; cys += n.y; }
cxs /= N; cys /= N;
for (const n of nodes) { n.x -= cxs; n.y -= cys; }

// ---------- 6. 记忆来源 = 「会话」列表 ----------
const GROUPS = {
  owner: { label: '和主人（QQ 私聊）', why: '主人私聊' },
  self: { label: '她自己说的话', why: '她主动说的' },
  bili: { label: 'B站那边', why: 'B站动态/视频' },
  manual: { label: '手动记下的', why: '管理员手记' },
  other: { label: '其他来源', why: '' },
  archive: { label: '档案里还在的', why: '全量卡里有、衰减卡已忘' }
};
const gmap = new Map();
const sidOf = new Map();
for (const n of nodes) {
  const g = n.ghost ? 'archive' : n.src;
  if (!gmap.has(g)) gmap.set(g, []);
  gmap.get(g).push(n);
}
const sessions = [];
for (const [g, arr] of gmap) {
  const sid = sessions.length;
  sidOf.set(g, sid);
  const ts = arr.map(n => n.t).sort((a, b) => a - b);
  sessions.push({
    id: g,
    title: GROUPS[g].label,
    label: GROUPS[g].label,
    cwd: '',
    ws: GROUPS[g].label,
    why: GROUPS[g].why,
    count: arr.length,
    depth: 0,
    born: ts[0],
    t0: ts[0],
    t1: ts[ts.length - 1],
    dm: g === 'archive' ? 0 : 1
  });
}
for (const n of nodes) {
  n.sid = sidOf.get(n.ghost ? 'archive' : n.src);
  n.dm = n.ghost ? 0 : 1;
  n.dp = n.ghost ? 1 : 0;
}
// 给前端补齐 i 字段
nodes.forEach((n, i) => { n.i = i; });

// ---------- 7. 岛：簇即岛（雾和骨架按它画） ----------
const islands = cl.map((c, k) => ({
  x: c.cx * sc - cxs, y: c.cy * sc - cys, r: c.rad * sc * 1.15, z: 1, n: c.n
}));

// ---------- 8. 星座边：同簇内近邻 ----------
const edges = [];
for (const c of cl) {
  const arr = c.idxs.slice();
  for (let a = 0; a < arr.length; a++) {
    const cand = [];
    for (let b = 0; b < arr.length; b++) {
      if (b === a) continue;
      const A = nodes[arr[a]], B = nodes[arr[b]];
      const d = Math.hypot(A.x - B.x, A.y - B.y);
      cand.push([d, arr[b]]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    for (let k = 0; k < Math.min(2, cand.length); k++) {
      const j = cand[k][1];
      const key = arr[a] < j ? arr[a] + ':' + j : j + ':' + arr[a];
      if (!edges.some(e => (e[0] + ':' + e[1]) === key)) edges.push([Math.min(arr[a], j), Math.max(arr[a], j)]);
    }
  }
}

// ---------- 9. 写文件 ----------
const t0 = Math.min(...nodes.map(n => n.t));
const t1 = Math.max(...nodes.map(n => n.t));
const payload = {
  builtAt: Date.now(),
  charId: cur.id,
  charName: cur.name || '',
  t0, t1,
  nodes, sessions, islands, edges,
  counts: {
    all: nodes.length,
    real: M,
    ghost: ghostNodes.length,
    longTerm: nodes.filter(n => n.longTerm).length,
    bySrc: Object.fromEntries([...gmap].map(([g, a]) => [g, a.length]))
  }
};
writeFileSync(OUTDIR + '/sc-data.js',
  '// SurfCore 记忆海（自动生成，别手改）\nwindow.SC = ' + JSON.stringify(payload) + ';\n', 'utf8');
writeFileSync(OUTDIR + '/sc-version.js', 'window.SC_VERSION=' + Date.now() + ';\n', 'utf8');

console.log('长记忆', payload.counts.longTerm, '/ 普通', M - payload.counts.longTerm, '/ 档案', ghostNodes.length);
console.log('sessions', sessions.map(s => s.label + ':' + s.count).join(' | '));
console.log('islands', islands.length, 'edges', edges.length);
console.log('写好了 out/sc-data.js', (JSON.stringify(payload).length / 1024).toFixed(0) + ' KB');
