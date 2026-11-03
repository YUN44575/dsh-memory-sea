/**
 * 缩略图流水线：附件里的唯一 sha256 图片 → 480px jpg（并发 8）。
 *
 * 单独跑：
 *   node sea-build/thumbs.mjs
 * setup.mjs 也会调它（collect 之后、layout 之前），这样 data.js 里的 th 字段才有值。
 *
 * 依赖 ffmpeg。找不到就跳过（星图照常能看，只是没有图卡）——
 * 装好 ffmpeg 或设 SEA_FFMPEG=<路径>，再跑一次即可。
 */
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { loadPaths } from './paths.mjs';

/** ffmpeg 在哪：SEA_FFMPEG > PATH 里的 ffmpeg > 几个常见安装位置 */
export function findFfmpeg() {
  const env = String(process.env.SEA_FFMPEG || '').trim();
  if (env && existsSync(env)) return env;
  try {
    const w = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
    if (w.status === 0) {
      const first = String(w.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (first && existsSync(first)) return first;
    }
  } catch {}
  const cands = [
    join(process.env.USERPROFILE || process.env.HOME || '', '.agents', 'bin', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ];
  for (const c of cands) {
    try {
      if (c && existsSync(c)) return c;
    } catch {}
  }
  return '';
}

export async function makeThumbs({ quiet = false } = {}) {
  const P = loadPaths();
  const OBJ = P.objects;
  const OUT = join(P.out, 'thumbs');
  const FFMPEG = findFfmpeg();

  if (!existsSync(P.nodes)) {
    if (!quiet) console.log('跳过缩略图：还没生成 nodes.json（先跑 collect.mjs）');
    return { total: 0, done: 0, skip: 0, fail: 0, noFfmpeg: false };
  }
  const { nodes } = JSON.parse(readFileSync(P.nodes, 'utf8'));
  const shas = [...new Set((nodes || []).flatMap((n) => (n.imgs || []).map((i) => i.sha)))];
  if (!shas.length) {
    if (!quiet) console.log('缩略图：这些会话里没有图');
    return { total: 0, done: 0, skip: 0, fail: 0, noFfmpeg: false };
  }
  if (!FFMPEG) {
    if (!quiet) {
      console.log('跳过缩略图：没找到 ffmpeg（装一个 ffmpeg 或设 SEA_FFMPEG=路径，再跑一次就能出图卡）');
    }
    return { total: shas.length, done: 0, skip: 0, fail: 0, noFfmpeg: true };
  }

  mkdirSync(OUT, { recursive: true });
  const meta = {};
  let done = 0, skip = 0, fail = 0;
  const queue = [...shas];

  function runOne(sha) {
    return new Promise((resolve) => {
      const src = join(OBJ, sha.slice(0, 2), sha);
      const dst = join(OUT, sha + '.jpg');
      try {
        if (existsSync(dst) && statSync(dst).size > 500) {
          skip++;
          meta[sha] = { ok: 1 };
          return resolve();
        }
      } catch {}
      const p = spawn(FFMPEG, ['-y', '-v', 'error', '-i', src, '-vf', "scale='min(480,iw)':-2", '-q:v', '4', dst]);
      p.on('exit', (code) => {
        if (code === 0) {
          done++;
          meta[sha] = { ok: 1 };
        } else {
          fail++;
          meta[sha] = { ok: 0 };
        }
        resolve();
      });
      p.on('error', () => {
        fail++;
        meta[sha] = { ok: 0 };
        resolve();
      });
    });
  }

  async function worker() {
    while (queue.length) {
      const sha = queue.shift();
      await runOne(sha);
      if (!quiet && (done + skip + fail) % 100 === 0) console.log('  progress', done + skip + fail, '/', shas.length);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  if (!quiet) console.log('unique images:', shas.length, '| generated:', done, '| skipped:', skip, '| failed:', fail);
  return { total: shas.length, done, skip, fail };
}

// 直接跑：node sea-build/thumbs.mjs
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('thumbs.mjs')) {
  await makeThumbs();
}
