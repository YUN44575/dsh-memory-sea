// DSH 记忆意识海 · 实时更新守护
// 监听会话存档目录，有新消息就重跑采集 + 布局，页面自己会热更新
// 用法：node sea-build/watch.mjs
import { watch, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadPaths, HERE, OUT_DIR } from './paths.mjs';

const P = loadPaths();

const SESSIONS = P.sessions;
// SurfCore 角色记忆卡（鲸鲸在 QQ 那边记下来的事），变了也重建
const SCMEM = join(P.surfcore, 'characters');
const ROOT = HERE;          // 下面各步都在 sea-build/ 里跑
const OUTDIR = OUT_DIR;
const DEBOUNCE = 8000;      // 停下 8 秒再跑，避免写一半就读

let timer = null;
let running = false;
let pending = false;

function log(...a) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log('[' + t + ']', ...a);
}

function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.on('data', () => {});
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(err || ('exit ' + code)))));
  });
}

async function rebuild() {
  if (running) { pending = true; return; }
  running = true;
  const t0 = Date.now();
  try {
    await run(process.execPath, [join(HERE, 'collect.mjs')]);
    await run(process.execPath, [join(HERE, 'layout.mjs')]);
    try { await run(process.execPath, [join(HERE, 'build_sc.mjs')]); }
    catch (e) { log('SurfCore 记忆卡没读到，跳过：' + e.message.slice(0, 120)); }
    log('重建完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  } catch (e) {
    log('重建失败：' + e.message.slice(0, 200));
  }
  running = false;
  if (pending) { pending = false; schedule(); }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; rebuild(); }, DEBOUNCE);
}

// 改了 index.html 就让页面自己刷新：页面每 15 秒轮询 version.js，版本号一变就 reload
function bumpVersion(reason) {
  const body = 'window.SEA_VER="' + Date.now() + '";\n';
  try {
    writeFileSync(join(OUTDIR, 'version.js'), body);
    log(reason + '，通知页面刷新');
  } catch (e) {
    log('通知页面刷新失败：' + e.message);
  }
}

log('开始监听会话存档 + SurfCore 记忆卡 + 界面文件…');

try {
  watch(SESSIONS, { recursive: true }, (ev, file) => {
    if (!file || !file.endsWith('.jsonl.zstd')) return;
    log('检测到变化：' + file.slice(0, 60));
    schedule();
  });
} catch (e) {
  log('会话存档监听失败：' + e.message);
  process.exit(1);
}

// SurfCore 的记忆卡
try {
  watch(SCMEM, { recursive: true }, (ev, file) => {
    if (!file) return;
    if (!/memory-card.*\.(json|jsonl)$/.test(file)) return;
    log('检测到 SurfCore 记忆变化：' + file.slice(-40));
    schedule();
  });
} catch (e) {
  log('SurfCore 监听失败（不影响会话那边）：' + e.message);
}

// 界面文件本身：只打日志，不再通知页面刷新。
// 以前这里会让页面弹出「海更新了」，但改界面的频率远高于数据变化，
// 提示就变成了噪音 —— 现在插件里右下角有 ⟳，想看重载点一下就行。
let bumping = false;
try {
  watch(OUTDIR, (ev, file) => {
    if (file !== 'index.html') return;
    if (bumping) return;
    bumping = true;
    setTimeout(() => { bumping = false; }, 1500);
    log('界面文件变了（点右下角 ⟳ 重新加载就能看到）');
  });
} catch (e) {
  log('out 目录监听失败：' + e.message);
}
