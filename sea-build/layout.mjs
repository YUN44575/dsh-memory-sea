// 语义坐标：中文 bigram TF-IDF → kNN 图 → 力导向布局
// 输出 sea-build/out/data.js （内联数据，file:// 双击可跑）
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

import { join } from 'node:path';
import { loadPaths } from './paths.mjs';
const P = loadPaths();
const IN = P.nodes;
const THUMBS = join(P.out, 'thumbs');
const OUT = join(P.out, 'data.js');

const STOP = new Set(('的了是我你他她它在有和就不人都一上也很到说要去看好这那什么怎么可以这个那个但是因为所以如果然后还吧吗呢啊呀哦嗯请帮我们你们他们现在时候问题一下需要应该觉得知道没有自己会着过把被给让对从向以于为与之其此那些个们来去干什么样么呢吧哈嗯啊哦唉呀').split(''));

function tokenize(s) {
  const terms = [];
  const t = String(s || '').toLowerCase();
  // 中文片段 → bigram（单字片段保留 unigram）
  for (const m of t.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = m[0];
    if (run.length === 1) { if (!STOP.has(run)) terms.push(run); continue; }
    for (let i = 0; i + 1 < run.length; i++) {
      const bg = run.slice(i, i + 2);
      if (STOP.has(bg[0]) && STOP.has(bg[1])) continue;
      terms.push(bg);
    }
  }
  // 拉丁词 / 数字 / 路径片段
  for (const m of t.matchAll(/[a-z0-9_][a-z0-9_.\-]{1,}/g)) {
    if (m[0].length > 1) terms.push(m[0]);
  }
  return terms;
}

const { nodes, sessions: rawSess, sys: rawSys, proc: rawProc } = JSON.parse(readFileSync(IN, 'utf8'));
const N = nodes.length;
// 会话元数据（含空壳会话）：完整的 parentSession / origin / agentPreset 都在这里，
// 不再靠"同目录 + 时间就近"去猜谁是谁的子会话
const sessMeta = new Map((rawSess || []).map((s) => [s.id, s]));
console.log('nodes', N, '| sessions(含空壳)', (rawSess || []).length);

// ---- 1. 每节点自身词频 ----
const ownTf = new Array(N);
for (let i = 0; i < N; i++) {
  const n = nodes[i];
  const raw = [n.text || '', n.title || '', (n.tags || []).join(' ')].join(' ');
  const tf = new Map();
  for (const tk of tokenize(raw)) tf.set(tk, (tf.get(tk) || 0) + 1);
  ownTf[i] = tf;
}

// ---- 1b. 会话时间邻域：把前后两条的语义混进来，让图文靠在一起 ----
// （纯图片消息只有文件名，靠这个才能"贴在它当时的对话旁边"）
const bySid = new Map();
for (let i = 0; i < N; i++) {
  const sid = nodes[i].sid;
  if (!bySid.has(sid)) bySid.set(sid, []);
  bySid.get(sid).push(i);
}
const CTX_W = 0.30;
const docs = new Array(N);
for (let i = 0; i < N; i++) docs[i] = new Map(ownTf[i]);
for (const [, idxs] of bySid) {
  for (let p = 0; p < idxs.length; p++) {
    const i = idxs[p];
    const neigh = [];
    if (p > 0) neigh.push(idxs[p - 1]);
    if (p > 1) neigh.push(idxs[p - 2]);
    if (p + 1 < idxs.length) neigh.push(idxs[p + 1]);
    if (p + 2 < idxs.length) neigh.push(idxs[p + 2]);
    if (!neigh.length) continue;
    const acc = new Map();
    for (const j of neigh) for (const [tk, f] of ownTf[j]) acc.set(tk, (acc.get(tk) || 0) + f);
    for (const [tk, f] of acc) {
      docs[i].set(tk, (docs[i].get(tk) || 0) + (f / neigh.length) * CTX_W);
    }
  }
}

// ---- 1c. 文档频率 ----
const dfs = new Map();
for (let i = 0; i < N; i++) for (const tk of docs[i].keys()) dfs.set(tk, (dfs.get(tk) || 0) + 1);
const N_DOCS = N;
// ---- 2. TF-IDF 向量（归一化）----
const vecs = new Array(N);
const postings = new Map();
for (let i = 0; i < N; i++) {
  const tf = docs[i];
  const v = new Map();
  let norm = 0;
  for (const [tk, f] of tf) {
    const df = dfs.get(tk) || 1;
    if (df < 2) continue;                    // 只出现一次的词没区分力
    const w = (1 + Math.log(f)) * Math.log(N_DOCS / df);
    if (w <= 0) continue;
    v.set(tk, w);
    norm += w * w;
  }
  if (norm > 0) {
    norm = Math.sqrt(norm);
    for (const [tk, w] of v) v.set(tk, w / norm);
  }
  vecs[i] = v;
  for (const tk of v.keys()) {
    let arr = postings.get(tk);
    if (!arr) postings.set(tk, arr = []);
    arr.push(i);
  }
}
let totalTerms = 0; for (const v of vecs) totalTerms += v.size;
console.log('avg terms/doc', (totalTerms / N).toFixed(0), '| vocab', dfs.size);

// ---- 3. kNN（倒排累加余弦，跳过超高频词）----
const K = 6;
const edges = [];
const scoreCap = new Map();
for (let i = 0; i < N; i++) {
  const v = vecs[i];
  if (v.size === 0) continue;
  const acc = new Map();
  for (const [tk, w] of v) {
    const arr = postings.get(tk);
    if (!arr || arr.length > N * 0.25) continue;   // 太泛的词不参与检索
    for (const j of arr) {
      if (j === i) continue;
      acc.set(j, (acc.get(j) || 0) + w * (vecs[j].get(tk) || 0));
    }
  }
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, K);
  for (const [j, s] of top) {
    if (s <= 0.02) continue;
    edges.push([i, j, s]);
  }
}
console.log('knn edges', edges.length);
const adj = Array.from({ length: N }, () => []);
for (const [i, j, s] of edges) { adj[i].push([j, s]); adj[j].push([i, s]); }

