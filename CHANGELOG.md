# CHANGELOG

## 1.0.0 — 2026-11-02

第一版，从「一个页面」变成「一个插件」。

**数据层**
- 采集全部 42 个会话（含子代理会话），用真实 `parentSession` 精确挂亲子（不再靠时间猜）
- 补上 `agent-message`（团队协作对话，以前整类被丢）
- 超长消息改截断保留（不再整条丢弃）
- 世界日记接入（`world-diary` 来源）
- 多端对齐：世界那边也记了一笔的消息，标在详情里（201/218 精确匹配，不重复上星）
- 隐藏层：2006 条系统消息全文（`hidden.js`），可搜
- 判重改整段比对（修了 agent-message 前缀相同就误判的 bug，184 → 98）

**页面**
- 「来源」面板：七类来源独立开关，开启后跨层
- 「整理」：清单（搜索/排序/批量）+ 体检（10 张可点卡片）+ 按会话折叠 + 回顾卡
- 回顾卡：选一段时间 → 一张卡（这段时间的样子 / 这堆记忆的状况 / 值得再看一眼）
- 重复对照：一键"只留一条，其它隐去"
- 详情面板点不动的条目，会自动切层/清筛选把你送到那颗星（`revealNode`）
- 浮层不再铺满整窗（顶部让出 56px，不与 DSH 窗口按钮重叠）

**AI 工具**（新增，五个）
- `sea_recall` / `sea_day` / `sea_sessions` / `sea_surf` / `sea_mark`
- `sea_recall`：BM25 + 2-gram + 同义词 + 单字展开；`detail` 控长度；剪枝去重；`scope=auto` 按当前会话自动分域；`refine` 在上次结果里再筛
- `sea_mark`：AI 能写回（收藏/标签/备注/隐去），页面 8 秒内同步
- 没有的能力不挂工具（没 SurfCore 就不出现 `sea_surf`）

**工程**
- 路径全部可配置（`paths.mjs`：配置 > DSH_HOME > 自动探测），不再写死用户名
- `setup.mjs` 一条命令跑完整条管线（约 10 秒）
- `install.mjs` 一条命令装插件：profile `package.json` 两处登记（`dependencies` 的 `link:` + `dsh.profile.bundles`）→ `node_modules/@local/` 建 junction 软链 → 跑 setup；改前自动备份 `.bak-sea-<时间戳>`
- `doctor.mjs` 自检
- `sea.config.json` 暴露同义词/权重/检索参数
- 管理态从 localStorage 迁到 `marks.json` 文件（file:// 与 http:// 共用一份），键从下标改成稳定 id
