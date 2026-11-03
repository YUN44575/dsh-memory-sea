/**
 * 记忆意识海 · Host 半
 *
 * 三件事：
 *   1. 静态服务：把 sea-build/out/ 整目录以 `/sea` 前缀服务出去（iframe 靠它加载）
 *   2. 管理态持久化：`/sea/api/marks` 读写 sea-build/marks.json
 *      —— 以前收藏/标签/备注/归档全在 localStorage，而 file:// 与 http:// 不同源，
 *         双击打开和插件里打开是**两套管理**；现在有个真文件，两边共用一份。
 *   3. AI 记忆工具：`sea_recall` / `sea_day` / `sea_sessions`
 *      —— 让会话里的我**查得到**自己的历史（不只给人看，也是我的记忆外脑）。
 *         数据源是管线产物 nodes.json / hidden.js，只读，不碰原始会话。
 *
 * ⚠ 改了本文件要**重启 DSH** 才生效（插件 host 半在进程启动时加载）；
 *   改 out/index.html、client.js 不用重启，浮层里点 ↻ 就行。
 */
import { createReadStream, existsSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, search, explain } from './search.js';

export const inject = ['webServer', 'tools'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

// ───────────────────────────────────────────── 来源中文名（工具输出里用）
const SRC_NAME = {
  user: '你说的话',
  assistant: '我的回复',
  qq: 'QQ 聊天',
  'agent-message': '团队协作',
  'dsh-world-life': '世界·生活',
  'dsh-world-history': '世界·旧事',
  'world-diary': '世界·日记',
  'fish-memory': '长期记忆',
};

// ───────────────────────────────────────────── 检索用的默认配置
// 想改词表/权重不用改代码：在数据目录旁放一份 sea.config.json（见 sea-build/sea.config.json）
const DEFAULT_SYNONYMS = {
  语音: ['音色', '声音', '音频', 'TTS', 'RVC'],
  声音: ['语音', '音色', '音频', 'TTS'],
  修好: ['修复', '解决', '改好'],
  报错: ['错误', '异常', '失败', 'error', '崩溃'],
  崩溃: ['闪退', '挂了', '报错', '失败'],
  闪退: ['崩溃', '挂了', '报错'],
  插件: ['plugin', '扩展'],
  记忆: ['回忆', '记住', '记得'],
  回忆: ['记忆', '想起', '记得'],
  图片: ['图', '截图', '表情包', '照片'],
  照片: ['图片', '截图', '相片'],
  早安: ['早上好', '起来了', '睡醒'],
  晚安: ['睡了', '睡吧', '明天见'],
  抱抱: ['贴贴', '抱住'],
  笔记: ['文档', '记录'],
};
// 这些来源天然是噪音（世界心跳/系统注入），检索时降权
const DEFAULT_SRC_WEIGHT = { 'dsh-world-life': 0.35, 'dsh-world-history': 0.35 };
const DEFAULT_RECALL = { limit: 5, briefChars: 160, fullChars: 700, minRel: 0.3, topK: 100 };

// ───────────────────────────────────────────── 数据读取（带 60 秒缓存）
const DATA_TTL = 60 * 1000;

function makeDataReader(root) {
  let cache = null;
  let cacheAt = 0;

  /** nodes.json 在 out 的上一级；找不到就退回 out 里 */
  async function findNodes() {
    const cands = [join(root, '..', 'nodes.json'), join(root, 'nodes.json')];
    for (const p of cands) {
      try {
        const st = await fsp.stat(p);
        if (st.isFile()) return p;
      } catch {}
    }
    return null;
  }

  /** 分域表（layout.mjs 吐的 zones.json）：sid → 0 工作 / 1 陪伴。读不到就当全工作。 */
  async function loadZones() {
    try {
      const raw = await fsp.readFile(join(root, 'zones.json'), 'utf8');
      const z = JSON.parse(raw);
      return z && z.zones ? z.zones : {};
    } catch {
      return {};
    }
  }

  async function load() {
    const now = Date.now();
    if (cache && now - cacheAt < DATA_TTL) return cache;
    const file = await findNodes();
    if (!file) throw new Error('找不到 nodes.json（先跑一次 collect + layout）');
    const raw = await fsp.readFile(file, 'utf8');
    const d = JSON.parse(raw);
    cache = {
      builtAt: d.builtAt || 0,
      nodes: Array.isArray(d.nodes) ? d.nodes : [],
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      sys: Array.isArray(d.sys) ? d.sys : [],
      proc: d.proc || { think: 0, tool: 0 },
      zones: await loadZones(),
      file,
    };
    cacheAt = now;
    return cache;
  }

  /** 系统消息全文（hidden.js 是 `window.SEA_SYS=...`，剥前缀再解析） */
  let sysAll = null;
  let sysAllAt = 0;
  async function loadSysAll() {
    const now = Date.now();
    if (sysAll && now - sysAllAt < DATA_TTL) return sysAll;
    try {
      const raw = await fsp.readFile(join(root, 'hidden.js'), 'utf8');
      const i = raw.indexOf('=');
      const json = i >= 0 ? raw.slice(i + 1).replace(/;\s*$/, '') : raw;
      sysAll = JSON.parse(json);
    } catch {
      sysAll = [];
    }
    sysAllAt = now;
    return sysAll;
  }

  /** BM25 索引：跟着 nodes 走，nodes 刷新后自动重建（1614 节点约 40ms，可接受） */
  let index = null;
  let indexAt = 0;
  async function loadIndex() {
    const d = await load();
    if (index && indexAt === cacheAt) return index;
    index = buildIndex(d.nodes);
    indexAt = cacheAt;
    return index;
  }

  /** 用户配置：数据目录旁放一份 sea.config.json 就能改词表 / 权重 / 默认条数 */
  let cfg = null;
  async function loadConfig() {
    if (cfg) return cfg;
    let user = {};
    for (const p of [join(root, '..', 'sea.config.json'), join(root, 'sea.config.json')]) {
      try {
        user = JSON.parse(await fsp.readFile(p, 'utf8'));
        break;
      } catch {}
    }
    // 配置里以 `_` 开头的键是给人看的注释（`_说明`），不能混进参数表，
    // 否则 srcWeight 里会多出字符串值，算权重时变成 NaN。
    const strip = (o) => {
      const r = {};
      for (const [k, v] of Object.entries(o || {})) if (!k.startsWith('_')) r[k] = v;
      return r;
    };
    cfg = {
      synonyms: { ...DEFAULT_SYNONYMS, ...strip(user.synonyms) },
      srcWeight: { ...DEFAULT_SRC_WEIGHT, ...strip(user.srcWeight) },
      recall: { ...DEFAULT_RECALL, ...strip(user.recall) },
    };
    return cfg;
  }

  /**
   * SurfCore 记忆卡（另一片海）。语义完全不同：不是"说过的原话"，
   * 是把事记下来之后的一条记忆，会随时间衰减变模糊（clarity）——
   * 所以它单独一个工具，不混进 sea_recall。
   */
  let surf = null;
  let surfAt = 0;
  async function loadSurf() {
    const now = Date.now();
    if (surf !== null && now - surfAt < DATA_TTL) return surf;
    surf = null;
    for (const p of [join(root, 'sc-data.js'), join(root, '..', 'sc-data.js')]) {
      try {
        const raw = await fsp.readFile(p, 'utf8');
        const i = raw.indexOf('window.SC');
        const eq = raw.indexOf('=', i);
        if (eq < 0) continue;
        surf = JSON.parse(raw.slice(eq + 1).replace(/;\s*$/, ''));
        break;
      } catch {}
    }
    surfAt = now;
    return surf;
  }

  return { load, loadSysAll, loadIndex, loadConfig, loadSurf };
}

const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayMs = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
};
const clock = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