// ---- 4. t-SNE 降维（力导向会塌陷成均匀圆盘，t-SNE 才能真正分出语义簇）----
const sessionIds = [...new Set(nodes.map((n) => n.sid))];
const sessIdx = new Map(sessionIds.map((s, i) => [s, i]));
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
let seed = 20261031;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// 4a. 随机投影到 64 维（确定性，可复现）
const DIM = 64;
const proj = new Float64Array(N * DIM);
for (let i = 0; i < N; i++) {
  const base = i * DIM;
  for (const [tk, w] of vecs[i]) {
    let h = hashStr(tk);
    for (let d = 0; d < DIM; d++) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      proj[base + d] += (h & 1) ? w : -w;
    }
  }
}
// 4a-2. 混入图片内容指纹（dHash）：让画风/题材相近的图聚成一团
const HASHP = join(P.out, 'hashes.json');
const hashes = existsSync(HASHP) ? JSON.parse(readFileSync(HASHP, 'utf8')) : {};
const HEX = '0123456789abcdef';
const W_VIS = 0.42;
let visCount = 0;
for (let i = 0; i < N; i++) {
  const imgs = nodes[i].imgs || [];
  if (!imgs.length) continue;
  const rec = hashes[imgs[0].sha];
  if (!rec || !rec[0] || rec[0].length !== 16) continue;
  const hex = rec[0];
  const base = i * DIM;
  const vis = new Float64Array(DIM);
  for (let k = 0; k < 16; k++) {
    const v = HEX.indexOf(hex[k]);
    if (v < 0) continue;
    for (let b = 0; b < 4; b++) vis[k * 4 + b] = (v >> (3 - b)) & 1 ? 1 : -1;
  }
  for (let d = 0; d < DIM; d++) proj[base + d] = proj[base + d] * (1 - W_VIS) + W_VIS * (vis[d] / 8);
  visCount++;
}
console.log('projected', DIM, 'dims |', visCount, 'with visual hash');

// 4a-3. 域划分：工作海 / 陪伴海。分离不靠投影偏移（那会把域内距离稀释掉、
// 让小域坍缩成细线），而是两片海各自独立跑一次 t-SNE，最后按半径拼到一起。
//
// 归属不再写死会话序号（序号会因为新会话插入而漂移，之前就是这样把「鲸鲸的家」
// 「你好问候」这些真陪伴全划进工作海的）。现在的判定写在 sea-build/domains.json：
//   overrides（点名） > byWorkspaceTitle（DSH 里自建的工作区） > byCwdContains（路径兜底）
const DOMAINS = JSON.parse(readFileSync(new URL('./domains.json', import.meta.url), 'utf8'));
const seaOfSid = new Map();   // 完整 sid → { sea: 'companion'|'work', why: '...' }
const wsTitleOf = new Map();  // 完整 sid → DSH 里自建的工作区标题（列表按它分组）
{
  // (1) 按 DSH 工作区成员精确匹配（不看目录，避免把同目录里插件自动建的会话捎带进去）
  // workspace.json 在 <DSH>/storages/ 下；domains.json 里不再写死绝对路径
  const wsFile = DOMAINS.workspaceFile || join(P.dsh, 'storages', 'workspace.json');
  if (wsFile && existsSync(wsFile)) {
    try {
      const ws = JSON.parse(readFileSync(wsFile, 'utf8'));
      const table = ws?.tables?.workspaces || {};
      for (const w of Object.values(table)) {
        for (const sid of (w.sessionIds || [])) wsTitleOf.set(sid, w.title || '');
      }
    } catch (e) { console.log('!! 读不到 workspace.json：', e.message); }
  }
  for (const sid of sessionIds) {
    let sea = null, why = '';
    // (2) 点名（key 支持三种写法：完整 sid / 短 id / 短 id@标题片段
    //     —— 短 id 会撞车，比如两段 bili-whale 的开头都是 bili-wha，就要用 @ 标题片段区分）
    const ovShort = sid.replace(/^session-/, '').slice(0, 8);
    let ov = DOMAINS.overrides?.[sid] || DOMAINS.overrides?.[ovShort];
    if (!ov) {
      const ttl = (nodes.find((n) => n.sid === sid && n.title)?.title) || '';
      for (const [k, v] of Object.entries(DOMAINS.overrides || {})) {
        const at = k.indexOf('@');
        if (at > 0 && k.slice(0, at) === ovShort && ttl.includes(k.slice(at + 1))) { ov = v; break; }
      }
    }
    if (ov === 'companion' || ov === 'work') { sea = ov; why = 'overrides'; }
    // (3) 工作区标题
    if (!sea) {
      const t = wsTitleOf.get(sid);
      const mapped = t ? DOMAINS.byWorkspaceTitle?.[t] : null;
      if (mapped === 'companion' || mapped === 'work') { sea = mapped; why = '工作区「' + t + '」'; }
    }
    // (3.5) 标题前缀（人设注入开场的会话：［身份］/［统一人设卡/【当前时间】）
    if (!sea) {
      const ttl0 = (nodes.find((n) => n.sid === sid && n.title)?.title) || '';
      for (const r of (DOMAINS.byTitlePrefix || [])) {
        if (ttl0.startsWith(r.prefix)) { sea = r.sea; why = r.why || ('标题 ~ ' + r.prefix); break; }
      }
    }
    // (4) cwd 兜底
    if (!sea) {
      const cwd = (nodes.find((n) => n.sid === sid)?.cwd) || '';
      for (const r of (DOMAINS.byCwdContains || [])) {
        if (cwd.includes(r.contains)) { sea = r.sea; why = 'cwd ~ ' + (r.why || r.contains); break; }
      }
    }
    if (!sea) { sea = DOMAINS.default === 'companion' ? 'companion' : 'work'; why = 'default'; }
    seaOfSid.set(sid, { sea, why });
  }
  // 每个会话一行判定，方便核对
  const cmpList = [];
  for (const sid of sessionIds) {
    const rec = seaOfSid.get(sid);
    const ns = nodes.filter((n) => n.sid === sid);
    const line = (rec.sea === 'companion' ? '陪伴 ' : '工作 ') + String(ns.length).padStart(4) + '颗  '
      + ((ns.find((n) => n.title)?.title || '').slice(0, 24)).padEnd(24) + ' ← ' + rec.why;
    if (rec.sea === 'companion') cmpList.push(line);
    console.log('  ', line);
  }
  console.log('陪伴海会话', cmpList.length, '/', sessionIds.length);
}
let compCount = 0;
for (let i = 0; i < N; i++) {
  const isComp = seaOfSid.get(nodes[i].sid)?.sea === 'companion';
  nodes[i].domain = isComp ? 1 : 0;
  if (isComp) compCount++;
}
console.log('domains: work', N - compCount, '| companion', compCount);

