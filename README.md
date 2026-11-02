# 记忆意识海 v1.0.0

把 DSH 里的**全部会话**变成一片可以看、可以搜、可以整理的星图；
同时给会话里的 AI 一套**查自己记忆**的工具（翻原话、回顾某天、标星）。

人看的是星图，AI 用的是工具，**两边共用同一份数据**。

![星图](docs/screenshots/star-map.jpg)

| 整理：按清单翻、批量标 | 回顾：选一段时间生成一张卡 |
|---|---|
| ![整理](docs/screenshots/manage-list.jpg) | ![回顾](docs/screenshots/review.jpg) |
| **体检：每张卡都能点开看它包含什么** | **来源：七类来源独立开关** |
| ![体检](docs/screenshots/health.jpg) | ![来源](docs/screenshots/sources.jpg) |

---

## 三分钟装上

前置：Node.js ≥ 20、装了 DSH、本机有 Chrome（只影响截图工具，不影响主功能）。

### 1. 把两个目录放到同一个父目录里

```
<随便一个目录>/
  dsh-plugin-sea/     ← 插件本体
  sea-build/          ← 数据管线 + 界面
```

**必须同级**：`sea-build/synonym-test.mjs` 会 `import '../dsh-plugin-sea/search.js'`。

### 2. 生成数据

```bash
node sea-build/doctor.mjs    # 先自检：找到几个数据源、缺什么
node sea-build/setup.mjs     # 一条命令跑完整条管线（约 10 秒）
```

跑完 `sea-build/out/` 里会有 `index.html`、`data.js`、`zones.json` 等。
**先双击 `sea-build/out/index.html` 看看**——这一步不需要装插件，是纯静态页面。

### 3. 装插件（一条命令）

```bash
node sea-build/install.mjs
```

它会做三件事：往 DSH profile 的 `package.json` 里登记两处（`dependencies` 加一条 `link:`、
`dsh.profile.bundles` 加一项）、把 `dsh-plugin-sea/` 软链到 `node_modules/@local/` 下、
再顺手跑一遍数据生成。**改之前会备份** `.bak-sea-<时间戳>`。

```bash
node sea-build/install.mjs --dry            # 只看会改什么，不动文件
node sea-build/install.mjs --profile web    # 换 profile（默认 desktop）
node sea-build/install.mjs --copy           # 复制而不是软链（想冻结版本时用）
node sea-build/install.mjs --skip-setup     # 只装插件，不重建数据
node sea-build/install.mjs --force          # 目录搬过家，覆盖旧的 link 指向
```

装完在 profile 目录跑一次 `pnpm install`（如果 DSH 启动时自己会装，跳过也行）。

<details>
<summary>也可以手动装（两处登记）</summary>

改 `<用户目录>/.dsh/profiles/<profile名>/package.json`：

```jsonc
{
  "dependencies": {
    "@local/dsh-plugin-sea": "link:<本仓库>/dsh-plugin-sea"   // ← 第 1 处
  },
  "dsh": {
    "profile": {
      "bundles": ["…", "@local/dsh-plugin-sea"]                // ← 第 2 处
    }
  }
}
```

再把 `dsh-plugin-sea/` 软链到 `<profile>/node_modules/@local/dsh-plugin-sea`，然后 `pnpm install`。

</details>

插件的数据目录（`root`）有三种写法：
1. 在 `dsh-plugin-sea/cordis.patch.yml` 里写绝对路径（最直白）
2. 留空 `''`，用环境变量 `SEA_DATA_DIR` 指定
3. 留空且不设环境变量 → 默认 `<用户目录>/.dsh/sea-out`

### 4. 重启 DSH

**改 `index.js` 必须重启**（host 半在进程启动时加载）；
之后改 `out/index.html` 或 `client.js` 不用重启，浮层里点 ↻ 就行。

装好后左下角有个 `✦`，点开就是星图。

---

## 装完能得到什么

**页面上**
- 星图：会话变成星，相近的话题聚成云，工作海（青蓝）/ 陪伴海（粉紫）分开
- 点星看原话、缩略图、上下文；Esc 分级退出
- 右上「来源」：七类来源分别开关，**能看到团队协作、世界日记这些以前根本看不到的**
- 「整理」：清单式检索 + 体检（重复/没再提过/带图）+ 按会话折叠 + 回顾卡（选一段时间生成一张卡）
- 收藏 / 标签 / 备注 / 隐去 / 归档，全部存在 `marks.json`（不再只是浏览器 localStorage）