/** 正文里的 markdown 符号剥掉：这些原话是我自己写的，带 ## ** 之类的标记，塞进上下文很吵 */
function plainText(s, n) {
  const t = String(s || '')
    .replace(/```[\s\S]*?```/g, '〔代码〕')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '· ')
    .replace(/\|/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((x) => x.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/** 节点 id（session-xxxx-...:seq）→ 短 id（xxxx:seq）。给 AI 引用某一条用 */
function shortId(id) {
  const m = /^session-([0-9a-f]{8})[^:]*:(\d+)$/i.exec(String(id || ''));
  if (m) return m[1] + ':' + m[2];
  const s = String(id || '');
  return s.length > 24 ? s.slice(-12) : s;
}

/** 短 id → nodes 下标（也允许传全长 id） */
function resolveShortId(short, nodes) {
  const want = String(short || '').trim().toLowerCase().replace(/^#/, '');
  if (!want) return -1;
  for (let i = 0; i < nodes.length; i++) {
    const id = nodes[i] && nodes[i].id;
    if (!id) continue;
    const full = String(id).toLowerCase();
    if (full === want) return i;
    if (shortId(full) === want) return i;
  }
  return -1;
}

/**
 * SurfCore 记忆卡的 txt 是 `title

正文`，展示时把重复的 title 剥掉
 */
function bodyOf(n) {
  const t = String(n.txt || '').trim();
  const ti = String(n.title || '').trim();
  if (ti && t.startsWith(ti)) return t.slice(ti.length).replace(/^\s+/, '') || t;
  return t;
}

/**
 * 会话标题索引：sid → 可读标题（工具输出里"这是哪段对话"）
 */
function sessionTitles(sessions) {
  const m = new Map();
  for (const s of sessions) {
    const t = String(s.title || '').trim();
    m.set(s.id, t || (String(s.cwd || '').split(/[\\/]/).filter(Boolean).pop() || '未命名会话'));
  }
  return m;
}

// ───────────────────────────────────────────── 三个工具
/** 查某个会话属于哪片海：0=工作 1=陪伴；查不到返回 undefined。
 *  注意 zones.json 的键有两种写法（长的 `session-xxx-uuid` 和裸 uuid），两边都试。 */
function zoneOf(zones, sid) {
  if (!zones || !sid) return undefined;
  const k = String(sid);
  if (zones[k] === 0 || zones[k] === 1) return zones[k];
  const bare = k.replace(/^session-/, '');
  if (zones[bare] === 0 || zones[bare] === 1) return zones[bare];
  const withP = 'session-' + bare;
  if (zones[withP] === 0 || zones[withP] === 1) return zones[withP];
  return undefined;
}

/** 当前这次调用是哪个会话发起的（不同地方叫法不一样，逐个试） */
function execSessionId(exec) {
  if (!exec) return '';
  return String(exec.sessionId || exec.sessionKey || (exec.session && (exec.session.id || exec.session.sessionId)) || '');
}

/** 上一次 sea_recall 的结果，按会话分桶：refine=true 时"在上次那几条里再筛" */
const lastRecall = new Map();
const REFINE_TTL = 5 * 60 * 1000;

function makeTools(reader, caps = {}, marks = null) {
  const defer = (fn) => fn; // defineTool 等价实现：spec 形状原样交给 tools 服务

  const recall = defer({
    name: 'sea_recall',
    description:
      '在「记忆意识海」里回忆：按关键词、来源或时间段，翻出真实原话（你说的 / 我说的 / QQ 的 / 团队协作的 / 世界日记）。' +
      '**这是我自己的历史记忆库**——想不起来某件事、想引用当时的原话、想确认某个约定或数字时用它，' +
      '不要凭印象编。返回按时间倒序，每条都带日期、来源、所在会话，以及它属于哪片海（工作 / 陪伴）。' +
      '查询用 BM25 检索：几个词不用全中也能排序命中，同一件事换个说法（如「语音包」和「音频包」）也能找到；' +
      '每条结果还会告诉你「为什么命中」。想省上下文用 detail=brief（默认，每条摘要），想引原话用 detail=full。' +
      '意识海分两片：工作海和陪伴海。默认两片都查（免得漏），每条结果都标了 sea；' +
      '如果你现在是在工作场景里查工作的事、或者明确只要陪聊那段，用 scope 收窄，别把陪聊的话当成工作结论。',
    parameters: {
      q: {
        type: 'string',
        description: '关键词。可以给多个（空格分开，全部命中）。留空 = 只按时间和来源筛。',
      },
      src: {
        type: 'string',
        description:
          '可选，只看某个来源：user=你说的、assistant=我说的、qq=QQ聊天、agent-message=团队协作、' +
          'dsh-world-life=世界生活、dsh-world-history=世界旧事、world-diary=世界日记、fish-memory=长期记忆。',
      },
      scope: {
        type: 'string',
        description:
          '可选，只在哪片海里找：auto=按当前会话自动判（默认）——在工作会话里只翻工作海、在陪伴会话里只翻陪伴海；' +
          'work=只翻工作海；companion=只翻陪伴海（鲸鲸的房间 / QQ / 世界日记）；all=两片一起翻。' +
          '用户明确说"翻翻之前聊天的/陪伴的记录"时用 all。',
      },
      since: { type: 'string', description: '可选，起始日期 YYYY-MM-DD（含当天）。' },
      until: { type: 'string', description: '可选，结束日期 YYYY-MM-DD（含当天）。' },
      detail: {
        type: 'string',
        description: '可选，返回多少原文：brief=摘要（默认，每条约 160 字，适合先扫一眼）、full=全文（每条约 700 字，适合要引用原话）。',
      },
      limit: { type: 'number', description: '最多返回几条。brief 默认 5（上限 20），full 默认 4（上限 10）。' },
      refine: {
        type: 'boolean',
        description:
          '可选，在上一次 sea_recall 的结果里再筛（用户说"上次那个""里面再看""再细一点"时用）。' +
          '只在 5 分钟内有效，且只对同一个会话生效。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          n: { type: 'number' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                time: { type: 'string' },
                src: { type: 'string' },
                sea: { type: 'string' },
                session: { type: 'string' },
                why: { type: 'string' },
                img: { type: 'number' },
                text: { type: 'string' },
              },
            },
          },
        },
      },
      render(_args, value) {
        if (!value || value.ok === false) return [{ type: 'text', text: '✗ ' + String(value?.message || '没查到') }];
        if (!value.items || !value.items.length) return [{ type: 'text', text: '（没有匹配的记忆）' }];
        const lines = value.items.map(
          (it) =>
            `· ${it.time} · ${it.src} · ${it.sea} · ${it.session}` +
            (it.id ? ` · #${it.id}` : '') +
            (it.img ? ' · 带图' : '') +
            (it.why ? `\n  〔${it.why}〕` : '') +
            `\n  ${it.text}`,
        );
        return [{ type: 'text', text: value.items.length + ' 条：\n' + lines.join('\n') }];
      },
    },
    async execute(args, exec) {
      const d = await reader.load();
      const cfg = await reader.loadConfig();
      const titles = sessionTitles(d.sessions);
      const rawQ = String(args.q || '').trim();

      // 多轮：refine=true 时把候选收窄到"上一次返回的那几条"
      const rkey = String((exec && (exec.sessionId || exec.id || exec.session)) || 'default');
      const prev = lastRecall.get(rkey);
      const canRefine = !!(args.refine && prev && Date.now() - prev.at < REFINE_TTL && prev.ids.size);
      const refineSet = canRefine ? prev.ids : null;
      const src = String(args.src || '').trim();
      let scope = String(args.scope || '').trim().toLowerCase();
      const zones = d.zones || {};

      // scope 默认 auto：按"发起这次调用的会话属于哪片海"自动收窄。
      // 工作会话里不该随便翻出陪聊内容；要跨海看，显式传 scope=all。
      let scopeAuto = false;
      if (!scope || scope === 'auto') {
        const z = zoneOf(zones, execSessionId(exec));
        if (z === 1) { scope = 'companion'; scopeAuto = true; }
        else if (z === 0) { scope = 'work'; scopeAuto = true; }
        else scope = ''; // 认不出来（新会话 / 子会话还没归档）：两片都查
      }

      const t0 = dayMs(args.since);
      const t1 = dayMs(args.until);
      const t1End = t1 == null ? null : t1 + 24 * 3600 * 1000 - 1;
      const full = String(args.detail || '').trim().toLowerCase() === 'full';
      const cap = full ? cfg.recall.fullChars : cfg.recall.briefChars;
      const defLimit = full ? 4 : cfg.recall.limit;
      const limit = Math.max(1, Math.min(full ? 10 : 20, Number(args.limit) || defLimit));

      /** 来源 / 分域 / 时间 三重过滤：先筛，再排序，免得把不太相关的也塞进上下文 */
      const pass = (n) => {
        if (refineSet && !refineSet.has(n.id)) return false;
        if (src && n.src !== src) return false;
        const zone = zones[n.sid] === 1 ? 1 : 0;
        if (scope === 'work' && zone === 1) return false;
        if (scope === 'companion' && zone !== 1) return false;
        if (t0 != null && n.time < t0) return false;
        if (t1End != null && n.time > t1End) return false;
        return true;
      };

      let picked = [];
      if (rawQ) {
        // 有查询词：BM25 + 同义词 + 原文整串加权；多取几倍，后面要去重
        const idx = await reader.loadIndex();
        const res = search(idx, d.nodes, rawQ, {
          synonyms: cfg.synonyms,
          srcWeight: cfg.srcWeight,
          topK: 300,
          // 自动扩展（伪相关反馈）默认**关**：在这份数据上实测不稳，会把准的结果挤下去。
          // 想试：sea.config.json 里 recall.autoExpand 设 true。
          prf: cfg.recall.autoExpand === true,
        });
        const top = res.length ? res[0].score : 0;
        const floor = Math.max(cfg.recall.minRel * top, 0.02);
        for (const r of res) {
          if (r.score < floor) break;
          const n = d.nodes[r.i];
          if (!pass(n)) continue;
          picked.push({ n, score: r.score, why: explain(idx, d.nodes, r.i, rawQ, cfg.synonyms) });
          if (picked.length >= limit * 4) break;
        }
      } else {
        // 没给词：只按来源 / 时间筛，时间倒序
        for (let i = d.nodes.length - 1; i >= 0; i--) {
          const n = d.nodes[i];
          if (!pass(n)) continue;
          picked.push({ n, score: 0, why: [] });
          if (picked.length >= limit * 4) break;
        }
      }

      // 同一句话存过两遍（管线里也有「重复」标记）：只留最靠前的一条
      const seen = new Set();
      const uniq = [];
      for (const h of picked) {
        const k = String(h.n.text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (k && seen.has(k)) continue;
        if (k) seen.add(k);
        uniq.push(h);
      }
      const final = uniq.slice(0, limit);
      const items = final.map((h) => ({
        id: shortId(h.n.id),
        time: clock(h.n.time),
        src: SRC_NAME[h.n.src] || h.n.src,
        sea: zones[h.n.sid] === 1 ? '陪伴' : '工作',
        session: titles.get(h.n.sid) || h.n.sid,
        why: h.why.join(' · '),
        img: h.n.th ? 1 : 0,
        text: plainText(h.n.text, cap),
      }));
      // 记下这一轮，供 refine 用（只留 id，不占内存）
      try {
        lastRecall.set(rkey, { at: Date.now(), ids: new Set(final.map((h) => h.n.id)), q: rawQ });
      } catch (e) {}

      const chars = items.reduce((a, it) => a + it.text.length + it.session.length + 40, 0);
      return {
        ok: true,
        message:
          (canRefine ? `（在上次 ${prev.ids.size} 条里再筛）` : '') +
          (rawQ ? `「${rawQ}」命中 ${picked.length} 条（已去重）` : '按时间倒序') +
          ` · 返回 ${items.length} 条${full ? '全文' : '摘要'}` +
          (scopeAuto
            ? ' · 按当前会话自动只查了' + (scope === 'work' ? '工作海' : '陪伴海') + '（跨海看加 scope=all）'
            : scope === 'work'
              ? ' · 只查了工作海'
              : scope === 'companion'
                ? ' · 只查了陪伴海'
                : '') +
          ` · 约 ${Math.round(chars / 2)} token`,
        n: picked.length,
        items,
      };
    },
  });

  const day = defer({
    name: 'sea_day',
    description:
      '回顾某一天（或最近几天）：那天有多少条真实对话、来自哪些来源和会话、聊了些什么，' +
      '以及那天有多少条系统消息。用来回答"那天我们做了什么""最近在忙什么"。' +
      '不给 date 就是看今天。',
    parameters: {
      date: { type: 'string', description: '可选，YYYY-MM-DD。不给就看今天。' },
      days: { type: 'number', description: '可选，往回看几天（默认 1，最多 14）。给了 date 就忽略它。' },
      quote: { type: 'number', description: '可选，每段对话摘几条原话（默认 2，最多 6）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          report: { type: 'string' },
        },
      },
      render(_args, value) {
        if (!value || value.ok === false) return [{ type: 'text', text: '✗ ' + String(value?.message || '没查到') }];
        return [{ type: 'text', text: value.report }];
      },
    },
    async execute(args) {
      const d = await reader.load();
      const titles = sessionTitles(d.sessions);
      const quote = Math.max(0, Math.min(6, Number(args.quote) ?? 2));
      let days = Math.max(1, Math.min(14, Number(args.days) || 1));
      let from;
      if (args.date && dayMs(args.date) != null) {
        from = dayMs(args.date);
        days = 1;
      } else {
        const now = new Date();
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (days - 1) * 86400000;
      }
      const to = from + days * 86400000 - 1;

      const inRange = d.nodes.filter((n) => n.time >= from && n.time <= to);
      const byDay = new Map();
      for (const n of inRange) {
        const k = dayOf(n.time);
        if (!byDay.has(k)) byDay.set(k, []);
        byDay.get(k).push(n);
      }
      const sysAll = await reader.loadSysAll();
      const sysInRange = (sysAll || []).filter((s) => s && s.time >= from && s.time <= to).length;

      const out = [];
      const daysSorted = [...byDay.keys()].sort();
      for (const k of daysSorted) {
        const list = byDay.get(k).sort((a, b) => a.time - b.time);
        const srcCount = new Map();
        const sesCount = new Map();
        for (const n of list) {
          srcCount.set(n.src, (srcCount.get(n.src) || 0) + 1);
          sesCount.set(n.sid, (sesCount.get(n.sid) || 0) + 1);
        }
        const srcLine = [...srcCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k2, v]) => `${SRC_NAME[k2] || k2} ${v}`)
          .join(' · ');
        const sesLine = [...sesCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([sid, v]) => `${titles.get(sid) || sid}(${v})`)
          .join('、');
        const quotes = list
          .filter((n) => n.src === 'user' || n.src === 'assistant')
          .filter((n) => String(n.text || '').trim().length > 6)
          .slice(0, quote)
          .map((n) => `  「${clip(n.text, 120)}」`);
        out.push(
          `【${k}】${list.length} 条对话 · ${srcLine}` +
            (sesLine ? `\n  涉及：${sesLine}` : '') +
            (quotes.length ? '\n' + quotes.join('\n') : ''),
        );
      }

      if (!daysSorted.length) out.push('（这段时间没有任何对话记录）');
      const report =
        `看了看 ${daysSorted.length} 天：${inRange.length} 条真实对话，另有 ${sysInRange} 条系统消息。\n\n` +
        out.join('\n\n');
      return { ok: true, message: `${inRange.length} 条`, report };
    },
  });

  const sessions = defer({
    name: 'sea_sessions',
    description:
      '列出我参与过的会话（一段对话 = 一个会话）：标题、开始时间、多少条、在哪个工作区、是不是子代理。' +
      '想知道"我都聊过些什么""某个项目在哪段对话里"时先看这个，再用 sea_recall 进去翻原话。',
    parameters: {
      q: { type: 'string', description: '可选，按标题/工作区筛（子串，不分大小写）。' },
      limit: { type: 'number', description: '最多几条，默认 20，上限 60。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          report: { type: 'string' },
        },
      },
      render(_args, value) {
        if (!value || value.ok === false) return [{ type: 'text', text: '✗ ' + String(value?.message || '没查到') }];
        return [{ type: 'text', text: value.report }];
      },
    },
    async execute(args) {
      const d = await reader.load();
      const q = String(args.q || '').trim().toLowerCase();
      const limit = Math.max(1, Math.min(60, Number(args.limit) || 20));
      const rows = d.sessions
        .filter((s) => {
          if (!q) return true;
          return (
            String(s.title || '').toLowerCase().indexOf(q) >= 0 ||
            String(s.cwd || '').toLowerCase().indexOf(q) >= 0
          );
        })
        .sort((a, b) => (b.born || 0) - (a.born || 0))
        .slice(0, limit);

      const lines = rows.map((s) => {
        const t = String(s.title || '').trim() || String(s.cwd || '').split(/[\\/]/).filter(Boolean).pop() || '未命名';
        const tag = s.depth > 0 || s.origin === 'subagent' ? ' ↳子代理' : '';
        return `· ${clock(s.born || s.time || Date.now())} · ${s.nodes || 0} 条 · ${t}${tag}`;
      });
      return {
        ok: true,
        message: `${d.sessions.length} 个会话，列了 ${rows.length} 个`,
        report: `共 ${d.sessions.length} 个会话（${d.builtAt ? '数据更新于 ' + clock(d.builtAt) : ''}）：\n` + lines.join('\n'),
      };
    },
  });

  const KIND_NAME = {
    event: '一件事',
    promise: '一个约定',
    firstMeet: '第一次',
    owner: '关于你',
    conflict: '一次冲突',
  };
  const CLARITY_NAME = { vivid: '还很清楚', clear: '开始模糊' };

  const surf = defer({
    name: 'sea_surf',
    description:
      '在「她自己的记忆」里翻——SurfCore 记忆卡。**注意这不是聊天原话**，' +
      '是她把某件事记下来之后的记忆条目：会有「重要性」「清晰度（还很清楚 / 开始模糊）」「是约定还是事件」。' +
      '想知道"她记得你什么""她答应过什么""哪些事她正在忘"时用它；' +
      '想引当时的原话、想确认某句话怎么说的，用 sea_recall。',
    parameters: {
      q: { type: 'string', description: '可选，关键词。留空 = 按条件列。' },
      kind: {
        type: 'string',
        description: '可选，只看某类：event=一件事、promise=约定、firstMeet=第一次、owner=关于你、conflict=冲突。',
      },
      state: {
        type: 'string',
        description: '可选，记忆状态：clear=快忘了（清晰度已降）、vivid=还很清楚、all=全部（默认）。',
      },
      limit: { type: 'number', description: '最多返回几条，默认 8，上限 30。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
          n: { type: 'number' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                time: { type: 'string' },
                kind: { type: 'string' },
                clarity: { type: 'string' },
                importance: { type: 'number' },
                tags: { type: 'string' },
                text: { type: 'string' },
              },
            },
          },
        },
      },
      render(_args, value) {
        if (!value || value.ok === false) return [{ type: 'text', text: '✗ ' + String(value?.message || '没查到') }];
        if (!value.items || !value.items.length) return [{ type: 'text', text: '（没有匹配的记忆卡）' }];
        const lines = value.items.map(
          (it) =>
            `· ${it.time} · ${it.kind} · ${it.clarity} · 重要度 ${it.importance}` +
            (it.tags ? ` · ${it.tags}` : '') +
            `\n  ${it.text}`,
        );
        return [{ type: 'text', text: value.items.length + ' 条：\n' + lines.join('\n') }];
      },
    },
    async execute(args) {
      const d = await reader.loadSurf();
      if (!d || !Array.isArray(d.nodes) || !d.nodes.length) {
        return {
          ok: false,
          message: '这台机器没有 SurfCore 记忆（找不到 sc-data.js，或那一片海是空的）',
          n: 0,
          items: [],
        };
      }
      const q = String(args.q || '').trim();
      const kind = String(args.kind || '').trim();
      const state = String(args.state || '').trim().toLowerCase();
      const limit = Math.max(1, Math.min(30, Number(args.limit) || 8));

      // 只把命中的候选拿来排序：先条件筛，再按关键词打分
      let cand = d.nodes.filter((n) => {
        if (kind && n.kind !== kind) return false;
        if (state === 'clear' && n.clarity !== 'clear') return false;
        if (state === 'vivid' && n.clarity !== 'vivid') return false;
        return true;
      });

      let order = null;
      if (q) {
        // 复用同一套 BM25：把记忆卡包成 {text} 再索引（251 条，建索引可忽略）
        const texts = cand.map((n) => ({ text: (n.txt || '') + ' ' + (n.tags || []).join(' ') }));
        const idx = buildIndex(texts);
        const cfg2 = await reader.loadConfig();
        const res = search(idx, texts, q, {
          synonyms: cfg2.synonyms,
          topK: 80,
          prf: !!cfg2?.recall?.autoExpand,
        });
        const top = res.length ? res[0].score : 0;
        const floor = Math.max(0.3 * top, 0.02);
        order = res.filter((r) => r.score >= floor).map((r) => r.i);
        if (!order.length) cand = [];
      }

      const picked = (order || cand.map((_, i) => i)).slice(0, limit).map((i) => cand[i]).filter(Boolean);
      const items = picked.map((n) => ({
        time: clock(n.t || n.seen || 0),
        kind: KIND_NAME[n.kind] || n.kind || '记忆',
        clarity: CLARITY_NAME[n.clarity] || n.clarity || '',
        importance: Math.round((Number(n.imp) || 0) * 100) / 100,
        tags: (n.tags || []).filter((t) => t && t !== 'manual').join(' / '),
        text: clip(bodyOf(n), 600),
      }));
      return {
        ok: true,
        message:
          `${d.charName || '她'}的记忆卡 ${d.nodes.length} 条` +
          (q ? `，「${q}」相关 ${(order || []).length} 条` : '') +
          ` · 返回 ${items.length} 条`,
        n: cand.length,
        items,
      };
    },
  });

  // ── 把「整理」变成可执行的动作：AI 也能标星 / 打标签 / 写备注 / 隐去
  const markTool = defer({
    name: 'sea_mark',
    description:
      '给「记忆意识海」里的某一条做标记：收藏、打标签、写备注、或者隐去。' +
      '**只在用户明确要求时才调用**（"把这条收藏起来""标一下""以后别看这条"），不要自作主张批量标注。' +
      'id 用 sea_recall 返回里那个 #短id（形如 edca555c:8）。' +
      '标完要刷新页面才看得到（浮层里点 ↻）。',
    parameters: {
      id: { type: 'string', description: '要标的那一条，用 sea_recall 返回里的 #短id。' },
      star: { type: 'boolean', description: '可选。true = 收藏，false = 取消收藏。' },
      tag: { type: 'string', description: '可选。加一个标签；多个用逗号分隔。' },
      note: { type: 'string', description: '可选。写一句备注；传空字符串 = 删掉备注。' },
      hide: { type: 'boolean', description: '可选。true = 隐去（以后不显示），false = 恢复显示。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      render(_a, v) {
        return [{ type: 'text', text: (v && v.ok ? '✓ ' : '✗ ') + String((v && v.message) || '') }];
      },
    },
    async execute(args) {
      if (!marks) return { ok: false, message: '这台机器没有管理态文件，标不了' };
      const d = await reader.load();
      const idx = resolveShortId(args.id, d.nodes);
      if (idx < 0) {
        return {
          ok: false,
          message: '找不到这条记忆：' + String(args.id || '(空)') + '（要传 sea_recall 返回里的 #短id）',
        };
      }
      const n = d.nodes[idx];
      const key = String(n.id);
      const cur = (await marks.read()) || {};
      const m = {
        __v: 2,
        star: { ...(cur.star || {}) },
        hide: { ...(cur.hide || {}) },
        note: { ...(cur.note || {}) },
        arch: { ...(cur.arch || {}) },
        tag: { ...(cur.tag || {}) },
      };
      const done = [];
      if (args.star === true) {
        m.star[key] = 1;
        done.push('收藏');
      } else if (args.star === false) {
        if (m.star[key]) { delete m.star[key]; done.push('取消收藏'); }
        else done.push('本来就没收藏');
      }
      if (args.hide === true) {
        m.hide[key] = 1;
        done.push('已隐去');
      } else if (args.hide === false) {
        if (m.hide[key]) { delete m.hide[key]; done.push('恢复显示'); }
        else done.push('本来就没隐去');
      }
      if (typeof args.note === 'string') {
        const t = args.note.trim();
        if (t) { m.note[key] = t; done.push('记了备注'); }
        else if (m.note[key]) { delete m.note[key]; done.push('删掉备注'); }
        else done.push('本来就没备注');
      }
      if (typeof args.tag === 'string') {
        const add = args.tag.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
        if (add.length) {
          const arr = Array.isArray(m.tag[key]) ? m.tag[key].slice() : [];
          for (const t of add) if (!arr.includes(t)) arr.push(t);
          m.tag[key] = arr;
          done.push('加标签 ' + add.join('/'));
        }
      }
      if (!done.length) {
        return { ok: false, message: '没说要标什么（star / tag / note / hide 至少给一个）' };
      }
      await marks.save(m);
      return {
        ok: true,
        message: '「' + plainText(n.text, 40).split('\n').join(' ') + '」→ ' + done.join('，') + '。刷新页面后能在「整理」里看到。',
      };
    },
  });

  const list = [recall, day, sessions, markTool];
  // 这台机器没有 SurfCore（没有任何记忆卡）就不挂 sea_surf：
  // 挂着也只会回一句"没有"，白占一次工具调用、还会让 AI 以为有这功能
  if (caps.surf !== false) list.push(surf);
  // 统一兜底：数据没生成 / 文件坏了，别把一堆栈丢给 AI，给一句能照做的话
  return list.map((t) => ({
    ...t,
    async execute(a, e) {
      try {
        return await t.execute(a, e);
      } catch (err) {
        const msg = String(err?.message || err);
        const miss = /ENOENT|no such file/i.test(msg);
        return {
          ok: false,
          message:
            (miss ? '记忆数据还没生成' : '读记忆的时候出错了') +
            '（' + msg.slice(0, 120) + '）。先在项目目录跑 node sea-build/setup.mjs。',
        };
      }
    },
  }));
}