// 4a-4. 去重：同一张图被反复发送、或整段相同的模板消息（人设卡 / 【我的时间】心跳），
// 在向量空间里完全重合 -> 变成强吸引核，把周围的点拉成一圈细弧。
// 处理办法：重复节点不参与降维，最后继承代表点坐标 + 一点抖动。
const DUP = new Int32Array(N).fill(-1);
const seenKey = new Map();
for (let i = 0; i < N; i++) {
  const n = nodes[i];
  let key;
  if (n.kind === 'image' && n.imgs && n.imgs[0]) key = 'i:' + n.imgs[0].sha;
  // 整段比对，不再只看前 24 字：agent-message 全都有 "Team message from lead: " 这个前缀，
  // 截前 24 字会把 16 条完全不同的协作消息判成同一条（实测踩过）。
  else key = 't:' + (n.text || '').replace(/\s+/g, ' ').trim();
  if (key === 't:' || key === 'i:') continue;
  const prev = seenKey.get(key);
  if (prev == null) seenKey.set(key, i);
  else DUP[i] = prev;
}
let dupCount = 0;
for (let i = 0; i < N; i++) if (DUP[i] >= 0) dupCount++;
console.log('duplicates merged:', dupCount, '| unique nodes:', N - dupCount);

// ---- 4b. PCA 初始化：t-SNE 从随机小值起步时极易把稀疏文本拉成一条条细丝（filament），
// 用前两个主成分铺底能显著抑制「满屏平行斜线」。
function pcaInit(m, getVec) {
  const mean = new Float64Array(DIM);
  for (let a = 0; a < m; a++) { const v = getVec(a); for (let d = 0; d < DIM; d++) mean[d] += v[d]; }
  for (let d = 0; d < DIM; d++) mean[d] /= m;
  const pc = [];
  for (let t = 0; t < 2; t++) {
    const v = new Float64Array(DIM);
    for (let d = 0; d < DIM; d++) v[d] = (hashStr('p' + t + '_' + d) % 1000) / 500 - 1;
    for (let it = 0; it < 26; it++) {
      const nv = new Float64Array(DIM);
      for (let a = 0; a < m; a++) {
        const x = getVec(a);
        let s = 0;
        for (let d = 0; d < DIM; d++) s += (x[d] - mean[d]) * v[d];
        for (let d = 0; d < DIM; d++) nv[d] += s * (x[d] - mean[d]);
      }
      for (const q of pc) {
        let dp = 0;
        for (let d = 0; d < DIM; d++) dp += nv[d] * q[d];
        for (let d = 0; d < DIM; d++) nv[d] -= dp * q[d];
      }
      let nn = 0;
      for (let d = 0; d < DIM; d++) nn += nv[d] * nv[d];
      nn = Math.sqrt(nn) || 1;
      for (let d = 0; d < DIM; d++) v[d] = nv[d] / nn;
    }
    pc.push(v);
  }
  const X = new Float64Array(m), Y = new Float64Array(m);
  for (let a = 0; a < m; a++) {
    const x = getVec(a);
    let u = 0, w = 0;
    for (let d = 0; d < DIM; d++) { const c = x[d] - mean[d]; u += c * pc[0][d]; w += c * pc[1][d]; }
    X[a] = u; Y[a] = w;
  }
  let mx = 0, my = 0;
  for (let a = 0; a < m; a++) { mx += X[a]; my += Y[a]; }
  mx /= m; my /= m;
  let sx = 0, sy = 0;
  for (let a = 0; a < m; a++) { sx += (X[a] - mx) ** 2; sy += (Y[a] - my) ** 2; }
  sx = Math.sqrt(sx / m) || 1; sy = Math.sqrt(sy / m) || 1;
  for (let a = 0; a < m; a++) { X[a] = (X[a] - mx) / sx * 1e-4; Y[a] = (Y[a] - my) / sy * 1e-4; }
  return { X, Y };
}

// ---- 4c. 单域 t-SNE（两片海各跑一次，避免大域吞掉小域的结构）----
function runTsne(fullIdx, label) {
  const m = fullIdx.length;
  const D2 = new Float32Array(m * m);
  for (let a = 0; a < m; a++) {
    const bi = fullIdx[a] * DIM;
    for (let b = a + 1; b < m; b++) {
      const bj = fullIdx[b] * DIM;
      let s = 0;
      for (let d = 0; d < DIM; d++) { const t = proj[bi + d] - proj[bj + d]; s += t * t; }
      D2[a * m + b] = s; D2[b * m + a] = s;
    }
  }
  const PERP = Math.min(48, Math.max(8, Math.floor((m - 1) / 3)));
  const LOG_U = Math.log(PERP);
  const P = new Float32Array(m * m);
  for (let a = 0; a < m; a++) {
    const base = a * m;
    let beta = 1 / DIM, lo = -Infinity, hi = Infinity, sumP = 1;
    for (let trial = 0; trial < 60; trial++) {
      sumP = 0; let sumD2P = 0;
      for (let b = 0; b < m; b++) {
        if (b === a) continue;
        const p = Math.exp(-D2[base + b] * beta);
        sumP += p; sumD2P += D2[base + b] * p;
      }
      const H = Math.log(sumP) + beta * sumD2P / sumP;
      const diff = H - LOG_U;
      if (Math.abs(diff) < 1e-5) break;
      if (diff > 0) { lo = beta; beta = hi === Infinity ? beta * 2 : (beta + hi) / 2; }
      else { hi = beta; beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2; }
    }
    for (let b = 0; b < m; b++) P[base + b] = b === a ? 0 : Math.exp(-D2[base + b] * beta) / sumP;
  }
  for (let a = 0; a < m; a++) {
    for (let b = a + 1; b < m; b++) {
      const v = Math.max(1e-12, (P[a * m + b] + P[b * m + a]) / (2 * m));
      P[a * m + b] = v; P[b * m + a] = v;
    }
  }
  const X = new Float64Array(m), Y = new Float64Array(m);
  const UX = new Float64Array(m), UY = new Float64Array(m);
  const GX = new Float64Array(m), GY = new Float64Array(m);
  const getVec = (a) => proj.subarray(fullIdx[a] * DIM, fullIdx[a] * DIM + DIM);
  const init = pcaInit(m, getVec);
  for (let a = 0; a < m; a++) { X[a] = init.X[a]; Y[a] = init.Y[a]; }
  const ITERS = 900, EXAG_UNTIL = 250, EXAG = 12, LR = 160;
  for (let it = 0; it < ITERS; it++) {
    const exag = it < EXAG_UNTIL ? EXAG : 1;
    let Z = 0;
    for (let a = 0; a < m; a++) {
      for (let b = 0; b < m; b++) {
        if (b === a) continue;
        const dx = X[a] - X[b], dy = Y[a] - Y[b];
        Z += 1 / (1 + dx * dx + dy * dy);
      }
    }
    for (let a = 0; a < m; a++) {
      const xa = X[a], ya = Y[a], base = a * m;
      let sx = 0, sy = 0;
      for (let b = 0; b < m; b++) {
        if (b === a) continue;
        const dx = xa - X[b], dy = ya - Y[b];
        const q = 1 / (1 + dx * dx + dy * dy);
        const w = exag * P[base + b] * q - (q * q) / Z;
        sx += w * dx; sy += w * dy;
      }
      GX[a] = 4 * sx; GY[a] = 4 * sy;
    }
    const mom = it < 250 ? 0.5 : 0.8;
    let disp = 0;
    for (let a = 0; a < m; a++) {
      UX[a] = mom * UX[a] - LR * GX[a];
      UY[a] = mom * UY[a] - LR * GY[a];
      X[a] += UX[a]; Y[a] += UY[a];
      disp += Math.abs(UX[a]) + Math.abs(UY[a]);
    }
    if (it % 100 === 0) console.log('  tsne[' + label + '] iter', it, 'disp', (disp / m).toFixed(3));
  }
  return { X, Y, m };
}

