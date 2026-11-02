/**
 * 检索层：BM25 + 中文 2-gram + 同义词扩展 + 会话邻近
 *
 * 为什么不用向量：
 *   这台机器上没有 embedding 能力（没有 ollama、没有 torch / sentence-transformers，
 *   DeepSeek 自家也不提供 embedding 接口）。为了 1600 条短中文文本硬装一个 200MB 的
 *   本地模型 + 一堆依赖，不如把这 1600 条**用 BM25 排好序**——它零依赖、离线、毫秒级，
 *   而且每个结果都能说清"为什么命中"。
 *   真要用向量，只需要在外面套一层 rerank：把 candidates 拿去重排再返回。
 *
 * 三个补丁：
 *   1. BM25 替代「所有关键词都是子串」——现在短词、常用词会自然降权（IDF）。
 *   2. 同义词表：语音包 ↔ 音频包 / 音色 / TTS，查一个能捞到另一个。
 *   3. 会话邻近：命中的那句话往往不是孤立的，把同会话前后几条作为「上下文」带出来。
 */

const CN = /[\u4e00-\u9fa5]/;
const TOKEN_RE = /[a-z0-9][a-z0-9_./\\-]*|[\u4e00-\u9fa5]+/g;

/** 中文：2-gram（单字串保留单字）；英文/数字/路径：整词小写 */
export function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const out = [];
  const m = s.match(TOKEN_RE);
  if (!m) return out;
  for (const w of m) {
    if (CN.test(w)) {
      if (w.length === 1) out.push(w);
      else for (let i = 0; i + 2 <= w.length; i++) out.push(w.slice(i, i + 2));
    } else if (w.length >= 2) {
      out.push(w);
    }
  }
  return out;
}

/**
 * 建索引。nodes 只需要 { text }。
 * 调用方缓存它（数据不重跑就不用重建）。
 */
export function buildIndex(nodes) {
  const N = nodes.length;
  const docs = new Array(N);
  const df = new Map();
  let totalLen = 0;
  for (let i = 0; i < N; i++) {
    const toks = tokenize(nodes[i].text || '');
    docs[i] = toks;
    totalLen += toks.length;
    const seen = new Set();
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (seen.has(t)) continue;
      seen.add(t);
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  return { N, docs, df, avgdl: totalLen / Math.max(1, N) };
}

const K1 = 1.2;
const B = 0.75;

function idf(index, term) {
  const n = index.df.get(term) || 0;
  return Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
}

function bm25Doc(index, i, terms) {
  const toks = index.docs[i];
  if (!toks || !toks.length) return 0;
  const dl = toks.length;
  // 每篇的 tf
  const tf = new Map();
  for (let k = 0; k < toks.length; k++) tf.set(toks[k], (tf.get(toks[k]) || 0) + 1);
  let s = 0;
  for (const t of terms) {
    const f = tf.get(t);
    if (!f) continue;
    s += idf(index, t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * dl) / index.avgdl)));
  }
  return s;
}

/**
 * 检索。
 * @param {object} index buildIndex 的结果
 * @param {object[]} nodes 同一份节点（下标要和 index 对齐）
 * @param {string} q 查询串
 * @param {object} opts
 *   synonyms  { [词]: [近义词...] }  查"语音包"时把"音频包/音色"也算进来
 *   srcWeight { [来源]: 0~1 }        某些来源天然是噪音（比如世界心跳的【我的时间】），降权
 *   topK      先取多少条候选（默认 80）
 * @returns {{i:number, score:number, why:string[]}[]} 按分数降序、已归一化
 */
export function search(index, nodes, q, opts = {}) {
  if (opts._prf) return searchInner(index, nodes, q, opts);
  const first = searchInner(index, nodes, q, opts);
  // 自动扩展（伪相关反馈）：拿第一轮最好的几条里"共现但不常见"的词，低权重再来一轮。
  // 好处是"换个说法"也能找到，不用维护词表；坏处是可能漂，所以权重压到 0.28、最多 5 个词。
  if (!opts.prf || first.length < 2) return first;
  // 只在"查询里有词整个语料都没出现过"时才扩展（说明是生词 / 换个说法），
  // 平时不扩张——扩张会漂，把本来排第一的准结果挤下去。
  const hasUnknown = tokenize(q).some((t) => !index.df.has(t));
  if (!hasUnknown) return first;
  const extra = prfTerms(index, q, first);
  if (!extra.length) return first;
  const second = searchInner(index, nodes, q, { ...opts, _prf: extra });
  // 扩展后如果一条都没有（扩歪了），退回第一轮
  return second.length ? second : first;
}

