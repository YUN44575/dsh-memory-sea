# 记忆意识海（dsh-plugin-sea）

把你的 DSH 会话变成一片能看、能查、能整理的星空。

两个入口，同一份数据：

| | 谁用 | 是什么 |
|---|---|---|
| **页面** | 你 | 星图：一句话一颗星，时间轴在底部，能搜索、收藏、标标签、写备注、归档；「整理」页可以按清单翻、按对话折、看体检、看重复、生成回顾 |
| **五个工具** | DSH 里的 AI | `sea_recall` 翻原话 / `sea_surf` 翻她自己的记忆卡 / `sea_day` 回顾某天 / `sea_sessions` 找会话 / `sea_mark` 把某条标起来 |

---

## 快速开始

```bash
node sea-build/doctor.mjs    # 先看能不能跑
node sea-build/setup.mjs     # 一条命令跑完整条管线（约 10 秒）
```

跑完 `sea-build/out/index.html` 就能双击打开（**不需要服务器**，全靠 `file://`）。

## 装到另一个 DSH（或另一台电脑）

前置：Node.js ≥ 18、一个用过一段时间的 DSH（`.dsh/sessions` 里有 `*.jsonl.zstd`）。

**1. 拷贝两个目录**

```
你的项目/sea-build/        ← 采集 + 布局 + 页面源码
你的项目/dsh-plugin-sea/   ← 插件本体
```

**2. 改路径（如果 .dsh 不在默认位置）**

默认自动探测 `<用户目录>/.dsh`。在别的盘就设环境变量 `DSH_HOME`，或写进 `sea-build/sea.config.json`：

```json
{ "paths": { "dsh": "D:/我的/.dsh" } }
```

**3. 自检 → 生成数据**

```bash
node sea-build/doctor.mjs
node sea-build/setup.mjs
```

`doctor` 会逐项告诉你缺什么；`setup` 按 collect → layout → SurfCore → 桥 的顺序跑，哪一步没有就自动跳过。

**4. 装插件（想让它长在 DSH 里）**

把 `dsh-plugin-sea` 放进 `<profile>/node_modules/@local/`，然后在 `cordis.patch.yml` 里把 `root` 指到你的 `sea-build/out`：

```yaml
config:
  root: 'C:/你的路径/sea-build/out'
  prefix: '/sea'
```

**改完要重启 DSH**（host 半在进程启动时加载）。装好后左下角会有个 ✦。

---

## 数据从哪来

| 来源 | 是什么 | 进不进星图 |
|---|---|---|
| `user` / `assistant` | 你和 AI 的对话 | ✓ |
| `qq` | QQ 桥接的聊天 | ✓ |
| `world-diary` | 世界自己写的日记 | ✓ |
| `dsh-world-life` / `dsh-world-history` | 世界的日常与旧事 | ✓ |
| `agent-message` | 多 agent 协作时 Lead 和子代理的来回 | ✓ |
| `fish-memory` | 长期记忆卡 | ✓ |
| 系统消息（时间上下文、运行时快照、插件规则、审批流水…） | 注入的，不是你说的话 | ✗ 进「隐藏层」清单，可翻全文 |
| reasoning / tool-call | AI 的思考和工具调用 | ✗ 只在详情里计数，不上星 |

**隐私**：全部是本机文件，不联网、不上传。页面对 `sk-` / `ghp_` / `AKIA` / `Bearer` / 手机号做打码。

---

## 五个工具

| 工具 | 干什么 | 什么时候用 |
|---|---|---|
| `sea_recall` | 翻**原话**：按关键词/来源/时间段/分域 | "他当时是怎么说的""那个数字是多少" |
| `sea_surf` | 翻**她自己的记忆卡**（有重要性、清晰度、是约定还是事件） | "她记得我什么""她答应过什么""哪些事她快忘了" |
| `sea_day` | 某天/最近几天发生了什么 | "昨天做了什么""最近在忙什么" |
| `sea_sessions` | 列出会话（标题/时间/条数/是否子代理） | "上次聊 XX 的是哪个会话" |
| `sea_mark` | 把某条**收藏 / 打标签 / 写备注 / 隐去**（改的是你的管理态，写进 `marks.json`） | "把这条收藏起来""标一下""以后别看这条" |