// ---- 4d. 语义分簇 + 簇心力导向 + 簇内时间螺旋 ----
// 为什么不再直接铺 t-SNE：这批数据的语义空间高度模板化（同一会话里大量近乎重复的消息），
// 任何降维都会把它摊成一条线/弧，视觉上就是"满屏平行斜线"。
// 改成三层：海 → 语义岛 → 岛内按时间卷成旋臂。岛的相对位置仍由语义相似度决定。
function kmeansSemantic(fullIdx, K) {
  const m = fullIdx.length;
  const d2 = (a, c) => {
    let s = 0; const ba = a * DIM;
    for (let d = 0; d < DIM; d++) { const t = proj[ba + d] - c[d]; s += t * t; }
    return s;
  };
  const cen = [Float64Array.from(proj.subarray(fullIdx[0] * DIM, fullIdx[0] * DIM + DIM))];
  while (cen.length < K) {
    let best = 0, bestD = -1;
    for (let a = 0; a < m; a++) {
      let dmin = Infinity;
      for (const c of cen) { const d = d2(fullIdx[a], c); if (d < dmin) dmin = d; }
      if (dmin > bestD) { bestD = dmin; best = a; }
    }
    cen.push(Float64Array.from(proj.subarray(fullIdx[best] * DIM, fullIdx[best] * DIM + DIM)));
  }
  const lab = new Int32Array(m).fill(-1);
  for (let it = 0; it < 20; it++) {
    let moved = 0;
    for (let a = 0; a < m; a++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < K; c++) { const d = d2(fullIdx[a], cen[c]); if (d < bd) { bd = d; bi = c; } }
      if (lab[a] !== bi) { lab[a] = bi; moved++; }
    }
    const acc = Array.from({ length: K }, () => new Float64Array(DIM));
    const cnt = new Int32Array(K);
    for (let a = 0; a < m; a++) {
      const c = lab[a], ba = fullIdx[a] * DIM;
      for (let d = 0; d < DIM; d++) acc[c][d] += proj[ba + d];
      cnt[c]++;
    }
    for (let c = 0; c < K; c++) {
      if (!cnt[c]) continue;
      for (let d = 0; d < DIM; d++) cen[c][d] = acc[c][d] / cnt[c];
    }
    if (moved === 0) break;
  }
  const members = Array.from({ length: K }, () => []);
  for (let a = 0; a < m; a++) members[lab[a]].push(fullIdx[a]);
  return { cen, lab, members };
}

// 把岛摆成两条旋臂：按语义方位排序，交替分到两条臂上，越靠后越往外圈
function spiralTargets(cen, K, targetR) {
  const ARMS = 2, TWIST = 0.72;
  const ang = [];
  for (let c = 0; c < K; c++) ang.push(Math.atan2(cen[c][1], cen[c][0]));
  const order = [];
  for (let c = 0; c < K; c++) order.push(c);
  order.sort((a, b) => ang[a] - ang[b]);
  const tx = new Float64Array(K), ty = new Float64Array(K);
  const tt = new Float64Array(K), armOf = new Int8Array(K);
  for (let q = 0; q < K; q++) {
    const c = order[q];
    const t = (q + 0.5) / K;
    const arm = q % ARMS;
    const theta = arm * Math.PI + t * TWIST * 6.283;
    const r = targetR * (0.08 + 0.92 * Math.pow(t, 0.82));
    tx[c] = Math.cos(theta) * r;
    ty[c] = Math.sin(theta) * r;
    tt[c] = t; armOf[c] = arm;
  }
  return { tx, ty, tt, arm: armOf, twist: TWIST, R: targetR };
}