/** 从第一轮结果里挑扩展词：共现多、但不是烂大街的词 */
function prfTerms(index, q, first) {
  const base = new Set(tokenize(q));
  const w = new Map();
  const hits = new Map(); // 出现在几条 top 结果里
  for (const r of first.slice(0, 3)) {
    const seen = new Set();
    for (const t of index.docs[r.i] || []) {
      if (base.has(t) || seen.has(t) || t.length < 2) continue;
      seen.add(t);
      const n = index.df.get(t) || 0;
      if (n > index.N * 0.08) continue; // 太常见 = 没信息量
      if (n < 2) continue; // 只出现过一次 = 多半是错字或路径
      w.set(t, (w.get(t) || 0) + r.score);
      hits.set(t, (hits.get(t) || 0) + 1);
    }
  }
  return [...w.entries()]
    .filter(([t]) => (hits.get(t) || 0) >= 2) // 至少两条结果里都出现，才敢当"相关词"
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([t]) => ({ t, w: 0.22 }));
}

function searchInner(index, nodes, q, opts = {}) {
  const query = String(q || '').trim();
  if (!query) return [];
  const lowQ = query.toLowerCase();
  const terms = tokenize(query);
  if (!terms.length) return [];

  const synonyms = opts.synonyms || {};
  const srcWeight = opts.srcWeight || {};
  // 同义词：查询里出现的词，把它映射出来的近义词也作为低权重 term
  const extra = [];
  for (const key of Object.keys(synonyms)) {
    if (lowQ.indexOf(key.toLowerCase()) >= 0) {
      for (const w of synonyms[key]) for (const t of tokenize(w)) extra.push(t);
    }
  }
  const prf = opts._prf || [];

  // 单字查询（"网""忘""猫"）：语料是按 2-gram 建的索引，单字基本不在词表里，
  // 直接查必然是 0 条。这里把它展开成"含这个字的 2-gram"（按常见度取前 30）。
  if (terms.length === 1 && terms[0].length === 1) {
    const c = terms[0];
    const cand = [];
    for (const t of index.df.keys()) {
      if (t.length === 2 && t.indexOf(c) >= 0) cand.push([t, index.df.get(t) || 0]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    for (const [t] of cand.slice(0, 30)) if (extra.indexOf(t) < 0) extra.push(t);
  }

  const scored = [];
  for (let i = 0; i < index.N; i++) {
    let s = bm25Doc(index, i, terms);
    if (extra.length) s += 0.45 * bm25Doc(index, i, extra);
    for (const p of prf) s += p.w * bm25Doc(index, i, [p.t]);
    const txt = String(nodes[i].text || '').toLowerCase();
    // 原串直接出现：「插件修复」这种整词查询，比拆成 2-gram 更可信
    if (lowQ.length >= 2 && txt.indexOf(lowQ) >= 0) s *= 1.55;
    if (s <= 0) continue;
    const w = srcWeight[nodes[i].src];
    if (typeof w === 'number') s *= w;
    if (s > 0) scored.push({ i, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, opts.topK || 80));
  const best = top.length ? top[0].score : 0;
  for (const it of top) it.score = best > 0 ? it.score / best : 0;
  return top;
}

/** 给结果配一句"为什么是它"：命中了哪些词 */
export function explain(index, nodes, i, q, synonyms = {}) {
  const lowQ = String(q || '').toLowerCase();
  const terms = tokenize(lowQ);
  const extra = [];
  for (const key of Object.keys(synonyms)) {
    if (lowQ.indexOf(key.toLowerCase()) >= 0) for (const w of synonyms[key]) for (const t of tokenize(w)) extra.push(t);
  }
  const txt = String(nodes[i].text || '').toLowerCase();
  const why = [];
  if (lowQ.length >= 2 && txt.indexOf(lowQ) >= 0) why.push('原文含「' + q.trim() + '」');
  const hit = new Set();
  if (index.docs[i]) for (const t of index.docs[i]) if (terms.indexOf(t) >= 0) hit.add(t);
  if (hit.size) {
    const parts = [...hit].slice(0, 4);
    why.push('词：' + parts.join('·'));
  }
  if (extra.length) {
    const seen = new Set();
    if (index.docs[i]) for (const t of index.docs[i]) if (extra.indexOf(t) >= 0) seen.add(t);
    if (seen.size) why.push('近义：' + [...seen].slice(0, 3).join('·'));
  }
  return why;
}
