// 把 src/ 拼回 out/index.html。产物仍是单文件、双击就能开 —— 拆开只是为了改起来不打架。
//
//   node build.mjs           拼一次
//   node build.mjs --check   只比对，不写盘（CI / 提交前用）
//
// 拼接顺序 = src/js/ 下的文件名排序。文件名前面那三位数是序号（010、020…），
// 加了新文件就按同样格式起名，避免顺序漂移。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'src');
const OUT = join(HERE, 'out', 'index.html');

const shell = readFileSync(join(SRC, 'shell.html'), 'utf8');
const css = readFileSync(join(SRC, 'style.css'), 'utf8');

const jsDir = join(SRC, 'js');
const names = readdirSync(jsDir)
  .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
  .sort();
if (!names.length) throw new Error('src/js/ 里没有脚本');
// 序号必须是递增的，否则拼出来的顺序和读代码时的顺序对不上
for (let i = 1; i < names.length; i++) {
  const a = parseInt(names[i - 1], 10);
  const b = parseInt(names[i], 10);
  if (!(b > a)) throw new Error(`脚本序号不递增：${names[i - 1]} → ${names[i]}`);
}
const js = names.map((f) => readFileSync(join(jsDir, f), 'utf8')).join('\n');

const html = shell.replace('/*@@CSS@@*/', () => css).replace('/*@@JS@@*/', () => js);

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) {
    console.error('out/index.html 不存在，先跑一次 node build.mjs');
    process.exit(1);
  }
  const cur = readFileSync(OUT, 'utf8');
  if (cur === html) {
    console.log(`✓ 一致：${names.length} 个脚本，${(html.length / 1024).toFixed(0)} KB`);
    process.exit(0);
  }
  // 找出第一处差异，方便定位
  let i = 0;
  while (i < cur.length && i < html.length && cur[i] === html[i]) i++;
  const around = (s) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60));
  console.error(`✗ 产物和 src/ 不一致，第一处差异在 ${i}\n  产物: ${around(cur)}\n  src : ${around(html)}`);
  process.exit(1);
}

writeFileSync(OUT, html, 'utf8');
console.log(`✓ 已生成 out/index.html · ${names.length} 个脚本 · ${(html.length / 1024).toFixed(0)} KB`);