function layoutHubs(cen, rad, targetR, sp) {
  const K = cen.length;
  const cx = new Float64Array(K), cy = new Float64Array(K);
  // 向日葵式均匀铺底（比随机撒点均匀，最后再被斥力推开）
  for (let c = 0; c < K; c++) {
    const ang = c * 2.399963;
    const rr = targetR * 0.82 * Math.sqrt((c + 0.5) / K);
    cx[c] = Math.cos(ang) * rr; cy[c] = Math.sin(ang) * rr;
  }
  // 相似度（cos，已归一化向量）
  const sim = [];
  for (let a = 0; a < K; a++) {
    sim.push(new Float64Array(K));
    for (let b = 0; b < K; b++) {
      let s = 0;
      for (let d = 0; d < DIM; d++) s += cen[a][d] * cen[b][d];
      sim[a][b] = s;
    }
  }
  const MAXSTEP = Math.max(0.004, targetR * 0.045);
  for (let it = 0; it < 420; it++) {
    const cool = 1 - it / 420 * 0.55;
    for (let a = 0; a < K; a++) {
      let fx = 0, fy = 0;
      for (let b = 0; b < K; b++) {
        if (b === a) continue;
        let dx = cx[a] - cx[b], dy = cy[a] - cy[b];
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) { const a3 = a * 2.399963; dx = Math.cos(a3); dy = Math.sin(a3); d = 1e-3; }
        const ux = dx / d, uy = dy / d;
        // 斥力（保证岛不重叠）；欠重叠量做饱和，避免近重合时力爆炸
        const need = rad[a] + rad[b] + 0.022;
        if (d < need) { const p = Math.min(need - d, need) * 1.1; fx += ux * p; fy += uy * p; }
        // 引力：语义越像越拉近（但不会重叠）
        const w = Math.max(0, sim[a][b]) * 0.9;
        if (w > 0 && d > need) { const p = Math.min(d - need, 0.35) * w * 0.045; fx -= ux * p; fy -= uy * p; }
      }
      // 向心弹簧：让整片海保持圆盘状，而不是被语义引力拉成一条横带
      fx -= cx[a] * 0.9; fy -= cy[a] * 0.9;
      const r = Math.hypot(cx[a], cy[a]);
      if (r > targetR) { fx -= cx[a] / r * Math.min(r - targetR, 0.5) * 3.0; fy -= cy[a] / r * Math.min(r - targetR, 0.5) * 3.0; }
      // 限速：整个迭代是逐帧累加的，不限速会指数发散成 Infinity
      const fm = Math.hypot(fx, fy);
      if (fm > 1e-9) {
        const step = Math.min(MAXSTEP, fm * 0.10 * cool);
        cx[a] += fx / fm * step; cy[a] += fy / fm * step;
      }
    }
  }
  // 各向同性化：语义引力容易把岛群压成横条，按 x / y 的二阶矩把分布拉回圆形
  let sx = 0, sy = 0;
  for (let c = 0; c < K; c++) { sx += cx[c] * cx[c]; sy += cy[c] * cy[c]; }
  const iso = Math.min(2.4, Math.max(0.42, Math.sqrt(sx / Math.max(1e-9, sy))));
  for (let c = 0; c < K; c++) cy[c] *= iso;
  let bad = 0;
  for (let c = 0; c < K; c++) if (!isFinite(cx[c]) || !isFinite(cy[c])) bad++;
  if (bad) console.log('  !! hub NaN', bad, 'of', K);
  return { cx, cy };
}

// ---- 4e. 两片海各自建岛（唯一节点参与），岛内按时间卷成旋臂 ----
const groups = [[], []];
for (let i = 0; i < N; i++) if (DUP[i] < 0) groups[nodes[i].domain ? 1 : 0].push(i);
const uniq = groups[0].length + groups[1].length;
const yx = new Float64Array(N), yy = new Float64Array(N), zz = new Float64Array(N);
// 两片海的间距跟着体量走：陪伴海小的时候它就贴过来，别在画面右边留一大片空
const cmpShare = groups[1].length / Math.max(1, uniq);
const SEP = 0.16 + 0.34 * Math.sqrt(cmpShare);
const RAD = groups.map((g) => 0.30 + 0.38 * Math.sqrt(g.length / Math.max(1, uniq)));
const ISLAND_K = [26, 11];
const outIslands = [];
for (let g = 0; g < 2; g++) {
  const idxs = groups[g];
  if (!idxs.length) continue;
  const K = Math.min(ISLAND_K[g], Math.floor(idxs.length / 3));
  const { cen, members } = kmeansSemantic(idxs, K);
  // 岛半径：成员越多岛越大
  const rad = new Float64Array(K);
  for (let c = 0; c < K; c++) rad[c] = members[c].length ? 0.045 + 0.055 * Math.sqrt(members[c].length / Math.max(1, idxs.length / K)) : 0;
  const { cx, cy } = layoutHubs(cen, rad, RAD[g], null);
  const shift = g === 0 ? -SEP : SEP;
  for (let c = 0; c < K; c++) {
    const mem = members[c];
    if (!mem.length) continue;
    // 每个岛整体前后错开一点，星云才有层次感（不然全在一个平面上）
    const islZ = (rnd() - 0.5) * 0.11;
    // 注意：这里的坐标是「归一化之前」的，等 4h 之后再用成员的真实坐标重算一次（见 4i）
    outIslands.push({ x: cx[c] + shift, y: cy[c], r: rad[c], z: g, n: mem.length, _m: mem.slice(), _r0: rad[c] });
    // 成员按时间排序 → 沿旋臂从中心卷到外圈，时间流一眼可见
    mem.sort((a, b) => (nodes[a].time || 0) - (nodes[b].time || 0));
    const rotC = rnd() * 6.283;
    const TURNS = 0.5 + rnd() * 0.7;
    const n = mem.length;
    for (let q = 0; q < n; q++) {
      const t = n === 1 ? 0.5 : q / (n - 1);
      const ang = rotC + t * TURNS * 6.283 * (rnd() > 0.5 ? 1 : -1);
      const rr = rad[c] * (0.18 + 0.86 * t);
      // 大量抖动：让它像松散星云里的尘埃，而不是一条弹簧线
      const jr = (rnd() - 0.5) * rad[c] * 0.55;
      const jt = (rnd() - 0.5) * 0.72;
      const aa = ang + jt;
      yx[mem[q]] = cx[c] + Math.cos(aa) * (rr + jr) + shift;
      yy[mem[q]] = cy[c] + Math.sin(aa) * (rr + jr);
      // 厚度：中心厚、边缘薄（给星云一层真的 z，不再是一张纸）
      zz[mem[q]] = islZ
        + Math.sin(t * 6.283 * TURNS + rotC) * rad[c] * 0.55
        + (rnd() - 0.5) * rad[c] * 0.95 * (1 - 0.30 * t);
    }
  }
  console.log('  sea[' + (g === 0 ? 'work' : 'companion') + ']', idxs.length, 'nodes →', K, 'islands | R =', RAD[g].toFixed(2));
}
// 重复节点继承代表点坐标，加一点抖动避免完全重叠
for (let i = 0; i < N; i++) {
  if (DUP[i] < 0) continue;
  const p = DUP[i];
  const ang = rnd() * 6.283, rad = 0.004 + rnd() * 0.012;
  yx[i] = yx[p] + Math.cos(ang) * rad;
  yy[i] = yy[p] + Math.sin(ang) * rad;
  zz[i] = zz[p] + (rnd() - 0.5) * 0.006;
}
const px = yx, py = yy, pz = zz;

