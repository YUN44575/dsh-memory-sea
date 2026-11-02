/**
 * 同义词自检：把一批真实查询跑一遍，告诉你哪些**搜不到东西**、哪些排序可疑。
 *
 *   node sea-build/synonym-test.mjs
 *
 * 用法：看到「0 条」的查询，就想想"人们还会怎么说它"，把对应词补进
 *       sea.config.json 的 synonyms 里，再跑一次看有没有命中。
 *       这一步就是同义词表的日常维护——不用改代码。
 */
import { readFileSync } from 'node:fs';
import { buildIndex, search } from '../dsh-plugin-sea/search.js';
import { loadPaths } from './paths.mjs';

const P = loadPaths();
const d = JSON.parse(readFileSync(P.nodes, 'utf8'));
const nodes = d.nodes || [];
const index = buildIndex(nodes);

let cfg = {};
try {
  cfg = JSON.parse(readFileSync(P.config, 'utf8'));
} catch {}
const synonyms = cfg.synonyms || {};
const srcWeight = cfg.srcWeight || {};

console.log('\n同义词自检 · ' + nodes.length + ' 条记忆\n' + '─'.repeat(58));

/** 一批"人真的会这么搜"的词，覆盖你能想到的日常说法 */
const QUERIES = [
  '语音', '语音包', '音频', '音色', 'TTS', 'RVC', '唱歌', '念一段',
  '图片', '表情包', '截图', '照片', '头像', '画', '立绘',
  '插件', '装上', '安装', '卸载', '报错', '崩溃', '闪退', '卡住', '修好',
  '记忆', '忘', '记得', '回忆', '忘了',
  '世界', '鲸鲸', '日记', '陪伴', '房间',
  'QQ', '消息', '发不出', '桥',
  '文档', '交接', '笔记',
  '视频', '渲染', '音频轨', '剪辑',
  '睡觉', '早安', '晚安', '今天', '昨天',
  '电脑', '本机', '网', '断网', '重启',
  '难过', '开心', '生气', '抱抱',
];

const zero = [];
const weak = [];
for (const q of QUERIES) {
  const r = search(index, nodes, q, { synonyms, srcWeight, topK: 40 });
  const n = r.length;
  let mark = '✓';
  if (!n) {
    mark = '✗';
    zero.push(q);
  } else if (n < 3) {
    mark = '·';
    weak.push(q);
  }
  const sample = n ? String(nodes[r[0].i].text || '').replace(/\s+/g, ' ').slice(0, 36) : '（没有结果）';
  console.log(`  ${mark}  ${q.padEnd(8)} ${String(n).padStart(3)} 条  ${sample}`);
}

console.log('\n' + '─'.repeat(58));
if (zero.length) {
  console.log('✗ 完全搜不到的 ' + zero.length + ' 个：' + zero.join('、'));
  console.log('   → 补进 sea.config.json 的 synonyms，或确认这句话真的没说过。');
} else {
  console.log('✓ 没有完全搜不到的查询');
}
if (weak.length) console.log('· 只有 1–2 条（可能词表能再扩）：' + weak.join('、'));
console.log('');
