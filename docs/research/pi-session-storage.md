# Pi 的会话存储：格式、恢复与可搬性

调查日期：2026-11-16。目标读者：本软件（Windows 单机英语学习软件）的会话与“钉住收录”设计。范围：`earendil-works/pi` v1.5.2，提交 [`b4afdddf44e059c67ccf5097e5317d913521b470`](https://github.com/earendil-works/pi/tree/b4afdddf44e059c67ccf5097e5317d913521b470)（下称“本版本”）。该提交下 `packages/coding-agent/package.json` 的 `version` 为 `1.5.2`，与 [v1.5.2 发布页](https://github.com/earendil-works/pi/releases/tag/v1.5.2) 一致。

**结论先说**：Pi 把会话存成 `~/.pi/agent/sessions/` 下按工作目录分组的 **JSONL 追加文件**，每条记录带 `id`/`parentId` 构成**树**，用“叶子指针”表达当前分支；恢复时整文件读入、重建当前分支的消息列表；超窗时写入一条**压缩记录**（摘要 + `firstKeptEntryId`），原始记录不删除；凭据不在会话文件里，而在同目录的 `auth.json`（权限 `0600`）。**消息块模型、树 + 叶子、压缩记录、label 式书签可以搬；JSONL 追加写、`~/.pi` 目录约定、整文件扫描式列表、以及为 coding agent 服务的工具重放与 system 消息内容不能搬。**

## 取证方式与边界

- 只读单文件原始源码与官方文档：用 `raw.githubusercontent.com` 按上述 sha 取文件；GitHub Contents API 本次被限流（HTTP 403），文件是否存在通过官方文档的 “Source files” 与逐路径探测确认。
- 未 clone 仓库、未安装或运行 pi / pi-ai、未调用模型、未读取本机任何 Pi 配置或密钥。
- 本文所有代码位置给的是**该 sha 下的行号**，链接均为 `blob/<sha>/<path>#L<行>`。

## 1. 存储格式：位置、目录、文件名

| 项 | 事实 | 一手来源 |
| --- | --- | --- |
| 形态 | JSONL（每行一个 JSON 对象，`type` 判别），非单 JSON、非 SQLite | [docs/session-format.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md)、[`SessionManager` 类注释](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L981-L992) |
| 根目录 | `~/.pi/agent/sessions/`，其下**每个工作目录一个子目录** | [`getSessionsDir()`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts)、[`getAgentDir()`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts) |
| 目录命名 | `--` + cwd（去掉开头分隔符，把 `/` `\` `:` 都替换成 `-`）+ `--` | [`getDefaultSessionDirPath()` L597](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L597) |
| 文件名 | （ISO 时间戳，`:` 与 `.` 替换成 `-`）+ `_` + `sessionId` + `.jsonl` | [`newSession()` L1084-L1085](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1084-L1085) |
| 版本 | 头部 `version`，当前 `CURRENT_SESSION_VERSION = 3` | [L45](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L45) |
| 落盘时机 | 只有出现 user/assistant 消息才创建文件；只有 system/模型设置时不落盘 | [`_hasConversation()` L1171](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1171)、[`_persist()` L1177](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1177) |
| 可改目录 | `--session-dir`、`PI_CODING_AGENT_SESSION_DIR`、`sessionDir` 设置 | [docs/sessions.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sessions.md)、[config.ts 的 `ENV_SESSION_DIR`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts) |

目录常量的来源是 `package.json` 的 `piConfig.configDir`（本版本为 `.pi`），`getAgentDir()` 返回 `homedir()/.pi/agent`，可用 `PI_CODING_AGENT_DIR` 覆盖（[config.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts)）。

写入是“首次整文件、之后追加”。首次落盘用 `openSync(file, "wx")` 把内存里的全部记录写一遍，之后每条记录 `appendFileSync` 一行（[`_persist()` L1177-L1194](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1177-L1194)）。**只有两种例外会整文件重写**：加载旧版本会话时做迁移（[`_loadEntries()` L1090-L1099](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1090-L1099) → [`_rewriteFile()` L1129](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1129)），以及克隆分支到新文件。追加失败会把刚加的记录从内存回滚，避免 `parentId` 指向不存在的父节点（[`_appendEntry()` L1196-L1211](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1196-L1211)）。

> 对 Windows 的含义：cwd 里的 `:` 和 `\` 都变成 `-`，中文路径字符原样保留。所以 `D:\AAAA英语` 会是 `--D--AAAA英语--`。这是“路径编码成目录名”，不是哈希，不可逆。

## 2. 消息结构：一条会话里存了什么

文件第一行是**头部**，不属于树：`type:"session"`、`version`、`id`、`timestamp`、`cwd`，fork/clone 生成的会话多一个 `parentSession`（指向源文件路径）（[`SessionHeader` L47](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L47)）。

其余每行都是条目，共享 `type`/`id`/`parentId`/`timestamp`（ISO 字符串）四个字段（[`SessionEntryBase` L61](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L61)）。**`parentId` 就是分支指针**：`id` 是 8 位十六进制（碰撞时退回完整 UUID），`parentId` 为 null 即根（[`generateId()` L281](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L281)）。

条目类型共 11 种（[`SessionEntry` 联合 L187-L198](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L187-L198)）：

| 类型 | 作用 | 是否进模型上下文 |
| --- | --- | --- |
| `message` | 一条 `AgentMessage` | 是 |
| `compaction` | 摘要 + `firstKeptEntryId` + `tokensBefore` + 可选 `systemMessage` | 是（摘要） |
| `branch_summary` | 离开分支时的摘要 | 是 |
| `custom_message` | 扩展注入的消息 | 是 |
| `context_edit` | 对更早条目的**只增改写**（`replacement: null` 表示从上下文剔除） | 改写他人，自身不进 |
| `model_change` / `thinking_level_change` | 切换模型 / 思考级别 | 否（只改设置） |
| `usage` | 模型用量记录（如缓存预热），带 `kind` | 否 |
| `custom` | 扩展私有状态（`customType` + `data`） | 否 |
| `label` | 给某个条目打书签（`targetId` + `label`） | 否 |
| `session_info` | 会话显示名 | 否 |

`message` 里嵌的是 `AgentMessage`，内容块为 `text` / `image` / `thinking` / `toolCall`；assistant 消息带 `api`、`provider`、`model`、`responseModel`、`usage`、`stopReason`、毫秒时间戳、`durationMs`；toolResult 带 `toolCallId`、`toolName`、`isError`、可选 `usage`/`nestedCalls`（[docs/message-types.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/message-types.md)、[packages/ai/src/types.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/types.ts)）。

两个容易漏掉但很关键的细节：

1. **system 消息也在会话里**。会话第一次请求会把完整提示词分段（`sections`）和工具声明（`toolsAdded`）当作一条 system 消息持久化，之后的变化写成补丁式 system 消息（按名覆盖 `sections`，`null` 删除）。文档明确说“按序回放即可得到当前提示词与工具，没有单独的提示词状态条目”（[session-format.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md)）。这对我们是**负债**：它把 coding agent 的工具清单钉进了每个会话文件。
2. **图片是 base64 内联**，`ImageContent.data` 直接放进制块（[packages/ai/src/types.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/types.ts)），没有外部附件表或 blob 目录。

**分支支持**：有，而且是原地分支。`branch(id)` 只把叶子指针挪到更早的条目，下一次追加自然长出新子节点，旧分支一行不删（[L1594](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1594)）；`branchWithSummary()` 在换分支时附一条摘要（[L1615](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1615)）；`createBranchedSession()` 把当前分支**复制成新文件**（[L1647](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1647)）。用户侧对应的操作是 `/tree`：选中一条历史 user 消息→文本回到编辑器→改后提交，就长出新分支，原分支保留（[docs/sessions.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sessions.md)）。

## 3. 恢复与续写

**列会话 = 全量扫描，没有索引。** `SessionManager.list(cwd)` 打开目录下每个 `*.jsonl`，用 readline 逐行读到底，算出 `messageCount`、`firstMessage`、`allMessagesText`、最新名称、活动时间（[`buildSessionInfo()` L804-L887](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L804-L887)），最多 10 个文件并发（`MAX_CONCURRENT_SESSION_INFO_LOADS`，[L896](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L896)）；`listAll()` 遍历所有项目目录，发现阶段 64 并发。只做“找最近一次/按 id 找”时才有优化：仅读第一行头部，且头部扫描上限 1 MiB（[`readSessionHeader()` L690](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L690)、[`MAX_SESSION_HEADER_SCAN_BYTES`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts)）。**结论：`/resume` 列表的代价随“会话数 × 单文件大小”线性增长。**这是从代码结构读出的，不是基准测试（本次未运行）。

**恢复上下文 = 从叶子往根走一遍。** `buildContextEntries()` 沿 `parentId` 取根→叶路径，若路径上有压缩记录，取最新那条：先放压缩条目，再从 `firstKeptEntryId` 起保留其余条目（[L480](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L480)）。`buildSessionProjection()` 再套用每个目标条目**最新**的 `context_edit`，并返回“消息 + 来源条目”配对（[L548](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L548)）。`buildSessionContext()` 输出最终 `{ messages, thinkingLevel, model }`（[L581](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L581)）。模型和思考级别不是单独状态，而是**扫描整条路径**上最后一个 `model_change`/`thinking_level_change`/assistant 消息推出来的。

**工具结果怎么处理**：工具调用与结果本身就是普通条目（`toolCall` 块在 assistant 消息里，结果是一条 `toolResult` 消息，靠 `toolCallId` 对应）。恢复时它们被“转换回模型可用的 user/assistant/tool-result 消息”（[docs/how-pi-works.md#context](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/how-pi-works.md)）。也就是说**重放的是记录下来的结果，不是重新执行工具**；恢复路径（`open`/`continueRecent`/`buildSessionContext`）里没有任何调用工具执行的代码。官方文档没有一句专门写“不重跑工具”，这一条是从代码路径判断的。

**超窗处理 = 压缩（compaction），不截断、不删原文。** 触发条件是 `contextTokens > contextWindow - reserveTokens`，默认 `reserveTokens = 16384`、`keepRecentTokens = 20000`（[compaction.ts 的 `DEFAULT_COMPACTION_SETTINGS` 与 `shouldCompact()`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/compaction/compaction.ts)）。做法：

1. 从最新往旧累加 token 估算，找到切点（**绝不在 toolResult 上切**，否则会把结果和它的调用分开）；
2. 若单个 user 消息跨度就超过预算，则在该跨度内切开，生成“历史摘要 + 该跨度前缀摘要”两段再合并（split turn）；
3. 用结构化模板让模型写摘要（Goal / Constraints / Progress / Key Decisions / Next Steps / Critical Context），并把上一份摘要当输入做**迭代更新**；
4. 追加一条 `compaction` 条目：`summary`、`firstKeptEntryId`、`tokensBefore`、`usage`、`details`、`systemMessage`；**原始条目一条不删**；
5. 之后每次请求都用「摘要 + 从 `firstKeptEntryId` 起的消息」重建上下文（[docs/compaction.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/compaction.md)）。

另有两条相关机制：`/tree` 换分支时生成 `branch_summary`（[branch-summarization.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/compaction/branch-summarization.ts)）；溢出或 `stopReason:"length"` 时走一次“压缩后重试”的恢复路径，先写 `context_edit` 剔除被放弃的那次尝试，再压缩。摘要请求本身也有一条硬规则：`stopReason:"length"` 的摘要**不能**入库，因为它是残缺的（[`getSummarizationFailure()`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/compaction/compaction.ts)）。

## 4. 凭据与配置：会话文件里没有密钥

- **会话文件不含凭据。** `session-manager.ts` 全文没有 `apiKey`、`auth`、`secret` 这类字段（本次对取回的全文做了检索，仅在 `tokensBefore` 等处命中 `token`）；头部只有 `id`/`timestamp`/`cwd`/`parentSession`。
- **凭据单独存** `~/.pi/agent/auth.json`：`FileAuthStorageBackend` 以 `mode: 0o600` 建文件、`0o700` 建目录，写入走 `proper-lockfile` 加锁的读改写，Windows 上还专门处理了锁目录 EPERM 重试（[auth-storage.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/auth-storage.ts)）。这台机器上我们只需要 DPAPI，不需要照抄锁协议。
- **其他配置**在 `~/.pi/agent/`：`settings.json`、`models.json`、`prompts/`、`themes/`、`bin/`、调试日志（[config.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts)）；项目级还有 `<project>/.pi/settings.json`（[docs/compaction.md#settings](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/compaction.md)）。
- **但会话文件仍然敏感**：官方对 `/export`、`/share` 的警告明确列出“提示词、模型回复、工具参数、命令输出、文件内容、扩展消息”（[docs/sessions.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sessions.md)）。会话不加密，也没看到对 `sessions/` 目录做权限收紧——**未验证**该目录的实际权限，因为我没有在真机上安装。

## 5. pi-ai 层有没有会话概念

**没有。pi-ai 不持久化任何会话，它只负责“一次请求 + 一份可序列化的上下文类型”。**

- 它提供的是 `Context`（`systemPrompt` + `messages` + `tools`），官方文档的原话是可以用标准 JSON 序列化/反序列化，“便于持久化会话、实现聊天历史或跨服务传递上下文”——**存到数据库、localStorage、文件都行，选择权在调用方**（[packages/ai/README.md#context-serialization](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md)）。
- `StreamOptions.sessionId` 看着像会话，**其实不是**：注释写的是“供支持会话级缓存的 provider 使用，用来开启 prompt caching、请求路由等”（[types.ts 的 `StreamOptions.sessionId`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/types.ts)）；README 里它对应 Anthropic 的 `message-threads` 服务端续写和 OpenRouter 的 `x-session-id`（[README](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md)）。
- 它唯一的持久化抽象是**凭据** `CredentialStore`（`read/list/modify/delete`），默认实现只在内存，持久化由宿主注入（[README#credential-store](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md)）。

所以：**会话管理 100% 属于 `pi-coding-agent` 的 `SessionManager`，与我们只引入 pi-ai 直接相关的是 `Context` / `Message` 这套类型，以及“上下文可序列化”这一前提。**这也意味着我们完全可以自己用 SQLite 存，不违反 pi-ai 的用法。

## 6. 官方文档怎么说

| 文档 | 关于 session / resume / compaction 的关键表述 |
| --- | --- |
| [docs/sessions.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sessions.md) | 默认自动保存；`--continue` 续最近、`--resume` 开选择器、`/new` 新建；`/tree` 在同一文件内换分支、`/fork` 复制成新会话、`/clone` 复制当前分支；接近上限时自动压缩，`/compact` 手动压缩；会话记创建时的工作目录且不再变；`/export` 出 HTML 或 JSONL，`/share` 上传 |
| [docs/session-format.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md) | JSONL 契约、目录与文件名、v1/v2/v3 版本与自动迁移、各条目类型的字段与示例、树结构与上下文构建规则 |
| [docs/compaction.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/compaction.md) | 阈值公式与默认值、切点规则、split turn、条目结构、溢出/长度恢复顺序、`session_before_compact` 钩子、按模型的 `reserveTokens` 覆盖 |
| [docs/how-pi-works.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/how-pi-works.md) | “持久会话是 JSONL，每条树条目有 ID 并指向父节点，当前条目决定活动分支”；上下文由活动分支转换而来 |
| [docs/message-types.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/message-types.md) | `AgentMessage` 联合与全部内容块、`Usage` 形状、毫秒时间戳与 ISO 条目时间的区别 |
| [docs/sdk.md#sessionmanager-api](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sdk.md) | `SessionManager` 对最终模型上下文有权威性；“把外部历史塞回 `session.agent.state.messages` 不会替换已持久化的上下文”，要恢复得用带条目的 manager 构造 |
| [packages/ai/README.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md) | pi-ai 只提供可序列化的 `Context`；`sessionId` 是缓存/路由参数；凭据靠注入的 `CredentialStore` |

## 7. 对比：Pi 的 JSONL 树 vs 我们已定的 SQLite 单库

前提：我们的决定见 [ADR 0001](../adr/0001-desktop-stack-and-local-data.md)（Electron 主进程直调 pi-ai、运行时数据进 SQLite 单库、密钥走 DPAPI）。下表“Pi”一列是可核实的行为，“SQLite”一列是**结构推断**，不是实测。

| 维度 | Pi（JSONL + 目录 = 工作区） | 我们（SQLite 单库） | 谁更省事 |
| --- | --- | --- | --- |
| 恢复速度 / 列表 | 列表要读**每个文件全文**才能算消息数、首条消息（`buildSessionInfo`），10 并发；只有找最近/找 id 才只读头部 | 一条 `SELECT` 走 `thread(updated_at)` 索引；标题、消息数、首条消息可做冗余列 | SQLite。这是唯一的硬性能差距 |
| 分支 | 原生：`id`/`parentId` + 叶子指针，原地分支，旧分支不丢；也有“复制成分支新文件” | 同样能建模（`parent_id` + `thread.leaf_id`），但要自己写递归/路径查询 | 平手，**结构可以照搬** |
| 附件 / 长文本 | base64 内联进 JSONL；工具输出可极长；单文件无上限，只能靠压缩摘要降上下文，**文件本身不会被裁** | 文本入表、二进制入磁盘 blob 目录按 sha256 引用；DB 保持小 | SQLite。内联 base64 会让备份和列表读取一起变慢 |
| 可迁移备份 | 整目录拷贝即备份，副本可在任意机器读（HTML/JSONL 还能直接分享） | 快照 + blob 目录；需保证两者一致（先快照 DB 再拷 blob，或单文件包） | Pi 更“天然”，但我们要的是可校验的一致备份 |
| 隐私 | 明文 JSONL 在主目录，含提示词/输出/文件内容；凭据另存（0600） | 明文 DB + DPAPI 存密钥；单文件便于设 ACL，但**默认同样不加密** | 平手。谁都要额外做加密才有实质提升 |
| 实现成本 | 语言层简单（追加一行），但列表、搜索、并发、损坏恢复全靠手写 | schema + 迁移要一次性投入；之后查询、事务、约束都免费 | 短期 Pi 便宜，长期 SQLite 便宜 |
| 单条写入成本 | 每条消息/工具结果一次同步 `appendFileSync`（未见 fsync） | 一次事务；可批量提交，崩溃时靠 WAL 恢复 | SQLite |
| 并发与损坏 | 会话文件**不加锁**（只有 `auth.json` 用 `proper-lockfile`）；两个进程同写一个会话没有保护；解析时坏行被跳过（`parseSessionEntryLine` 的 catch） | 事务 + 外键 + `PRAGMA integrity_check` | SQLite |
| 跨会话查询 | 只能全目录扫描；没有 SQL | 直接 join（词条 ↔ 原句 ↔ 会话 ↔ 钉住） | SQLite。我们的“钉住落点”本来就是多对多 |
| 版本演进 | 头部 `version` + 加载时**原地重写**迁移 | `PRAGMA user_version` + 显式迁移脚本，不改写历史 | SQLite 更安全（Pi 那种“打开即改写文件”有风险） |

## 8. 能直接搬 / 不能搬

**能搬（结构和语义层面）**

1. **条目判别联合 + `id`/`parentId` + 叶子指针**。这是整个方案最值钱的部分：编辑上一条消息产生分支，不需要新表、不需要拷贝历史（[L61](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L61)、[L1594](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1594)）。
2. **消息块模型**：`text` / `thinking` / `image` / `toolCall` + `toolResult`（带 `toolCallId`），assistant 带 `provider`/`model`/`usage`/`stopReason`/`durationMs`。我们即使不做工具，也建议保留 `toolCall`/`toolResult` 两个块类型占位，便于以后加“查词/朗读”这类工具而不破格式（[message-types.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/message-types.md)）。
3. **`label` 的“书签指向条目 id”模式**——这正是“钉住”需要的形状：`targetId` + 值，且不改动被指向的条目（[session-format.md#labelentry](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md)）。但**只搬形状**：Pi 的 `label` 只有一个字符串，不含快照、不含出处、不含落点。
4. **`context_edit` 的“只增改写”**：需要让用户“删掉某条历史但不破坏记录”时，写一条剔除记录，而不是 UPDATE 原消息（[session-format.md#contexteditentry](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md)）。
5. **压缩记录的三字段语义**：`summary` + `firstKeptEntryId` + `tokensBefore`，原始消息不删。这套语义和我们“自由聊天 + 钉住”完全相容：钉住的快照另存，压缩只影响**发给模型的上下文**（[compaction.md#compactionentry-structure](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/compaction.md)）。
6. **切点规则**：不在工具结果上切、超预算的单轮拆成“前缀摘要 + 历史摘要”再合并（[docs/compaction.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/compaction.md)）。
7. **“没有第一条消息就不建文件”**：空会话不留垃圾记录（[L1165-L1175](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1165-L1175)）。
8. **`parentSession` 指针**：fork 出来的会话记住来源，便于“从这个会话派生”的追溯（[SessionHeader](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L47)）。
9. **版本号 + 迁移函数**的思路（但改成显式迁移，别在加载时改写历史）。
10. **`/export` 支持 JSONL/HTML** 作为“导出格式”而非“存储格式”：适合做用户可读的归档与排障。

**不能搬（或不该搬）**

1. **`~/.pi` 目录 + 用 cwd 编码目录名**。这是终端工具的约定；单机桌面软件没有“项目目录”概念，会话应归用户/主题，不是归路径（[config.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts)、[L597](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L597)）。
2. **JSONL 追加写**：列表要全量读、搜索要全量扫、没有事务、没有约束、坏行只能跳过。我们的数据是词条/原句/钉住的多对多，正需要 SQL。
3. **整文件扫描式列表**（`buildSessionInfo` 逐行读满全文件）。这是 Pi 列表慢的根因，也是我们必须用索引列的直接理由。
4. **system 消息里存完整提示词 + 工具声明 + 按名打补丁**。那是 coding agent 为了“回放得到当前工具集”设计的；我们的提示词由程序生成，存快照日志即可，不必进会话正文（[session-format.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md)）。
5. **工具相关的一整套**：`bashExecution` 角色、`nestedCalls`、`readFiles`/`modifiedFiles` 的累积式文件追踪、工具重放语义、溢出时“剔除被放弃的尝试”再重试——都是为编码代理服务，我们没有对等需求（[compaction.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/compaction/compaction.ts)）。
6. **8 位随机 id（最多 100 次尝试去重）**。SQLite 里直接用行 id 或 UUIDv7 更省事；`uuidv7` 已在 pi-ai 里，可时间有序（[L281](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L281)）。
7. **`/tree` 时让模型给被放弃的分支写摘要**：对“按话题复习”可能有用，但对自由聊天是噪音；建议做成可选动作，而不是导航默认行为（[sessions.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sessions.md)）。
8. **加载即原地重写文件**的迁移方式（[L1090-L1099](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts#L1090-L1099)）。老版本数据一打开就被改，出问题无法回退。

## 9. 建议的混合落点

一句话：**正文与索引进 SQLite；钉住存“不可变快照”；文件只用来放二进制和导出。**

| 数据 | 存哪 | 形状建议 |
| --- | --- | --- |
| 会话正文 | SQLite `entry` 表 | 照搬 Pi 的判别联合：`entry(id TEXT PK, thread_id, parent_id NULL, type TEXT, payload JSON, created_at)`，上层用 TS 判别联合映射 `message` / `compaction` / `context_edit` / `label` / `session_info`；`thread.leaf_id` 存当前叶子。选 JSON payload 而不是把每种块拆表，是为了让“消息结构演进”只改解析层，不动 schema |
| 消息块 | 同上（payload 内） | `text`/`thinking`/`image`/`toolCall`/`toolResult` 与 pi-ai 的 `Message` 类型保持一致，减少适配层 |
| 钉住（含出处） | SQLite `pin` 表，**独立于 entry** | `pin(id, thread_id, entry_id, block_index, captured_text, captured_at, model, provenance JSON, target_kind, target_id)`。三条硬要求：①`captured_text` 是**复制**，之后压缩、编辑、删除会话都不影响它；②`provenance` 记 `thread_id` + `entry_id` + 当次生成的消息时间戳/模型 + 命中的原句 id 列表；③`target_kind` 三态（词条 / 文章 / 未归档），`target_id` 可空 |
| 索引 | SQLite 列 + 可选 FTS5 | `thread(title, updated_at, message_count, first_message_excerpt)` 冗余列，列表页一次查询搞定；需要全文搜索再上 FTS5；**不要**每次列表都去扫 payload |
| 附件 | 磁盘 blob 目录 + DB 引用 | `blob(sha256 PK, mime, bytes, path)`；文件按 sha256 去重。会话里只存 `blob_ref`，不要 base64 进库——这是 Pi 的教训（[types.ts `ImageContent.data`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/types.ts)） |
| 密钥 | DPAPI（`safeStorage`），**不入库、不入备份** | 沿用 ADR 0001；Pi 的 `auth.json` 0600 只是“文件权限”，在 Windows 上不如 DPAPI 与机器绑定 |
| 导出 / 归档 | 文件，按需生成 | 单会话导出 JSONL（可读、可 diff、与 Pi 格式大致兼容）；整库备份用 SQLite 快照 + blob 目录打包 |
| 备份 | SQLite 在线备份 + blob 目录 | 先快照 DB、再拷 blob（blob 只增不删），恢复时校验 sha256；密钥排除在外，符合 ADR 0001 |

**压缩策略建议照抄语义、不照抄实现**：阈值用 `模型 contextWindow - reserve`，保留最近 N token，摘要写入一条新 entry（带 `first_kept_entry_id`），原文永久保留。差别在于我们的 `entry` 是行，查“这一轮用了多少 token”直接查列，不用扫文件。

## 10. 未找到 / 未验证

- **未找到**：Pi 有任何“恢复时重放/重跑工具调用”的说明。代码路径只重建消息，未见重新执行；文档也未明确写“不重跑”。本文按代码判断，标注为推断。
- **未找到**：`sessions/` 目录本身的权限或加密设置。能确认的只有 `auth.json` 的 `0600`/目录 `0700`（[auth-storage.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/auth-storage.ts)）。
- **未找到**：单会话文件大小上限、截断或分卷机制。代码里没有，只有上下文压缩。
- **未找到**：任何官方性能数据（会话列表耗时、会话数上限）。第 7 节的“恢复速度”是从 `buildSessionInfo` 的读法推断的，不是实测。
- **未找到**：pi-ai 里任何会话存储 API。`sessionId` 仅是缓存/路由参数（[types.ts](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/types.ts)、[README](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md)）。
- **未验证**：`appendFileSync` 是否伴随 fsync（代码中未见显式 fsync）；断电时的实际可靠性。
- **未验证**：GitHub Contents API 本次返回 403（限流），目录列表是靠官方文档的 “Source files” 段和逐路径探测得到的，可能漏掉本版本中存在但我没取到的文件（例如 `src/core/messages.ts`、`src/core/extensions/*`）。
- 本次没有安装、运行或反编译 pi / pi-ai，没有 clone 仓库，没有读取任何真实密钥或会话文件。

## 参考来源（全部一手，固定在同一提交）

- 发布：[v1.5.2](https://github.com/earendil-works/pi/releases/tag/v1.5.2)；提交树：[b4afdddf](https://github.com/earendil-works/pi/tree/b4afdddf44e059c67ccf5097e5317d913521b470)
- 源码：[`src/core/session-manager.ts`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/session-manager.ts)、[`src/config.ts`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts)、[`src/core/auth-storage.ts`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/auth-storage.ts)、[`src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/compaction/compaction.ts)、[`src/core/compaction/index.ts`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/compaction/index.ts)、[`packages/ai/src/types.ts`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/types.ts)、[`packages/ai/README.md`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md)、[`packages/coding-agent/package.json`](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/package.json)
- 文档：[sessions.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sessions.md)、[session-format.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/session-format.md)、[compaction.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/compaction.md)、[message-types.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/message-types.md)、[how-pi-works.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/how-pi-works.md)、[sdk.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/sdk.md)、[docs/index.md](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/docs/index.md)
- 仓库内相关：[ADR 0001 桌面技术栈与本机数据边界](../adr/0001-desktop-stack-and-local-data.md)、[Pi 模型接入层的可复用性](./pi-model-integration.md)
