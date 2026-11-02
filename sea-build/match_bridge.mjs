// 看看 DSH 会话和 SurfCore 记忆卡里有多少「同一件事」——创意二：两片海重叠
// 用法：node sea-build/match_bridge.mjs [阈值]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, 'out');

function load(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = {};
  const fn = new Function('window', src);
  fn(sandbox);
  return sandbox.SEA || sandbox.SC;
}

const SEA = load(path.join(ROOT, 'data.js'));
const SC = load(path.join(ROOT, 'sc-data.js'));

const norm = (s) => String(s || '')
  .replace(/\[QQ\]/g, ' ')
  .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
  .toLowerCase();

function grams(s, n = 2) {
  const t = norm(s);
  const out = new Set();
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n));
  return out;
}

// DSH 侧：先拼出每个节点的文本
const dn = SEA.nodes.map((n, i) => ({
  i,
  sid: n.sid,
  t: n.t,
  txt: norm(n.txt || n.title || ''),
  g: grams(n.txt || n.title || ''),
}));

const sn = SC.nodes.map((n, j) => ({
  j,
  t: n.t,
  txt: norm(n.txt || ''),
  g: grams(n.txt || ''),
}));

// 先按「粗筛」：取每颗 SC 星里最长的一条 8-gram，在 DSH 侧建索引
const idx = new Map();
for (const d of dn) {
  if (d.txt.length < 8) continue;
  for (let k = 0; k + 8 <= d.txt.length; k += 4) {
    const key = d.txt.slice(k, k + 8);
    let arr = idx.get(key);
    if (!arr) idx.set(key, arr = []);
    if (arr.length < 40) arr.push(d.i);
  }
}

const TH = Number(process.argv[2] || 0.34);
const pairs = [];
for (const s of sn) {
  if (s.txt.length < 6) continue;
  const cand = new Set();
  for (let k = 0; k + 8 <= s.txt.length; k += 2) {
    const hit = idx.get(s.txt.slice(k, k + 8));
    if (hit) for (const d of hit) cand.add(d);
  }
  let best = null;
  for (const di of cand) {
    const d = dn[di];
    let inter = 0;
    const [small, big] = s.g.size < d.g.size ? [s.g, d.g] : [d.g, s.g];
    for (const g of small) if (big.has(g)) inter++;
    const sim = inter / Math.max(1, Math.min(s.g.size, d.g.size));  // 重叠系数
    if (!best || sim > best.sim) best = { sim, di, inter, s: s.g.size, d: d.g.size };
  }
  if (best && best.sim >= TH) pairs.push({ sj: s.j, ...best });
}

const uniq = new Map();
for (const p of pairs) {
  const prev = uniq.get(p.sj);
  if (!prev || p.sim > prev.sim) uniq.set(p.sj, p);
}
const list = [...uniq.values()].sort((a, b) => b.sim - a.sim);

// 写给页面用（创意二：两片海重叠）
const pairsOut = list.filter((p) => p.sim >= TH).map((p) => [p.di, p.sj, Math.round(p.sim * 100) / 100]);
fs.writeFileSync(path.join(ROOT, 'bridge.js'),
  'window.BRIDGE = ' + JSON.stringify({ at: Date.now(), th: TH, pairs: pairsOut }) + ';\n');
console.log('已写 out/bridge.js →', pairsOut.length, '对');

console.log('DSH 节点', SEA.nodes.length, '／ SurfCore 节点', SC.nodes.length);
console.log('阈值', TH, '→ 配上', list.length, '对（占 SurfCore', (list.length / SC.nodes.length * 100).toFixed(1) + '%）');
console.log('相似度分布:',
  ['>=0.8', '>=0.6', '>=0.5', '>=0.4', '>=0.34'].map((x) => {
    const t = Number(x.slice(2));
    return x + ':' + list.filter((p) => p.sim >= t).length;
  }).join('  '));
console.log('\n前 12 对：');
for (const p of list.slice(0, 12)) {
  const s = SC.nodes[p.sj], d = SEA.nodes[p.di];
  const cut = (x, n) => String(x || '').replace(/\s+/g, ' ').slice(0, n);
  console.log('\n  sim=' + p.sim.toFixed(2), 'gram', p.inter + '/' + Math.min(p.s, p.d));
  console.log('   SurfCore:', cut(s.txt, 60));
  console.log('   DSH     :', cut(d.txt, 60));
}
