#!/usr/bin/env node
/**
 * mkdemo.mjs —— 生成一份「演示用」的数据目录（out-demo/）
 *
 * 为什么要有这个：README / 官网 / Release 里的截图不能出现任何真实对话内容。
 * 打码不可靠（正文会从别的角落漏出来），所以直接**基于真实结构的骨架、把所有文字换掉**：
 * 坐标、时间、来源、会话分组、岛、重复关系全部保留（星图看起来和真实的一模一样），
 * 只有「说了什么」是编的。
 *
 * 用法：node sea-build/mkdemo.mjs [--out <目录>]
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPaths } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const P = loadPaths();

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const OUTROOT = oi >= 0 ? args[oi + 1] : join(P.out, '..', 'out-demo');
const SRC = P.out;

mkdirSync(OUTROOT, { recursive: true });

// ---------- 示例文案 ----------
// 三类语气各准备一批，按节点的来源分配，让星图颜色和文字对得上。
const POOL = {
  user: [
    '这个功能我想做成能左右拖的那种，先看看最小改动要动哪儿。',
    '刚才那版有点太慢了，能不能只重算变动的部分？',
    '文档我写了一半，剩下的等接口定了再补。',
    '把昨天说的那个流程画成图会清楚很多。',
    '这个报错只在第二次打开的时候出现，第一次是好的。',
    '先不要动样式，只改逻辑，改完我再看一眼。',
    '我记得之前试过一个类似的方案，结果不太好，你找找看。',
    '周一的会推到下午吧，上午想先把这个弄完。',
    '这条数据是哪来的？我找不到出处。',
    '可以，就按你说的来，先跑一遍看看。',
    '把重复的部分合并掉，剩下的按时间排序。',
    '这个颜色有点扎眼，换成灰一点的。',
    '导出的文件里能不能带上日期？',
    '今晚先到这儿，明天继续。',
    '帮我把这段改短一点，意思不变。',
    '如果中途断了，下次还能接着跑吗？',
  ],
  assistant: [
    '看了一遍，问题在第 2 步：那里每次都重新算了一遍全量，其实只有一小部分变了。',
    '改好了，这次只重算变动的那部分，其余沿用上一次的结果。',
    '你说的那个方案我试了，两个地方不合适：一是不好回滚，二是后面加字段会很难。',
    '这里有个容易踩的地方——同一段内容如果分两次写，顺序会乱，得先存成一份再合并。',
    '我把它拆成了三个小步骤，每步都能单独验证，出错也容易定位。',
    '这个报错的原因是缓存没清，第二次读到的是上一次留下的状态。',
    '已经按时间排好了，最早的在上面；如果更想看最近的就倒过来。',
    '文档我起了一版，只写了结构和接口部分，细节等你确认完再补。',
    '颜色我调成了更灰的一档，对比度还在，但不那么跳。',
    '导出里加了日期，格式是 年-月-日，按你说的。',
    '这条数据来自 10 月 28 日那次记录，我顺着找到源头了。',
    '先跑一遍最小改动，确认没问题再合并，这样出问题也好退。',
    '我把重复的合并了，一共少了 39 条，剩下的按时间排好了。',
    '可以接着跑，上次的进度存在文件里了，断了也能从断点继续。',
    '这段我改短了，意思没变：只保留了结论和两个关键数字。',
    '建议先别动样式，等逻辑稳定了再统一调一遍。',
  ],
  qq: [
    '晚上吃什么？',
    '今天风好大，窗户一直响。',
    '我刚看到一个特别好玩的东西，晚点给你看。',
    '你先忙，忙完再说。',
    '外面下雨了，记得带伞。',
    '睡了吗？',
    '今天走了两万步，腿有点酸。',
    '我把那个杯子放回原位了。',
    '明天几点起？',
    '早点睡，别熬了。',
  ],
  'dsh-world-life': [
    '【我的时间】早上八点四十醒的，窗外的光比昨天亮一点，空气里有点凉。',
    '【我的时间】中午吃得很简单，一碗面，吃完在窗边坐了一会儿。',
    '【我的时间】下午三点多又看了一眼那个还没回的消息，还是没有。',
    '【我的时间】晚上九点，把昨天没看完的那段接着看完了。',
  ],
  'dsh-world-history': [
    '【旧事】那天说好要一起去的地方，后来一直没去成。',
    '【旧事】第一次见面的时候，外面的树刚发芽。',
    '【旧事】那次吵完之后，谁也没先开口，隔了两天才说话。',
  ],
  'world-diary': [
    '十点二十才醒，比说好的晚了快一个半小时。他把电脑开着，屏幕是亮的，人不在。',
    '中午我一个人吃了饭，把碗洗了，又把桌子擦了一遍。',
    '下午翻了一遍之前记的东西，有几条已经不太确定是不是真的发生过。',
    '晚上他回来了，说了几句就各自忙各自的。我把今天的事写在这里。',
    '外面起风了，窗户没关严，一直有响动。',
    '今天没做什么，只是把书架上的东西重新摆了一遍。',
  ],
  'agent-message': [
    'Agent 示例 · 调研结果】整理出了一份清单，共 12 条，重点是第 3 条和第 7 条。',
    'Team message from lead: 这一版整体可以，有两处要再确认：结尾的幅度和开头的留白。',
    'Team message from lead: 收到，改完请把四张图重新出一遍再看。',
  ],
  'fish-memory': [
    'ta 提过想把重复的部分合并掉，说看着乱。',
    'ta 不太喜欢太跳的颜色，偏爱灰一点、暗一点的。',
    'ta 习惯晚上处理这些事，白天多半在忙别的。',
  ],
};

const SESS_TITLES = [
  '项目排期与分工', '接口文档初稿', '昨天那个报错', '周末出行安排',
  '家里的书架', '音频处理脚本', '配色调整记录', '数据导出',
  '长距离的那次讨论', '月度回顾', '新机器上的第一次跑', '流程图画法',
  '重复条目清理', '一段很长的对话', '睡前闲聊', '关于时间的那件事',
  '把旧文件搬走', '第二次尝试', '收尾与检查', '一周小结',
  '那份没写完的说明', '换一种排法', '最后的几个细节', '关于那个决定',
  '整理旧照片', '慢下来的那几天', '一次不太顺利的尝试', '重新来过',
  '把话说明白', '夏天的傍晚', '清单与提醒', '最后一版',
];

// ---------- 读真实 data.js，保留骨架 ----------
const raw = readFileSync(join(SRC, 'data.js'), 'utf8');
const body = raw.slice(raw.indexOf('=') + 1).replace(/;\s*$/, '');
const SEA = JSON.parse(body);

// 按会话分配一个稳定的示例标题
const sessTitle = new Map();
SEA.sessions.forEach((sv, i) => {
  sessTitle.set(i, SESS_TITLES[i % SESS_TITLES.length] + (i >= SESS_TITLES.length ? ' ' + (Math.floor(i / SESS_TITLES.length) + 1) : ''));
});

const pick = (src, i) => {
  const pool = POOL[src] || POOL.user;
  return pool[i % pool.length];
};

Sea_nodes: {
  // 给每个会话一个「话题词」，让同一会话里的句子有联系（不是完全随机）
  const topic = new Map();
  SEA.sessions.forEach((sv, i) => topic.set(i, i % POOL.user.length));

  SEA.nodes.forEach((n, i) => {
    const src = n.s || 'user';
    const base = pick(src, n.sid * 7 + i);
    const t = topic.get(n.sid) ?? 0;
    // 正文：把两句拼起来（长度随机在 20~160 字之间）
    const extra = (src === 'assistant' || src === 'user') ? ' ' + pick(src, t + i + 3) : '';
    n.txt = (base + extra).slice(0, 160);
    n.kw = [];                 // 关键词清空：搜索是 bigram，重建会带出真实词
    n.hu = 0;                  // 没有缩略图
    n.th = null;
    n.ic = 0;
    n.ar = n.ar ? 1 : 0;
    if (n.sender) n.sender = '';
    n.rl = n.txt.length;
  });

  // 会话标题 / 路径
  SEA.sessions.forEach((sv, i) => {
    sv.title = sessTitle.get(i);
    sv.label = sessTitle.get(i);
    sv.cwd = 'C:/demo/workspace/' + (i % 3 === 0 ? 'notes' : i % 3 === 1 ? 'work' : 'life');
    sv.ws = ['示例 · 项目', '示例 · 日常', '示例 · 杂记'][i % 3];
  });

  // 隐藏层样本也换掉（面板里会显示 3 条）
  if (Array.isArray(SEA.sys)) {
    SEA.sys.forEach((k, i) => {
      k.samples = [
        '<system-reminder> 示例：这里是系统注入的提示，不参与星图，只在这里列出来给你看。',
        '示例：定时提醒 —— 每天 09:00 整理一次今天的记录。',
        '示例：审批流水 —— 某次操作被确认（只会记下来，不会影响你的数据）。',
      ].slice(0, 3);
      k.n = 3 + i * 7;
    });
  }
  if (SEA.islands) SEA.islands.forEach(it => { it.name = ''; });
  if (SEA.parked) SEA.parked.forEach(p => { p.title = '空白会话 ' + (p.lines || 0) + ' 行'; p.cwd = 'C:/demo/workspace'; });
  SEA.builtAt = Date.now();
  SEA.tx = { n: 0, chars: 0 };
}

writeFileSync(join(OUTROOT, 'data.js'), 'window.SEA=' + JSON.stringify(SEA) + ';', 'utf8');
writeFileSync(join(OUTROOT, 'texts.js'), 'window.SEA_TX={};', 'utf8');
writeFileSync(join(OUTROOT, 'hidden.js'), 'window.SEA_SYS=[];', 'utf8');
writeFileSync(join(OUTROOT, 'sc-data.js'), 'window.SC=null;', 'utf8');
writeFileSync(join(OUTROOT, 'bridge.js'), 'window.SEA_BRIDGE=[];', 'utf8');
writeFileSync(join(OUTROOT, 'version.js'), 'window.SEA_VER=0;', 'utf8');
writeFileSync(join(OUTROOT, 'zones.json'), JSON.stringify({ builtAt: Date.now(), zones: {} }), 'utf8');

// 页面本体直接复用（file:// 下不能 fetch，所有数据都是 script 标签）
copyFileSync(join(SRC, 'index.html'), join(OUTROOT, 'index.html'));
try {
  if (existsSync(join(SRC, 'thumbs'))) {
    mkdirSync(join(OUTROOT, 'thumbs'), { recursive: true });
  }
} catch {}

console.log('demo data written to', OUTROOT);
console.log('  nodes', SEA.nodes.length, '| sessions', SEA.sessions.length, '| islands', (SEA.islands || []).length);