// ---- 4f. 整体归一化：按包围盒居中 + 缩放到单位圆（99 分位半径）----
{
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < N; i++) {
    if (DUP[i] >= 0) continue;
    if (yx[i] < minx) minx = yx[i];
    if (yx[i] > maxx) maxx = yx[i];
    if (yy[i] < miny) miny = yy[i];
    if (yy[i] > maxy) maxy = yy[i];
  }
  const mx = (minx + maxx) / 2, my = (miny + maxy) / 2;
  const rr = [];
  for (let i = 0; i < N; i++) if (DUP[i] < 0) rr.push(Math.hypot(yx[i] - mx, yy[i] - my));
  rr.sort((a, b) => a - b);
  const R = rr[Math.floor(rr.length * 0.99)] || 1;
  const k = 1.02 / R;
  for (let i = 0; i < N; i++) { yx[i] = (yx[i] - mx) * k; yy[i] = (yy[i] - my) * k; }
}

// ---- 4f2. 把 z 缩放到一个合适的厚度（盘要薄，但得看得出厚度）----
{
  const Z_SPAN = 0.32;
  const zs = [];
  for (let i = 0; i < N; i++) if (DUP[i] < 0) zs.push(Math.abs(zz[i]));
  zs.sort((a, b) => a - b);
  const zr = zs[Math.floor(zs.length * 0.98)] || 1;
  const kz = Z_SPAN / zr;
  for (let i = 0; i < N; i++) zz[i] *= kz;
}

// ---- 4g. 主轴对齐：把每片海的主方向转回水平 ----
// 不然整片海是斜躺着的椭圆，看起来"不像星团"，像被拉歪的饼。
{
  for (let g = 0; g < 2; g++) {
    const idxs = [];
    for (let i = 0; i < N; i++) if (DUP[i] < 0 && (nodes[i].domain ? 1 : 0) === g) idxs.push(i);
    if (idxs.length < 8) continue;
    let mx = 0, my = 0;
    for (const i of idxs) { mx += yx[i]; my += yy[i]; }
    mx /= idxs.length; my /= idxs.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const i of idxs) {
      const dx = yx[i] - mx, dy = yy[i] - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ca = Math.cos(-ang), sa = Math.sin(-ang);
    for (const i of idxs) {
      const dx = yx[i] - mx, dy = yy[i] - my;
      yx[i] = mx + dx * ca - dy * sa;
      yy[i] = my + dx * sa + dy * ca;
    }
    // 顺便把长宽比压一压：太扁的海看着像被拉长的，星团应该接近圆
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const i of idxs) {
      if (yx[i] < minx) minx = yx[i];
      if (yx[i] > maxx) maxx = yx[i];
      if (yy[i] < miny) miny = yy[i];
      if (yy[i] > maxy) maxy = yy[i];
    }
    const w = (maxx - minx) || 1, h = (maxy - miny) || 1;
    const ratio = w / h;
    // 只在对角线上做温和修正：把比例往 1 拉一半，别强行变圆
    const sq = Math.pow(ratio, 0.5);       // ratio=1.6 → 修到 1.26 左右
    for (const i of idxs) yy[i] = (yy[i] - my) * sq + my;
  }
}

// ---- 4h. 主轴对齐后再做一次整体居中 + 缩放（4g 会改变包围盒）----
{
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let i = 0; i < N; i++) {
    if (DUP[i] >= 0) continue;
    if (yx[i] < minx) minx = yx[i];
    if (yx[i] > maxx) maxx = yx[i];
    if (yy[i] < miny) miny = yy[i];
    if (yy[i] > maxy) maxy = yy[i];
  }
  const cx0 = (minx + maxx) / 2, cy0 = (miny + maxy) / 2;
  let far = 0;
  for (let i = 0; i < N; i++) {
    if (DUP[i] >= 0) continue;
    const d = Math.hypot(yx[i] - cx0, yy[i] - cy0);
    if (d > far) far = d;
  }
  const s = 1.06 / (far || 1);
  for (let i = 0; i < N; i++) { yx[i] = (yx[i] - cx0) * s; yy[i] = (yy[i] - cy0) * s; }
}

// ---- 4i. 以「质的中心」居中 + 岛坐标/半径按归一化后的真实坐标重算 ----
// 4f/4h 用的是包围盒居中，而星是往左重的（一个 233 条的大会话全在左边），
// 结果整片海视觉重心偏左、右边空一大块。这里改成按质心平移，海就落在屏幕正中。
// 另外 4e 记录的岛坐标是归一化之前的，跟归一化后的星完全错位（岛雾、岛连线都画歪），
// 所以直接用岛的成员星重算圆心和半径。
{
  let mx = 0, my = 0, cnt = 0;
  for (let i = 0; i < N; i++) {
    if (DUP[i] >= 0) continue;
    mx += yx[i]; my += yy[i]; cnt++;
  }
  mx /= Math.max(1, cnt); my /= Math.max(1, cnt);
  for (let i = 0; i < N; i++) { yx[i] -= mx; yy[i] -= my; }
  for (const isl of outIslands) {
    const mem = isl._m;
    if (!mem || !mem.length) continue;
    let sx = 0, sy = 0;
    for (const i of mem) { sx += yx[i]; sy += yy[i]; }
    const ix = sx / mem.length, iy = sy / mem.length;
    const ds = mem.map((i) => Math.hypot(yx[i] - ix, yy[i] - iy)).sort((a, b) => a - b);
    const r90 = ds[Math.floor(ds.length * 0.90)] || 0;
    isl.x = +ix.toFixed(5);
    isl.y = +iy.toFixed(5);
    isl.r = +Math.max(0.016, r90 * 1.22).toFixed(5);
    delete isl._m;
    delete isl._r0;
  }
}

// ---- 5. 组装 data.js ----
const hasThumb = new Set(existsSync(THUMBS) ? readdirSync(THUMBS).map((f) => f.replace(/\.jpg$/, '')) : []);
const t0 = Math.min(...nodes.map((n) => n.time || Infinity));
const t1 = Math.max(...nodes.map((n) => n.time || 0));

