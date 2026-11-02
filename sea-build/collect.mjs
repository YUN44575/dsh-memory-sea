/**
 * 采集：把 .dsh 里的会话、长期记忆、世界日记读成 nodes.json。
 *
 * 增量：按会话文件缓存（mtime + size 指纹）。没有变化的文件直接复用上次的解析结果，
 * 只重新解析新增/改动过的文件。`--full` 强制全量。
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { loadPaths } from './paths.mjs';

const P = loadPaths();
const SESSIONS = P.sessions;
const OBJ = P.objects;
const MEM_DIR = P.fishMemory;
const OUT = P.nodes;
const CACHE = join(P.out, '.collect-cache.json');
const FORCE_FULL = process.argv.includes('--full');
const CACHE_VER = 1;

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function decodeAll(file) {
  const b = readFileSync(file);
  const starts = []; let idx = 0;
  while (true) { const i = b.indexOf(MAGIC, idx); if (i < 0) break; starts.push(i); idx = i + 4; }
  const parts = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k], e = k + 1 < starts.length ? starts[k + 1] : b.length;
    try { parts.push(zstdDecompressSync(b.subarray(s, e)).toString('utf8')); } catch {}
  }
  return parts.join('').split('\n').filter(Boolean);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = dir + '\\' + e; let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out); else if (e.endsWith('.jsonl.zstd')) out.push(p);
  }
  return out;
}

// 哪些来源算"记忆"（排除系统注入的上下文/规则/审批流水）
// agent-message = 多 agent / 团队协作的通信（子代理回传、Lead 抽查结论），是真实的交流
const KEEP = new Set(['user', 'qq', 'dsh-world-life', 'dsh-world-history', 'agent-message']);

function cleanText(s) {
  return String(s || '')
    .replace(/<[^>\n]{1,40}>/g, ' ')
    .replace(/\[\/?[a-zA-Z_][^\]\n]{0,40}\]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function objPath(sha256hex) {
  return join(OBJ, sha256hex.slice(0, 2), sha256hex);
}

const nodes = [];
const sessList = [];   // 所有会话的元数据（含一个节点都没有的空壳，供"隐藏层"清单用）
const sysMap = new Map(); // 被挡在星图外的系统注入消息：按 source.kind 归类，只留计数与样本
const procStat = { think: 0, tool: 0 }; // 过程层（思考 / 工具调用），只计数不入图

// ── 缓存 ─────────────────────────────────────────────────────────
const cache = (!FORCE_FULL && existsSync(CACHE))
  ? (() => { try { const c = JSON.parse(readFileSync(CACHE, 'utf8')); return c && c.v === CACHE_VER && c.files ? c : { v: CACHE_VER, files: {} }; } catch { return { v: CACHE_VER, files: {} }; } })()
  : { v: CACHE_VER, files: {} };
const nextCache = { v: CACHE_VER, files: {} };

const stat = {
  files: 0, sessions: 0, kept: 0, skippedEmpty: 0, truncated: 0, images: 0, missingImg: 0,
  memory: 0, diary: 0, sysKinds: 0, sysMsgs: 0,
  cached: 0, parsed: 0,
};

// 解析一个会话文件，返回它自己产出的全部东西（可整体缓存）
function collectSession(file) {
  const out = { sess: null, nodes: [], sys: [], proc: { think: 0, tool: 0 }, trunc: 0, images: 0, skipped: 0, missingImg: 0 };
  let lines;
  try { lines = decodeAll(file); } catch { return out; }
  let sessionMeta = null, title = '';
  for (const l of lines) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.type === 'session') sessionMeta = o;
    else if (o.type === 'session/title' && o.data?.title) title = o.data.title;
  }
  if (!sessionMeta) return out;
  const sid = sessionMeta.id || file;
  out.sess = {
    id: sid,
    title: title || '',
    cwd: sessionMeta.cwd || '',
    born: sessionMeta.createdAt || 0,
    depth: sessionMeta.delegationDepth || 0,
    parent: sessionMeta.parentSession || '',
    origin: sessionMeta.origin || '',
    preset: sessionMeta.agentPreset?.type || (typeof sessionMeta.agentPreset === 'string' ? sessionMeta.agentPreset : ''),
    lines: lines.length,
  };

  const sysMapLocal = new Map();
  let inFile = 0;

  for (const l of lines) {
    const isAsst = l.includes('"type":"assistant/message"');
    if (!isAsst && !l.includes('"type":"user/message"')) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    const d = o.data || {};
    let src;
    let content;
    if (isAsst) {
      // AI 的回复：只取真正说给用户听的那段话，思考过程和工具调用都不要
      src = 'assistant';
      content = (d.message && d.message.content) || [];
      // 过程层只计数：让人知道"还有多少被折叠在详情里"，但绝不入图
      for (const c of content) {
        if (c.type === 'reasoning') out.proc.think++;
        else if (c.type === 'tool-call') out.proc.tool++;
      }
    } else {
      src = d.source?.kind || 'none';
      if (!KEEP.has(src)) {
        // 系统注入类（时间/运行时上下文、插件规则、技能目录、审批流水…）
        // 它们的数量会反超真实对话，画成星就是噪音 —— 但"所有隐藏的都要能看到"，
        // 所以只留计数 + 几条样本，前端做"隐藏层"清单用。
        let sy = sysMapLocal.get(src);
        if (!sy) { sy = { kind: src, n: 0, samples: [], all: [] }; sysMapLocal.set(src, sy); }
        sy.n++;
        let st = '';
        for (const c of (d.content || [])) if (c.type === 'text') st += (st ? '\n' : '') + (c.text || '');
        // 这里不做 cleanText：系统注入的消息常常整段是标签块，清完就什么都不剩，
        // 而隐藏层清单要的恰恰是"它长什么样" —— 只压空白、截断。
        st = String(st).replace(/\s+/g, ' ').trim();
        if (!st) { continue; }
        if (sy.samples.length < 3) sy.samples.push({ sid, title: title || '', time: o.time || 0, txt: st.slice(0, 200) });
        sy.all.push({ sid, time: o.time || 0, txt: st.slice(0, 800) });
        continue;
      }
      content = d.content || [];
    }
    let text = '';
    const imgs = [];
    for (const c of content) {
      if (c.type === 'text') text += (text ? '\n' : '') + c.text;
      else if (c.type === 'image' && c.attachment) imgs.push(c.attachment);
    }
    text = cleanText(text);
    if (!text && imgs.length === 0) { out.skipped++; continue; }
    // 超长文本通常是"把一整段聊天记录重新贴回来"，不是一条交流；
    // 但整条扔掉会连真正说的话一起丢，所以留头留尾、中间省略并标出来
    if (text.length > 4000) {
      text = text.slice(0, 2400) + '\n…（中间省略 ' + (text.length - 3600) + ' 字）…\n' + text.slice(-1200);
      out.trunc++;
    }
    if (!text && imgs.length) {
      // 纯图片消息：文本用文件名兜一下
      text = imgs.map((a) => a.name || '一张图').join('、');
    }
    const realImgs = [];
    for (const a of imgs) {
      const hex = String(a.attachmentId || '').replace(/^sha256:/, '');
      if (!hex) continue;
      if (!existsSync(objPath(hex))) { out.missingImg++; continue; }
      realImgs.push({ sha: hex, w: a.width || 0, h: a.height || 0, mt: a.mediaType || '', name: a.name || '' });
    }
    out.images += realImgs.length;
    out.nodes.push({
      // 稳定身份：会话 id + 消息序号。所有消息都有 seq（实测 12915/12915），
      // 所以这个 id 跨重跑不变 —— 管理态（收藏/标签）和增量布局都靠它。
      id: sid + ':' + (o.seq ?? inFile++),
      kind: realImgs.length ? 'image' : 'text',
      src,
      sid,
      title: title || '',
      depth: sessionMeta.delegationDepth || 0,
      born: sessionMeta.createdAt || 0,
      cwd: sessionMeta.cwd || '',
      time: o.time || 0,
      text,
      imgs: realImgs,
      // 协作通信的来处（哪个子代理/谁发来的），给详情面板标"这是谁说的"
      sender: src === 'agent-message' ? (d.source?.senderSessionId || '') : '',
    });
  }
  out.sys = [...sysMapLocal.values()];
  return out;
}

function mergeSys(list) {
  for (const s of list) {
    let sy = sysMap.get(s.kind);
    if (!sy) { sy = { kind: s.kind, n: 0, samples: [], all: [] }; sysMap.set(s.kind, sy); }
    sy.n += s.n;
    for (const smp of s.samples) if (sy.samples.length < 3) sy.samples.push(smp);
    for (const a of s.all) sy.all.push(a);
  }
}

const files = walk(SESSIONS);
stat.files = files.length;

for (const file of files) {
  const rel = relative(SESSIONS, file);
  let st; try { st = statSync(file); } catch { continue; }
  const sig = st.mtimeMs + ':' + st.size;
  const hit = cache.files[rel];
  let rec;
  if (hit && hit.sig === sig && Array.isArray(hit.nodes)) {
    rec = hit;
    stat.cached++;
  } else {
    const c = collectSession(file);
    rec = { sig, nodes: c.nodes, sys: c.sys, proc: c.proc, trunc: c.trunc, images: c.images, skipped: c.skipped, missingImg: c.missingImg, sess: c.sess };
    stat.parsed++;
  }
  nextCache.files[rel] = rec;

  stat.sessions++;
  if (rec.sess) sessList.push(rec.sess);
  if (rec.nodes.length) { for (const n of rec.nodes) nodes.push(n); stat.kept += rec.nodes.length; }
  if (rec.sys) mergeSys(rec.sys);
  if (rec.proc) { procStat.think += rec.proc.think || 0; procStat.tool += rec.proc.tool || 0; }
  stat.truncated += rec.trunc || 0;
  stat.images += rec.images || 0;
  stat.skippedEmpty += rec.skipped || 0;
  stat.missingImg += rec.missingImg || 0;
}
// 缓存里已经不存在/已被删掉的文件，条目丢掉，别让缓存越长越大
// （nextCache 只收本次 walk 到的文件，天然就清掉了）

// 长期记忆条目（fish-memory）
if (existsSync(MEM_DIR)) {
  for (const f of readdirSync(MEM_DIR)) {
    if (!f.endsWith('.json') || f.endsWith('.bak')) continue;
    let d; try { d = JSON.parse(readFileSync(join(MEM_DIR, f), 'utf8')); } catch { continue; }
    for (const m of d.memories || []) {
      if (!m || !m.text) continue;
      if (m['已被取代']) continue; // 被取代的旧记忆不上星
      nodes.push({
        id: 'mem:' + (m.id || f + ':' + nodes.length),
        kind: 'memory',
        src: 'fish-memory',
        sid: f.replace(/\.json$/, ''),
        title: m.source || '',
        cwd: '',
        time: Date.parse(m.at || m.createdAt || '') || 0,
        text: m.text,
        imgs: [],
        tags: m.tags || [],
        importance: m.importance ?? 0.5,
        emotion: m.emotion || null,
        related: m.related || [],
      });
      stat.memory++;
    }
  }
}

// 世界自己写的日记（.dsh/worlds/default/diary/*.md）
// 注意：这跟 worlds/conversations 那三个 jsonl 不是一回事 —— 后者是从 DSH 会话抽出来的
// 副本（sourceSessionId 指回去，会重复），而 diary 是它自己第一人称写的，一个字都不重复。
// 所以单独当一类来源，一篇按段落切开，每段一颗星。
const DIARY = join(P.worlds, 'diary');
if (existsSync(DIARY)) {
  for (const f of readdirSync(DIARY)) {
    if (!f.endsWith('.md')) continue;
    const day = f.replace(/\.md$/, '');
    const t0 = Date.parse(day + 'T22:40:00+08:00') || 0;
    if (!t0) continue;
    let raw = '';
    try { raw = readFileSync(join(DIARY, f), 'utf8'); } catch { continue; }
    const paras = raw.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    // 日记段落很碎（一行一句），直接一段一颗星会切出两百多颗。
    // 攒到 140 字再落一颗，既是完整的一段叙述，数量也压得住。
    const chunks = [];
    let buf = '';
    for (const p of paras) {
      if (/^#{1,6}\s/.test(p) || /^-{3,}$/.test(p) || /^```/.test(p)) {
        if (buf) { chunks.push(buf); buf = ''; }
        continue;
      }
      if (p.replace(/\s/g, '').length < 6) continue;
      buf = buf ? buf + '\n' + p : p;
      if (buf.replace(/\s/g, '').length >= 140) { chunks.push(buf); buf = ''; }
    }
    if (buf) chunks.push(buf);
    let pi = 0;
    for (const p of chunks) {
      const txt = p.replace(/\s*\n\s*/g, ' ').trim().slice(0, 1400);
      nodes.push({
        id: 'diary:' + day + ':' + pi,
        kind: 'text',
        src: 'world-diary',
        sid: 'world-diary',
        title: '世界的日记 · ' + day,
        depth: 0,
        born: t0,
        cwd: DIARY,
        time: t0 + pi * 60000,                      // 每段隔一分钟，时间轴上能散开
        text: txt,
        imgs: [],
      });
      pi++;
      stat.diary++;
    }
  }
}

