/**
 * 一条命令装好：把插件登记进 DSH profile，顺手把数据生成出来。
 *
 *   node sea-build/install.mjs                 # 默认 profile = desktop
 *   node sea-build/install.mjs --profile web   # 换个 profile
 *   node sea-build/install.mjs --copy          # 复制而不是软链（想冻结版本时用）
 *   node sea-build/install.mjs --skip-setup    # 只装插件，不重建数据
 *   node sea-build/install.mjs --dry           # 只看会改什么，不动文件
 *
 * 它会改 profile 的 package.json 两处（都先备份 .bak）：
 *   1. dependencies 里加 `link:` 指向本插件目录
 *   2. dsh.profile.bundles 数组里加这个包名
 * 它**不跑 pnpm install** —— 那是包管理器的事，脚本只负责把清单改对。
 */
import { existsSync, mkdirSync, symlinkSync, readFileSync, writeFileSync, cpSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPaths, HERE } from './paths.mjs';

const PKG = '@local/dsh-plugin-sea';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const profile = opt('profile', 'desktop');
const useCopy = flag('copy');
const skipSetup = flag('skip-setup');
const dry = flag('dry');

const P = loadPaths();
const SRC = join(HERE, '..', 'dsh-plugin-sea');
const PROFILE_DIR = join(P.dsh, 'profiles', profile);
const MODULES = join(PROFILE_DIR, 'node_modules', '@local', 'dsh-plugin-sea');
const PKG_FILE = join(PROFILE_DIR, 'package.json');

const line = (s) => console.log(s);
const ok = (s) => console.log('  ✓ ' + s);
const warn = (s) => console.log('  ! ' + s);
const bad = (s) => console.log('  ✗ ' + s);

line('\n记忆意识海 · 安装');
line('─'.repeat(58));
line('  DSH：      ' + P.dsh);
line('  插件源：   ' + SRC);
line('  profile：  ' + profile + (dry ? '（演练模式，不改文件）' : ''));
line('');

// ── 1. 前置
if (!existsSync(SRC)) {
  bad('找不到插件目录：' + SRC);
  line('    install.mjs 必须在 sea-build/ 里跑，且 dsh-plugin-sea/ 要和它同级。');
  process.exit(1);
}
if (!existsSync(PKG_FILE)) {
  bad('找不到 profile 的 package.json：' + PKG_FILE);
  try {
    const { readdirSync } = await import('node:fs');
    line('    已有哪些 profile：' + readdirSync(join(P.dsh, 'profiles')).join(' · '));
  } catch {}
  line('    用 --profile <名字> 指定。');
  process.exit(1);
}
ok('插件目录、profile 的 package.json 都在');

const pkg = JSON.parse(readFileSync(PKG_FILE, 'utf8'));
pkg.dependencies ||= {};
pkg.dsh ||= {};
pkg.dsh.profile ||= {};
pkg.dsh.profile.bundles ||= [];

// ── 2. package.json 两处登记
const linkTarget = 'link:' + SRC.replace(/\\/g, '/');
let changed = false;

if (pkg.dependencies[PKG] === linkTarget) {
  ok('dependencies 里已登记（link 指向本目录）');
} else if (pkg.dependencies[PKG]) {
  if (flag('force')) {
    pkg.dependencies[PKG] = linkTarget;
    changed = true;
    ok('dependencies 里那一份指向别处，已改成本目录（--force）');
  } else {
    warn('dependencies 里已有一份，但指向别处：' + pkg.dependencies[PKG]);
    line('    目录搬过家的话加 --force 让它改成本目录，或手动改那一行。');
  }
} else {
  pkg.dependencies[PKG] = linkTarget;
  changed = true;
  ok('dependencies 加上 ' + PKG + ' → ' + linkTarget);
}

if (pkg.dsh.profile.bundles.includes(PKG)) {
  ok('bundles 里已登记');
} else {
  pkg.dsh.profile.bundles.push(PKG);
  changed = true;
  ok('bundles 加上 ' + PKG);
}

if (changed) {
  if (dry) {
    line('\n  （演练模式）会写回：' + PKG_FILE);
  } else {
    const bak = PKG_FILE + '.bak-sea-' + Date.now();
    copyFileSync(PKG_FILE, bak);
    writeFileSync(PKG_FILE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    ok('已写回（备份：' + bak.replace(/.*[\\/]/, '') + '）');
  }
} else {
  ok('package.json 不用改');
}

// ── 3. node_modules 里挂好（pnpm 装 link: 依赖时会做，这里先手挂一次防呆）
if (existsSync(MODULES)) {
  ok('node_modules 里已就位');
} else if (dry) {
  line('\n  （演练模式）会创建：' + MODULES);
} else {
  try {
    mkdirSync(join(PROFILE_DIR, 'node_modules', '@local'), { recursive: true });
    if (useCopy) cpSync(SRC, MODULES, { recursive: true });
    else symlinkSync(SRC, MODULES, 'junction');   // junction 不需要管理员权限
    ok((useCopy ? '复制' : '软链') + '到 node_modules 完成');
  } catch (e) {
    warn('手挂失败（不影响，pnpm install 会做）：' + e.message);
    line('    Windows 上如果软链被拒，改用：node sea-build/install.mjs --copy');
  }
}

// ── 4. 生成数据
if (skipSetup || dry) {
  warn('跳过数据生成（' + (dry ? '演练模式' : '--skip-setup') + '）');
} else {
  line('\n▸ 生成数据（约 10 秒）…');
  const r = spawnSync(process.execPath, [join(HERE, 'setup.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) bad('数据生成失败，可以单独跑：node sea-build/setup.mjs');
  else ok('数据生成完成');
}

// ── 5. 收尾
line('');
line('─'.repeat(58));
if (changed && !dry) {
  line('还差一步：让 pnpm 把依赖装上，然后**重启 DSH**');
  line('    cd "' + PROFILE_DIR + '" && pnpm install');
  line('  （如果 DSH 启动时会自己装，直接重启也行）');
} else {
  line('重启 DSH 就能看到（改 index.js 必须重启；之后改界面点浮层里的 ↻ 就行）。');
}
line('装好后：左下角 ✦ 打开星图；DSH 会话里多出五个工具（sea_recall / sea_day / …）。');
line('');
line('自检：node sea-build/doctor.mjs');
line('');
