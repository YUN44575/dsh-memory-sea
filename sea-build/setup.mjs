/**
 * 一键初始化 / 更新：把数据管线按正确顺序跑一遍。
 *
 *   node sea-build/setup.mjs
 *
 * 顺序：collect（会话 → nodes.json）→ layout（→ data.js + zones.json）
 *      → build_sc（SurfCore，有就做）→ match_bridge（两片海的重叠桥，有就做）
 *
 * 第一次装、换机器、或者"页面还是旧的"时跑它。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPaths } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const P = loadPaths();
const t0 = Date.now();

const step = (name, args, must = true) => {
  process.stdout.write('▸ ' + name + ' … ');
  const r = spawnSync(process.execPath, args, { cwd: HERE, encoding: 'utf8' });
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status !== 0) {
    console.log('失败');
    console.log((r.stderr || r.stdout || '').trim().split('\n').slice(-6).join('\n'));
    if (must) process.exit(r.status || 1);
    return false;
  }
  const out = (r.stdout || '').trim().split('\n').filter(Boolean);
  console.log('好（累计 ' + ms + ' 秒）');
  if (out.length) console.log(out.slice(-2).map((l) => '    ' + l).join('\n'));
  return true;
};

console.log('\n记忆意识海 · 更新数据\n' + '─'.repeat(52));
console.log('数据源：' + P.dsh + '\n');

if (!existsSync(P.sessions)) {
  console.error('✗ 找不到会话目录：' + P.sessions);
  console.error('  换个位置就改 sea-build/sea.config.json 的 paths.dsh，或设环境变量 DSH_HOME');
  process.exit(1);
}

step('采集会话 → nodes.json', [join(HERE, 'collect.mjs')]);
step('算布局 → data.js + zones.json', [join(HERE, 'layout.mjs')]);

if (existsSync(P.surfcore)) {
  step('SurfCore 那一片海', [join(HERE, 'build_sc.mjs')], false);
} else {
  console.log('▸ SurfCore … 跳过（这台机器没装）');
}

if (existsSync(join(P.out, 'sc-data.js'))) {
  step('两片海的重叠桥', [join(HERE, 'match_bridge.mjs')], false);
}

console.log('\n' + '─'.repeat(52));
console.log('完成，共 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒。刷新页面（浮层里点 ↻）就能看到。');
console.log('想确认状态：node sea-build/doctor.mjs\n');