// ---- 情绪分：数据里 emotion 字段基本是空的（17 条记忆 0 条有值），
// 所以用一份轻量中文情感词表给每条记忆打分，正 -1..1 负。
const POS_WORDS = ['好', '棒', '厉害', '喜欢', '爱', '开心', '高兴', '谢谢', '感谢', '满意', '漂亮',
  '可爱', '温柔', '暖', '舒服', '顺利', '成功', '赞', '不错', '优秀', '完美', '期待', '惊喜',
  '感动', '踏实', '安心', '治愈', '幸福', '愿意', '厉害', '能干', '对了', '太好了', '哈哈',
  '辛苦', '陪', '想', '好呀', '可以'];
const NEG_WORDS = ['难受', '累', '烦', '难过', '生气', '崩溃', '失败', '错', '糟糕', '讨厌', '疼',
  '焦虑', '压力', '麻烦', 'bug', '报错', '崩', '卡', '慢', '问题', '不行', '废', '无语', '郁闷',
  '担心', '害怕', '失望', '为什么不行', '失败', '没法', '不能', '错误', '异常', '冲突', '缺'];

function emotionOf(text) {
  const t = String(text || '').toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POS_WORDS) if (t.includes(w)) pos++;
  for (const w of NEG_WORDS) if (t.includes(w)) neg++;
  if (pos + neg === 0) return 0;
  return +(((pos - neg) / (pos + neg))).toFixed(3);
}

