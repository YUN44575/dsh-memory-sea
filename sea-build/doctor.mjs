/**
 * 自检：这套东西在**这台机器**上能不能跑、缺什么、下一步做什么。
 *
 *   node sea-build/doctor.mjs
 *
 * 给两种情况用：
 *   1. 换一台电脑 / 给别人装 —— 先跑它，看缺不缺前置条件
 *   2. 页面打不开 / 数据不更新 —— 看是哪一步断了
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadPaths, probe, CONFIG_FILE } from './paths.mjs';

const P = loadPaths();
const ok = (b) => (b ? '✓' : '✗');
const NA = '·';
const line = (mark, name, detail) => console.log(`  ${mark}  ${name.padEnd(26)} ${detail || ''}`);

console.log('\n记忆意识海 · 自检\n' + '─'.repeat(64));

// ── 1. 运行环境
console.log('\n【运行环境】');
const major = Number(process.versions.node.split('.')[0]);
line(ok(major >= 18), 'Node.js', process.version + (major >= 18 ? '' : '（要 >= 18，建议 20+）'));
line(NA, '平台', process.platform);

// ── 2. 数据源
console.log('\n【数据源】');
for (const it of probe(P)) {
  line(it.ok ? '✓' : it.must ? '✗' : '·', it.name, it.path + (it.ok ? '' : it.must ? '  ← 必须要有' : '  （没有就跳过这一块）'));
}
let sessN = 0;
try {
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (e.endsWith('.jsonl.zstd')) sessN++;
    }
  };
  walk(P.sessions);
} catch {}
line(sessN ? '✓' : '✗', '会话归档', sessN + ' 个 .jsonl.zstd');

// ── 3. 管线产物
console.log('\n【管线产物】');
const age = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' 小时前';
  return Math.round(h / 24) + ' 天前';
};
const fileInfo = (p, name) => {
  if (!existsSync(p)) return line('✗', name, p + '  ← 还没生成');
  const st = statSync(p);
  return line('✓', name, (st.size / 1024).toFixed(0) + ' KB · ' + age(st.mtimeMs));
};
fileInfo(P.nodes, 'nodes.json（采集结果）');
fileInfo(join(P.out, 'data.js'), 'out/data.js（星图数据）');
fileInfo(join(P.out, 'zones.json'), 'out/zones.json（分域表）');
fileInfo(join(P.out, 'hidden.js'), 'out/hidden.js（隐藏层全文）');
fileInfo(join(P.out, 'sc-data.js'), 'out/sc-data.js（SurfCore 海）');

if (existsSync(P.nodes)) {
  try {
    const d = JSON.parse(readFileSync(P.nodes, 'utf8'));
    const src = {};
    for (const n of d.nodes || []) src[n.src] = (src[n.src] || 0) + 1;
    console.log('     节点 ' + (d.nodes || []).length + ' 条 · 会话 ' + (d.sessions || []).length + ' 个');
    console.log('     来源：' + Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  } catch (e) {
    line('✗', 'nodes.json 解析', String(e.message));
  }
}

// ── 4. 插件是否装上
console.log('\n【插件安装】');
const prof = join(process.env.USERPROFILE || '', '.dsh', 'profiles');
let found = null;
try {
  for (const p of readdirSync(prof)) {
    const t = join(prof, p, 'node_modules', '@local', 'dsh-plugin-sea');
    if (existsSync(t)) { found = { profile: p, path: t }; break; }
  }
} catch {}
line(found ? '✓' : '✗', 'dsh-plugin-sea', found ? 'profile「' + found.profile + '」已装' : '没装（页面还能双击 sea-build/out/index.html 打开，但没有插件按钮和 AI 工具）');

// ── 5. 检索配置
console.log('\n【检索配置】');
line(existsSync(CONFIG_FILE) ? '✓' : '·', 'sea.config.json', existsSync(CONFIG_FILE) ? CONFIG_FILE : '没有就用内置默认（同义词表 / 来源权重 / 返回条数）');

// ── 6. 结论
console.log('\n' + '─'.repeat(64));
const problems = [];
if (major < 18) problems.push('升级 Node.js 到 18 以上');
if (!sessN) problems.push('找不到会话归档：检查 paths.dsh 是不是指对了（改 sea.config.json）');
if (!existsSync(P.nodes)) problems.push('还没采集过：node sea-build/setup.mjs');
if (existsSync(P.nodes) && !existsSync(join(P.out, 'data.js'))) problems.push('还没算布局：node sea-build/layout.mjs');
if (!found) problems.push('插件没装：把 dsh-plugin-sea 放到 <profile>/node_modules/@local/ 下');

if (!problems.length) {
  console.log('一切正常。双击 sea-build/out/index.html 就能看，或在 DSH 里点左下角的 ✦。');
  console.log('数据要更新：node sea-build/setup.mjs（一条命令跑完整条管线）。');
} else {
  console.log('还差这几步：');
  problems.forEach((p, i) => console.log('  ' + (i + 1) + ') ' + p));
}
console.log('');
