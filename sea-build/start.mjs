// 一键启动：实时守护 + 打开意识海
// 用法：双击 启动意识海.cmd，或 node sea-build/watch.mjs
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { OUT_DIR } from './paths.mjs';

spawn('cmd', ['/c', 'start', '', join(OUT_DIR, 'index.html')], { detached: true, stdio: 'ignore' }).unref();
console.log('已打开意识海');
await import('./watch.mjs');