> `sea_mark` 改完之后，**页面上最多 8 秒自己出现**（前端轮询 `marks.json` 的版本号），不用手动刷新。
> 这是"AI 标了星，人那边能看见"的那条线。

它们是**一张网的两个方向**：

```
      宽                       深                      写回
sea_sessions  ──►  sea_recall  ──►  sea_mark
   找到哪段         翻原话         标星/标签/备注
                     sea_surf
                   翻记忆卡
        ▲
   sea_day（按天再看一遍）
```

- **导航层** `sea_sessions`：先定"是哪段对话"
- **内容层** `sea_recall` / `sea_surf`：一个翻**原话**、一个翻**记下来的条目**（后者会随时间衰减）
- **时间层** `sea_day`：不按话题、按日子聚合（和 `sea_recall` 加 `since/until` 有重叠，但 day 会给来源分布和会话排序）
- **写回层** `sea_mark`：AI 读得出来，也标得进去

`sea_recall` 和 `sea_surf` 的区别最重要：**说过的原话** vs **记下来的条目**。
别混着用——想引原话用 recall，想知道"她还记着什么"用 surf。

> **没有的东西不会挂工具**：这台机器上没有 SurfCore 记忆卡，`sea_surf` 就不会出现在工具列表里
> （而不是挂着、每次调用都回你一句"没有"）。也可以显式关：`config.tools.surf = false`。

---

## 检索是怎么做的

**没有用 embedding**——离线可用是硬要求，而且 DeepSeek 不提供 embedding 接口，本机也没有模型。

用的是 **BM25 + 中文 2-gram + 同义词扩展 + 原文整串加权**：

- 分词：中文切 2-gram，英文/路径/数字整词
- 打分：BM25（`K1=1.2, B=0.75`）
- 同义词：`语音` 也去找 `音色 / 声音 / 音频 / TTS / RVC`
- 查询整串出现在原文里 → 分数 ×1.55
- 世界里那类系统注入的来源降权到 0.35
- **单字查询**（"网""忘""猫"）：自动展开成"含这个字的 2-gram"，否则 2-gram 索引里单字永远是 0 条

**为什么这比"关键词全中 + 时间倒序"好**

| 查询 | 旧 | 新 |
|---|---|---|
| `音频包` | 0 条（原文里只有"语音包"） | 能翻到语音包那几条 |
| `闪退` | 0 条 | 靠近义词找到"崩溃/挂了" |
| `网` | 0 条（单字没进索引） | 40 条，第一条就是「没有网，你还能工作吗」 |
| `QQ 语音` | 最上面是无关的日记 | 第一条就是「桥发不了语音」 |

每条结果还会告诉你**为什么命中**：`〔原文含「语音包」· 词：语音·音包 · 近义：tts·rvc·音色〕`

### 不占上下文

| 参数 | 作用 |
|---|---|
| `detail=brief`（默认） | 每条截 160 字；5 条约 290 token |
| `detail=full` | 每条截 700 字；最多 4 条 |
| `limit` | 默认 5（full 时 4），上限 20 |
| 剪枝 | 低于第一名 30% 的直接丢掉，不凑数 |
| 去重 | 同一句话存过两遍的，只留一条 |
| `scope` / `src` / `since` / `until` | 先过滤再排序，把不相干的挡在外面 |
| `scope` 默认 `auto` | **按当前会话自动收窄到一片海**：工作会话只翻工作海、陪伴会话只翻陪伴海；要跨海用 `scope=all` |
| `refine=true` | **在上一次结果里再筛**（见下），越问越窄而不是重开一局 |

### 多轮：`refine=true`

查一次嫌多，接着追一句"里面再看""那个带图的""上次说的那个"时，加 `refine=true`：

- 记忆体是**上一次同会话的 `sea_recall` 结果**（只存 id，不存正文；5 分钟内有效）
- 效果：候选从整片海收到上次那几条里，再按新词排序
- 例：第一轮 `q=鲸鲸` 返回 8 条 → 第二轮 `q=语音 & refine=true` 在这 8 条里筛出 1 条；
  同样的 `q=语音` 不带 refine 是从 1614 条里查，返回 5 条
- 上一轮过期或没有时，自动退化成普通查询，不报错