// 世界的对话副本：worlds/conversations 是从 DSH 会话里抽出来的（每条都带 sourceSessionId +
// sourceSeq，实测 201/218 能精确指回本地的某句话）。所以**不要**把它们当第二份数据上星，
// 那只会让同一句话出现两次；只给对应节点打个标记，详情里说一句"这件事世界那边也记了一笔"。
// 这个标记很小且每次都重算（<50ms），不进缓存，免得缓存里存一份过期的。
const WCONV = join(P.worlds, 'conversations');
if (existsSync(WCONV)) {
  const wMap = new Map();
  for (const f of readdirSync(WCONV)) {
    if (!f.endsWith('.jsonl')) continue;
    let raw = ''; try { raw = readFileSync(join(WCONV, f), 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (!o.sourceSessionId || o.sourceSeq == null) continue;
      wMap.set(o.sourceSessionId + ':' + o.sourceSeq, { t: Date.parse(o.occurredAt) || 0, role: o.role || '' });
    }
  }
  let hit = 0;
  for (const n of nodes) {
    const w = wMap.get(n.id);
    if (w) { n.w = w.t; hit++; }
  }
  stat.worldTotal = wMap.size;
  stat.worldHit = hit;
}

nodes.sort((a, b) => a.time - b.time);// 每个会话实际有多少个节点（0 = 空壳会话：只建了档、没说过话）
const cntOf = new Map();
for (const n of nodes) cntOf.set(n.sid, (cntOf.get(n.sid) || 0) + 1);
const sessOut = sessList.map((s) => ({ ...s, nodes: cntOf.get(s.id) || 0 }));
// 隐藏层：按消息条数倒序
const sysOut = [...sysMap.values()].sort((a, b) => b.n - a.n);
stat.sysKinds = sysOut.length;
stat.sysMsgs = sysOut.reduce((a, b) => a + b.n, 0);

try { mkdirSync(P.out, { recursive: true }); } catch {}
writeFileSync(OUT, JSON.stringify({ builtAt: Date.now(), nodes, sessions: sessOut, sys: sysOut.map(({ all, ...r }) => r), proc: procStat }), 'utf8');
try { writeFileSync(CACHE, JSON.stringify(nextCache), 'utf8'); } catch (e) { console.log('（缓存写入失败，下次会全量：' + e.message + '）'); }

// 隐藏层全文（含每类全部消息，截 800 字）。总量好几 MB，不能塞进 data.js（每次打开都付这个钱），
// 单独落一个 hidden.js，前端点「加载全文」时才 script 注入。
const sysAll = [];
for (const sy of sysOut) {
  for (const it of (sy.all || [])) sysAll.push({ k: sy.kind, t: it.time, sid: it.sid, d: it.txt });
}
sysAll.sort((a, b) => b.t - a.t);
const HIDDEN = OUT.replace(/nodes\.json$/, 'out' + String.fromCharCode(92) + 'hidden.js');
writeFileSync(HIDDEN, 'window.SEA_SYS=' + JSON.stringify(sysAll) + ';\n', 'utf8');
stat.sysFull = sysAll.length;
const tMin = nodes[0]?.time || 0, tMax = nodes[nodes.length - 1]?.time || 0;
const parked = sessOut.filter((s) => s.nodes === 0).length;
console.log(JSON.stringify(stat, null, 1));
console.log('隐藏层:', sysOut.length, '类 |', sysOut.reduce((a, b) => a + b.n, 0), '条 | 过程层: 思考', procStat.think, '/ 工具', procStat.tool);
console.log('增量:', stat.cached, '个文件用缓存 /', stat.parsed, '个重新解析');
console.log('nodes:', nodes.length, '| 会话:', sessOut.length, '| 空壳会话:', parked, '| 时间跨度:', new Date(tMin).toISOString().slice(0, 10), '→', new Date(tMax).toISOString().slice(0, 10));
console.log('out:', OUT);
