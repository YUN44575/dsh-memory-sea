/**
 * 路径解析：让这套东西在**别人的机器 / 别人的 DSH** 上也能跑。
 *
 * 规则（按优先级）：
 *   1. `sea.config.json` 里的 paths（想改就改这文件，不用碰代码）
 *   2. 环境变量 DSH_HOME（有些人把 .dsh 放到别的盘）
 *   3. 自动探测：<用户目录>/.dsh
 *
 * 采集/布局脚本都从这里拿路径，不再写死 C:\Users\xxx。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const HERE = dirname(fileURLToPath(import.meta.url)); // sea-build/
export const OUT_DIR = join(HERE, 'out');
export const CONFIG_FILE = join(HERE, 'sea.config.json');

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * 数据目录放哪。
 *  - 本地开发（仓库里的 sea-build/out 已经有 data.js）：继续用本地的，双击 index.html 就能看
 *  - 装成插件后：sea-build/out 只是壳子（没有 data.js），数据写到 ~/.dsh/sea-out
 *    这一条很重要 —— 插件更新/重装会把 node_modules/dsh-memory-sea 整个换掉，
 *    数据如果写在里面，每次升级记忆都会被清空。
 */
function pickOut(dsh) {
  const env = String(process.env.SEA_DATA_DIR || '').trim();
  if (env) return resolve(env);
  if (existsSync(join(OUT_DIR, 'data.js'))) return OUT_DIR;
  return join(dsh, 'sea-out');
}

/** 候选：配置里写的 > DSH_HOME > <用户目录>/.dsh */
function pickDsh(cfg) {
  const cands = [];
  if (cfg.dsh) cands.push(cfg.dsh);
  if (process.env.DSH_HOME) cands.push(process.env.DSH_HOME);
  cands.push(join(process.env.USERPROFILE || homedir(), '.dsh'));
  for (const c of cands) if (existsSync(c)) return resolve(c);
  return resolve(cands[cands.length - 1]);
}

export function loadPaths() {
  const cfg = readConfig();
  const p = cfg.paths || {};
  const dsh = pickDsh(p);
  const j = (...a) => join(dsh, ...a);
  const out = p.out || pickOut(dsh);
  return {
    dsh,
    sessions: p.sessions || j('sessions'),
    // 附件对象：DSH 存的 sha 文件；有些人的 .dsh/attachments 是指到别的盘的软链，这里只认 posix 风格的 v1/objects
    objects: p.objects || j('attachments', 'v1', 'objects'),
    fishMemory: p.fishMemory || j('fish-memory'),
    worlds: p.worlds || j('worlds', 'default'),
    surfcore: p.surfcore || j('surfcore'),
    // 中间产物 nodes.json 跟着数据目录走（本地是 sea-build/nodes.json，插件是 ~/.dsh/nodes.json）
    nodes: p.nodes || join(dirname(out), 'nodes.json'),
    out,
    config: CONFIG_FILE,
  };
}

/** 存在性检查，doctor 用 */
export function probe(paths) {
  const need = [
    ['DSH 会话目录', paths.sessions, true],
    ['附件对象目录', paths.objects, false],
    ['fish-memory（长期记忆）', paths.fishMemory, false],
    ['worlds/default（世界日记）', paths.worlds, false],
    ['surfcore（第二片海）', paths.surfcore, false],
  ];
  return need.map(([name, p, must]) => ({ name, path: p, must, ok: existsSync(p) }));
}