返回值里带 `约 N token`，你能一眼看出这次查询花了多少。

---

## 维护同义词表

词表在 `sea-build/sea.config.json`，改完保存就生效（不用重启，host 下次读配置时生效；重启后一定读到）。

不知道缺什么词？跑：

```bash
node sea-build/synonym-test.mjs
```

它拿 60 个日常说法跑一遍，**列出完全搜不到的查询**。看到 `✗ 早安` 这种，就想"人还会怎么说它"，把对应词补进 `synonyms`，再跑一次。

```json
"synonyms": {
  "早安": ["早上好", "起来了", "睡醒"],
  "语音": ["音色", "声音", "音频", "TTS", "RVC"]
}
```

> 还有一个 `recall.autoExpand`（自动查询扩展 / 伪相关反馈），**默认是关的**。
> 在真实数据上试过：偶尔能救回"换个说法"的查询，但更多时候会把本来排第一的准结果挤下去。想试就设 `true`。

---

## 配置

`sea-build/sea.config.json`（可选，不给就用内置默认）：

```json
{
  "paths": { "dsh": "D:/我的/.dsh" },
  "synonyms": { "语音": ["音色", "声音", "TTS"] },
  "srcWeight": { "dsh-world-life": 0.35 },
  "recall": { "limit": 5, "briefChars": 160, "fullChars": 700, "minRel": 0.3, "autoExpand": false }
}
```

以 `_` 开头的键是注释，会被忽略。

---

## 常见问题

**页面空白 / 一直是旧的**
数据是静态文件。跑 `node sea-build/setup.mjs` 重新生成，然后浮层里点 ↻。

**星图里找不到刚说的话**
最新一次采集之后说的还没进来；或者它被「来源开关」关掉了（右上角「来源」）；或者它在另一层（深层 = 记得久，浅层 = 刚说过/正在淡）。

**AI 说它没有 `sea_recall` 这个工具**
host 半没加载。**重启 DSH** 才会出现。

**AI 帮我标了星，页面上没变**
`sea_mark` 写的是 `sea-build/marks.json`，页面只在启动时读一次。浮层里点 ↻ 刷新就能看到。

**AI 搜出来的话还带着 `##` `**` 这些符号吗**
不会了。进上下文之前会剥掉 markdown 标记（代码块变成「〔代码〕」），
只留正文——那些标记是我自己写的时候用的格式，给 AI 看是噪音。

**点回顾里的图，跳不到星点**
会先自动帮你把挡路的条件放开（切层、开来源、清搜索）；如果是你**主动隐去/归档**的，它只会提示你去哪找回来，不会偷偷恢复。

**换电脑后图全丢了**
附件是按 sha 找 `<.dsh>/attachments/v1/objects/<前2位>/<sha>` 的，`paths.objects` 指对就行。找不到附件目录不影响文字，只是没缩略图。

**别人的 DSH 能直接用吗**
能跑，但不会是同一片海。`sea-build` + `dsh-plugin-sea` 拷过去、改 `paths.dsh`、跑 `setup.mjs` 就有他自己的星图和他的记忆工具；
鲸鲸、世界日记、SurfCore 这些来源他机器上没有就自动跳过（分别少几类来源和一片海）。

---

## 目录

```
sea-build/
  paths.mjs          路径解析（配置 > DSH_HOME > 自动探测）
  doctor.mjs         自检：能不能跑、缺什么
  setup.mjs          一键跑完整条管线
  collect.mjs        会话 → nodes.json（含隐藏层、过程层、分域、日记、多端对齐）
  layout.mjs         语义布局 → out/data.js + zones.json
  build_sc.mjs       SurfCore → out/sc-data.js（没装就跳过）
  match_bridge.mjs   两片海的重叠 → out/bridge.js
  synonym-test.mjs   同义词自检：哪些查询搜不到
  out/index.html     页面本体（星图 + 整理 + 来源 + 回顾）
  test_ui.mjs        30+ 条 UI 断言
dsh-plugin-sea/
  index.js           静态服务 + /sea/api/marks + /sea/api/status + 四个 AI 工具
  search.js          BM25 检索（分词 / 索引 / 打分 / 命中解释 / 单字展开）
  client.js          DSH 里的悬浮球 + 浮层
```