const outNodes = nodes.map((n, i) => {
  const imgs = (n.imgs || []).filter((im) => hasThumb.has(im.sha));
  const kw = [...vecs[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((e) => e[0]).filter((w) => w.length >= 2);
  const rec = imgs.length ? hashes[imgs[0].sha] : null;
  let hue = null;
  if (rec) {
    const r = rec[1] / 255, g = rec[2] / 255, b = rec[3] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.06) hue = null;            // 近灰白/黑的图不染色
    else {
      let hh;
      if (mx === r) hh = ((g - b) / d) % 6;
      else if (mx === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hue = Math.round(((hh * 60) + 360) % 360);
    }
  }
  return {
    i,
    id: n.id || null,          // 稳定身份（session-xxx:seq）：管理态（收藏/标签/备注）按它存
    k: n.kind,
    s: n.src,
    sid: sessIdx.get(n.sid) ?? -1,
    dm: seaOfSid.get(n.sid)?.sea === 'companion' ? 1 : (n.domain ?? 0),   // 这颗星属于哪片海（1 = 陪伴）：host 的回忆工具按它分域
    dp: DUP[i] >= 0 ? 1 : 0,
    dr: DUP[i] >= 0 ? (nodes[DUP[i]].id || null) : null,   // 跟哪条重复（稳定 id）
    t: n.time || t0,
    x: +px[i].toFixed(5),
    y: +py[i].toFixed(5),
    z: +pz[i].toFixed(5),
    txt: (n.text || '').slice(0, 600),
    kw,
    hu: hue,
    th: imgs.length ? imgs[0].sha : null,
    ic: (n.imgs || []).length,
    ar: imgs.length ? (imgs[0].w && imgs[0].h ? +(imgs[0].w / imgs[0].h).toFixed(3) : 1.6) : 0,
    imp: n.importance ?? null,
    em: n.emotion ?? null,
    emo: emotionOf((n.text || '') + ' ' + (n.tags || []).join(' ')),
    tg: n.tags || null,
    // 这句话在世界那边也有一份记录（worlds/conversations 的 sourceSeq 精确指回来）
    w: n.w || 0,
  };
});
// 会话标题大多直接取首条消息，于是注入型的会话标题长这样：
//   【当前时间】2026/10/30 01:50:4 / ［身份］你是「大肥鱼」，称 / ［统一人设卡 · QQ 和 B站是同
// 这些在列表里没法读。规则：抽得到人设名字就用「名字 · 第一条真正的人话」，抽不到就用第一条人话。
// 只有这几类算「注入标题」：方括号开头、@"文件路径" 开头、http 链接开头。
// 子代理那种「你是…/你负责…」的标题虽然长，但本身就是任务的说明，读得懂，保留原样。
const INJECT_RE = /^[【［\[]|^@"|^https?:/;
function prettyLabel(ns) {
  const raw = (ns.find((n) => n.title)?.title || '').trim();
  if (raw && !INJECT_RE.test(raw)) return raw;          // 正常标题，原样用
  // 人设名字：你是「X」/ 角色卡：X / 【当前角色】X
  // —— 标题被 DSH 截断时（如「【当前时间】2026/10/30 01:50:4」）名字只在首条消息里，所以两边都找
  const firstUser = ns
    .filter((n) => (n.src === 'user' || n.src === 'qq') && n.text)
    .sort((a, b) => (a.time || 0) - (b.time || 0))[0]?.text || '';
  const hay = raw + ' ' + String(firstUser).slice(0, 400);
  let name = '';
  const m1 = hay.match(/你是「([^」]{1,8})」/);
  const m2 = hay.match(/角色卡[:：]\s*([^\s—#，,。]{1,8})/);
  const m3 = hay.match(/【当前角色】\s*([^\s（(]{1,8})/);
  name = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]) || '';
  // 第一条「像人话」的用户消息：跳过注入模板、短句、纯 URL
  const sorted = ns
    .filter((n) => (n.src === 'user' || n.src === 'qq') && n.text)
    .sort((a, b) => (a.time || 0) - (b.time || 0));
  let human = '';
  for (const n of sorted) {
    const t = String(n.text).replace(/\s+/g, ' ').trim();
    if (t.length < 5 || t.length > 80) continue;
    if (INJECT_RE.test(t)) continue;
    if (/^[\[［].*[\]］]$/.test(t)) continue;
    human = t;
    break;
  }
  const body = human ? human.slice(0, 18) : raw.replace(/^[【［\[]([^】］\]]{0,24})[】］\]]/, '$1').replace(/\s+/g, ' ').slice(0, 18);
  if (name && body) return name + ' · ' + body;
  return name || body || raw;
}

const sessions = sessionIds.map((sid) => {
  const ns = nodes.filter((n) => n.sid === sid);
  const rec = seaOfSid.get(sid) || { sea: 'work', why: 'default' };
  const meta = sessMeta.get(sid) || {};
  return {
    id: sid.replace(/^session-/, '').slice(0, 8),
    dm: rec.sea === 'companion' ? 1 : 0,   // 这段会话属于哪片海（1 = 陪伴）
    why: rec.why,                          // 为什么（详情面板里会解释给用户看）
    ws: wsTitleOf.get(sid) || '',          // DSH 里自建的工作区标题（'' = 未分组）
    title: ns.find((n) => n.title)?.title || '',
    label: prettyLabel(ns),
    cwd: ns[0]?.cwd || '',
    count: ns.length,
    depth: ns[0]?.depth || 0,       // 0 = 主会话，>0 = 它里面派出去的子会话
    born: ns[0]?.born || 0,
    t0: Math.min(...ns.map((n) => n.time || t0)),
    t1: Math.max(...ns.map((n) => n.time || 0)),
    // 会话的真实身份（不再靠猜）：它是谁派出来的、哪个预设、原始父会话短 id
    origin: meta.origin || '',
    preset: meta.preset || '',
    pid: meta.parent ? String(meta.parent).replace(/^session-/, '').slice(0, 8) : '',
  };
});

// 子会话挂回主会话：优先用会话元数据里真实的 parentSession（精确），
// 只有那些没有该字段的老存档，才退回"同工作区 + 创建时间落在主会话跨度内"的猜测。
{
  const byShort = new Map(sessions.map((s, i) => [s.id, i]));
  const mains = sessions.filter((x) => x.depth === 0);
  let exact = 0, guessed = 0, orphan = 0;
  for (const c of sessions) {
    if (c.depth === 0) { c.parent = -1; continue; }
    let best = -1;
    if (c.pid && byShort.has(c.pid)) { best = byShort.get(c.pid); exact++; }   // 精确
    if (best < 0) {
      let bestGap = Infinity;
      for (const m of mains) {
        if (m.cwd !== c.cwd) continue;
        if (c.born < m.t0 - 5000) continue;
        const gap = Math.abs(c.born - m.t0);
        if (gap < bestGap) { bestGap = gap; best = sessions.indexOf(m); }
      }
      if (best >= 0) guessed++; else orphan++;
    }
    c.parent = best;
  }
  console.log('亲子挂接：精确', exact, '| 猜测', guessed, '| 找不到父会话', orphan);
}

// 空壳会话（只建了档、没说过一句话）：不进星图，但作为"隐藏层"清单留在数据里，
// 让"所有会话都看得见"这件事成立
const parked = (rawSess || [])
  .filter((s) => !(s.nodes > 0))
  .map((s) => ({
    id: s.id.replace(/^session-/, '').slice(0, 8),
    title: s.title || '',
    cwd: s.cwd || '',
    born: s.born || 0,
    depth: s.depth || 0,
    pid: s.parent ? String(s.parent).replace(/^session-/, '').slice(0, 8) : '',
    origin: s.origin || '',
    preset: s.preset || '',
    lines: s.lines || 0,
  }));
console.log('空壳会话', parked.length, '（进 parked 清单，不上星）');

const payload = { builtAt: Date.now(), t0, t1, nodes: outNodes, sessions, islands: outIslands, parked, sys: rawSys || [], proc: rawProc || { think: 0, tool: 0 } };

// ---- 6. 星座连线：对「唯一节点」在二维坐标上求近邻边（网格加速，最多 3 个最近邻）----
{
  const G = 72;
  const cell = 2.4 / G;
  const grid = new Map();
  const keyOf = (x, y) => Math.floor((x + 1.2) / cell) + ',' + Math.floor((y + 1.2) / cell);
  const uniq = [];
  for (let i = 0; i < nodes.length; i++) if (DUP[i] < 0) uniq.push(i);
  for (const i of uniq) {
    const k = keyOf(px[i], py[i]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const MAXD = 0.05;
  const ee = [];
  const seen = new Set();
  for (const i of uniq) {
    const gx = Math.floor((px[i] + 1.2) / cell), gy = Math.floor((py[i] + 1.2) / cell);
    const cand = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = grid.get((gx + dx) + ',' + (gy + dy));
      if (!arr) continue;
      for (const j of arr) {
        if (j === i) continue;
        const d = Math.hypot(px[i] - px[j], py[i] - py[j]);
        if (d <= MAXD) cand.push([j, d]);
      }
    }
    cand.sort((a, b) => a[1] - b[1]);
    for (let t = 0; t < Math.min(3, cand.length); t++) {
      const j = cand[t][0];
      const a = Math.min(i, j), b = Math.max(i, j);
      const kk = a + ':' + b;
      if (seen.has(kk)) continue;
      seen.add(kk);
      ee.push([a, b, +(cand[t][1] / MAXD).toFixed(2)]);
    }
  }
  payload.edges = ee;
  console.log('constellation edges', ee.length, '| uniq', uniq.length);
}

mkdirSync(P.out, { recursive: true });
const js = 'window.SEA=' + JSON.stringify(payload) + ';';
writeFileSync(OUT, js, 'utf8');
// 分域表：sid（全长）→ 0 工作 / 1 陪伴。
// Host 半的回忆工具（/sea/api 与 sea_recall）读的是 nodes.json，里面没有分域字段，
// 又不想让它把 domains.json 那套规则再实现一遍，所以在这里单独吐一份很小的映射。
{
  const z = {};
  for (const [sid, rec] of seaOfSid) z[sid] = rec.sea === 'companion' ? 1 : 0;
  const ZP = OUT.replace(/data\.js$/, 'zones.json');
  writeFileSync(ZP, JSON.stringify({ builtAt: payload.builtAt, zones: z }), 'utf8');
  const nc = Object.values(z).filter((v) => v === 1).length;
  console.log('zones.json', Object.keys(z).length, 'sessions | 陪伴', nc, '| 工作', Object.keys(z).length - nc);
}
// 版本戳：前端用它判断有没有新记忆（file:// 下 fetch 会被拦，所以做成 js）
const VER = OUT.replace('data.js', 'version.js');
writeFileSync(VER, 'window.SEA_VER=' + JSON.stringify(String(payload.builtAt)) + ';', 'utf8');
console.log('data.js', (js.length / 1048576).toFixed(2), 'MB |', outNodes.length, 'nodes |', sessions.length, 'sessions | builtAt', payload.builtAt);