**AI 手上**（装好后 DSH 会话里直接可调用）
| 工具 | 干什么 |
|---|---|
| `sea_recall` | 翻原话：关键词 / 来源 / 时间段 / 分域 |
| `sea_surf` | 翻 SurfCore 的**记忆卡**（有重要性、清晰度；没装 SurfCore 就不会挂这个工具） |
| `sea_day` | 某天 / 最近几天发生了什么 |
| `sea_sessions` | 列出会话，找"上次聊 XX 的是哪个" |
| `sea_mark` | 把某条收藏 / 打标签 / 写备注 / 隐去（写回 `marks.json`，页面 8 秒内自动出现） |

---

## 数据从哪来、往哪去

只**读**这些地方，不改原始数据：

| 来源 | 路径 |
|---|---|
| DSH 会话存档 | `<DSH>/.dsh/sessions/**/session.v4.jsonl.zstd` |
| 附件图 | `<DSH>/.dsh/attachments/v1/objects` |
| 长期记忆 | `<DSH>/.dsh/fish-memory/*.json` |
| 世界日记 | `<DSH>/.dsh/worlds/default/diary/*.md` + `conversations/*.jsonl` |
| SurfCore 记忆卡 | `<DSH>/.dsh/surfcore/characters` |

产物都在 `sea-build/`：`nodes.json`（采集）、`out/data.js`（星图）、`out/hidden.js`（系统消息全文）、`out/zones.json`（分域表）、`marks.json`（管理态）。

**没有这些东西也能跑**：缺哪个就少哪一块（`doctor.mjs` 会告诉你怎么回事），不会崩。

---

## 常用命令

```bash
node sea-build/doctor.mjs        # 自检：数据源在不在、产物新不新
node sea-build/setup.mjs         # 更新数据（一条命令跑完整条管线）
node sea-build/synonym-test.mjs  # 同义词表自检：哪些说法搜不到
node sea-build/watch.mjs         # 实时守护：会话一变就重建
```

---

## 目录里都是什么

```
dsh-sea-v1.0.0/
├── README.md              ← 你正在读的
├── CHANGELOG.md
├── dsh-plugin-sea/        ← DSH 插件（host 半 + 前端浮层）
│   ├── index.js           host：静态服务 / marks API / 五个 AI 工具
│   ├── client.js          前端：左下角 ✦ 悬浮球 + 全屏浮层
│   ├── search.js          BM25 + 2-gram + 同义词（零依赖）
│   ├── package.json
│   ├── cordis.patch.yml   挂载配置（root / prefix）
│   ├── locale/            中英文案
│   └── README.md          插件详细文档（工具参数、检索原理、配置）
└── sea-build/             ← 数据管线 + 界面
    ├── out/index.html     界面本体（星图 / 整理 / 详情，纯前端无依赖）
    ├── collect.mjs        采集会话 + 记忆卡 + 日记 → nodes.json
    ├── layout.mjs         t-SNE 布局 → out/data.js + out/zones.json
    ├── build_sc.mjs       SurfCore 记忆卡 → out/sc-data.js
    ├── match_bridge.mjs   两片海的重叠桥
    ├── setup.mjs          一条命令跑完上面四步
    ├── doctor.mjs         自检
    ├── paths.mjs          路径解析（配置 > DSH_HOME > 自动探测）
    ├── domains.json       工作 / 陪伴 分域规则
    └── sea.config.json    同义词 / 权重 / 检索参数（改这个不用改代码）
```

---

## 想改什么

| 想改 | 改哪 |
|---|---|
| 哪些会话算「陪伴海」 | `sea-build/domains.json`（改完跑 setup） |
| 搜不到的词 | `sea-build/sea.config.json` 的 `synonyms`（跑 synonym-test 看哪些 ✗） |
| 界面文字/颜色 | `sea-build/out/index.html` |
| 工具行为 | `dsh-plugin-sea/index.js`（改完**重启 DSH**） |
| 数据目录 | `dsh-plugin-sea/cordis.patch.yml` 的 `root` |

---

## 已知边界（第一版）

- 检索是 **BM25 + 同义词 + 子串**，不是语义向量。换个说法但两边都不含共同词，就搜不到。
- **判重**按整段文本完全相同算，不认"意思一样但措辞不同"。
- **分域**粒度是「会话」不是「话题」：工作会话里聊到陪聊对象的事，仍算工作海。
- **AI 标星**页面最多 8 秒后出现（轮询版本号），不是即时的。
- **数据量**：现在约 1600 节点 / 1 MB。到 5 万条需要改增量布局和分片（`layout.mjs` 现在一次算全量）。
- 只在 Windows + Chrome 上验证过。

---

## 许可

MIT。数据永远在你自己的机器上，没有联网请求。