// ───────────────────────────────────────────── 管理态（marks）读写
function makeMarksIO(root) {
  const file = join(root, '..', 'marks.json');
  let writing = null;
  let queued = null;

  async function read() {
    try {
      return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch {
      return null;
    }
  }

  /** 原子写：先写 .tmp 再 rename，写坏了也不会留下半个文件 */
  async function write(obj) {
    const tmp = file + '.tmp';
    // 上一版留一份备份：手滑清空、或者导入错文件时还能捞回来
    try {
      const prev = await fsp.readFile(file, 'utf8');
      if (prev && prev.length > 2) await fsp.writeFile(file + '.bak', prev, 'utf8');
    } catch (e) { /* 第一次写没有旧文件，正常 */ }
    await fsp.writeFile(tmp, JSON.stringify(obj), 'utf8');
    await fsp.rename(tmp, file);
  }

  /** 串行化：同一时刻只有一个写，来的就排队覆盖（最后到的赢） */
  function save(obj) {
    queued = obj;
    if (writing) return writing;
    writing = (async () => {
      try {
        while (queued) {
          const cur = queued;
          queued = null;
          await write(cur);
        }
      } finally {
        writing = null;
      }
    })();
    return writing;
  }

  /** 版本号：文件 mtime+size。前端拿它判断"要不要重新拉一份" */
  async function rev() {
    try {
      const st = await fsp.stat(file);
      return Math.round(st.mtimeMs) + ':' + st.size;
    } catch {
      return '0:0';
    }
  }

  return { file, read, save, rev };
}

const readBody = (req, max = 8 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > max) {
        reject(new Error('body 太大'));
        try { req.destroy(); } catch {}
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

// ───────────────────────────────────────────── 主力
/**
 * 数据目录（也就是 sea-build/out）解析顺序：
 *   1. config.root —— cordis.patch.yml 里写的
 *   2. 环境变量 SEA_DATA_DIR
 *   3. 插件自己旁边：<插件目录>/../sea-build/out（软链安装时这就是仓库里的产物目录）
 *   4. <用户目录>/.dsh/sea-out
 * 第 3 条是关键：`install.mjs` 用软链装时，装完什么都不用配就能找到数据。
 */
function resolveRoot(configRoot) {
  const raw = String(configRoot || '').trim();
  if (raw) return normalize(raw);
  const env = String(process.env.SEA_DATA_DIR || '').trim();
  if (env) return normalize(env);
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const guess = normalize(join(here, '..', 'sea-build', 'out'));
    // 认 data.js 而不是 index.html：仓库里就带着一个空的 index.html，
    // 那只是壳子；没有 data.js 说明还没跑过 setup，得继续往下找
    if (existsSync(join(guess, 'data.js'))) return guess;
  } catch {}
  const home = process.env.USERPROFILE || process.env.HOME || '.';
  return normalize(join(home, '.dsh', 'sea-out'));
}

export async function apply(ctx, config) {
  const root = resolveRoot(config?.root);
  const prefix = String(config?.prefix || '/sea');
  const reader = makeDataReader(root);
  const marks = makeMarksIO(root);
  // 能力清单：静态服务一起来就可能被 /api/status 问到，所以先声明再探测
  const caps = { surf: false, zones: false, hidden: false };

  const send = (res, code, text) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(text);
  };
  const sendJson = (res, code, obj) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(obj));
  };

  const fileFor = async (rel) => {
    // 目录穿越防护：解析后必须仍在 root 里
    let p = normalize(join(root, rel));
    if (p !== root && !p.startsWith(root + sep)) return null;
    let st;
    try {
      st = await fsp.stat(p);
    } catch {
      return null;
    }
    if (st.isDirectory()) {
      p = join(p, 'index.html');
      try {
        st = await fsp.stat(p);
      } catch {
        return null;
      }
    }
    if (!st.isFile()) return null;
    return p;
  };

  /** /sea/api/* —— 走在这里，剩下的才当静态文件 */
  async function handleApi(req, res, path) {
    // GET  /api/marks        → { marks, file }
    // POST /api/marks        → 写回，body = marks 对象
    // GET  /api/status       → 数据新鲜度
    if (path === '/api/marks') {
      const u = new URL(req.url || '/', 'http://local');
      if (req.method === 'POST' || req.method === 'PUT') {
        try {
          const body = JSON.parse(await readBody(req));
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            sendJson(res, 400, { ok: false, message: 'marks 必须是对象' });
            return;
          }
          await marks.save(body);
          sendJson(res, 200, { ok: true, file: marks.file, rev: await marks.rev() });
        } catch (e) {
          sendJson(res, 500, { ok: false, message: String(e?.message || e) });
        }
        return;
      }
      const rv = await marks.rev();
      if (u.searchParams.get('rev')) {
        sendJson(res, 200, { ok: true, rev: rv, file: marks.file });
        return;
      }
      const cur = await marks.read();
      sendJson(res, 200, { ok: true, marks: cur, file: marks.file, rev: rv });
      return;
    }

    if (path === '/api/status') {
      try {
        const d = await reader.load();
        sendJson(res, 200, {
          ok: true,
          builtAt: d.builtAt,
          nodes: d.nodes.length,
          sessions: d.sessions.length,
          sys: d.sys.length,
          proc: d.proc,
          file: d.file,
          caps,
        });
      } catch (e) {
        sendJson(res, 503, { ok: false, message: String(e?.message || e) });
      }
      return;
    }

    sendJson(res, 404, { ok: false, message: '没有这个接口：' + path });
  }

  const disposer = ctx.webServer.register({
    kind: 'prefix',
    path: prefix,
    async handler(req, res) {
      const url = req.url || '/';
      const q = url.indexOf('?');
      const raw = q >= 0 ? url.slice(0, q) : url;
      const cut = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
      let rel = decodeURIComponent(cut.replace(/^\/+/, ''));
      if (!rel) rel = 'index.html';

      if (rel === 'api' || rel.startsWith('api/')) {
        try {
          await handleApi(req, res, '/' + rel.replace(/^api\/*/, 'api/'));
        } catch (e) {
          try {
            sendJson(res, 500, { ok: false, message: String(e?.message || e) });
          } catch {}
        }
        return;
      }

      const file = await fileFor(rel);
      if (!file) {
        send(res, 404, 'not found: ' + rel);
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
      // 开发期：每次都问一遍，改完刷新就能看到新版本
      res.setHeader('Cache-Control', 'no-cache');

      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = createReadStream(file);
      stream.on('error', () => {
        try { res.destroy(); } catch {}
      });
      stream.pipe(res);
    },
  });

  // ── 能力探测：没有的东西不挂工具（免得 AI 看到就用、用完拿到"没有"）
  const wantTools = config?.tools !== false;
  if (wantTools) {
    try {
      const sf = await reader.loadSurf();
      caps.surf = !!(sf && Array.isArray(sf.nodes) && sf.nodes.length);
    } catch {}
    if (config?.tools && config.tools.surf === false) caps.surf = false;
    try {
      const d = await reader.load();
      caps.zones = !!d.zones && Object.keys(d.zones).length > 0;
    } catch {}
    try {
      const sa = await reader.loadSysAll();
      caps.hidden = !!(sa && sa.length);
    } catch {}
  }

  // ── AI 记忆工具：注册失败不能拖垮静态服务（工具只是加分项）
  const offs = [];
  if (wantTools && ctx.tools && typeof ctx.tools.register === 'function') {
    for (const def of makeTools(reader, caps, marks)) {
      try {
        const off = ctx.tools.register(def);
        if (typeof off === 'function') offs.push(off);
        else if (off && typeof off.off === 'function') offs.push(() => off.off());
      } catch (e) {
        console.warn('[sea] 工具注册失败 ' + def.name + '：' + (e?.message || e));
      }
    }
  } else {
    console.warn('[sea] ctx.tools 不在，记忆工具没挂上（静态服务照常）');
  }

  return () => {
    for (const off of offs) {
      try { off(); } catch {}
    }
    disposer();
  };
}
