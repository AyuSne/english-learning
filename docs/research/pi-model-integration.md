# Pi 模型接入层的可复用性

调查日期：2026-11-16。研究议题：[调查 Pi 模型接入层的可复用性](https://github.com/AyuSne/english-learning/issues/8)，供[确定首版模型接入与本地数据保存方式](https://github.com/AyuSne/english-learning/issues/7)参考。

**可以复用，首选独立的 `@earendil-works/pi-ai`。** 建议把它封装在本软件自己的模型服务接口后，负责向模型发请求；学习指令、学习上下文、词条、原句、个人学习内容及生成文章的保存仍由学习软件负责。以下建议尚未成为实现决定。

## 版本与模块边界

旧仓库 `badlogic/pi-mono` 已迁至 `earendil-works/pi`。本次 GitHub latest release 为 **v1.5.2**，发布于 2026-11-10；`stable` 分支当时也指向该版本提交 [`b4afdddf44e059c67ccf5097e5317d913521b470`](https://github.com/earendil-works/pi/tree/b4afdddf44e059c67ccf5097e5317d913521b470)。npm 新包 `latest` 同为 1.5.2，另有 `legacy-node20=0.74.2`；旧包 `@mariozechner/pi-ai` 停在 0.73.1 并声明迁移。`main` 已有后续提交，不能把它的源码当作发布包内容。[发布记录](https://github.com/earendil-works/pi/releases/tag/v1.5.2)、[发布版 README](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/README.md)、[新包元数据](https://registry.npmjs.org/@earendil-works%2fpi-ai)、[旧包元数据](https://registry.npmjs.org/@mariozechner%2fpi-ai/0.73.1)

| 模块 | 职责与本项目关系 |
| --- | --- |
| `pi-ai` | 统一模型、消息、认证与请求；可以单独使用。 |
| `pi-agent-core` | 基于 pi-ai 增加有状态 Agent、工具执行和事件循环；普通学习生成不需要。 |
| `pi-coding-agent` | 带读写文件、命令执行和会话管理的编程 CLI；不必引入。 |

上述边界见[官方包清单](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/README.md#packages)、[Agent 说明](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/agent/README.md)。v1.5.2 的发布树已没有 `pi-web-ui`；本次不把旧版同名 UI 当作可直接使用的当前组件。模型列表与能力数据可以复用，模型选择器、连接配置页、参数控件需由本软件提供。[固定版本目录](https://github.com/earendil-works/pi/tree/b4afdddf44e059c67ccf5097e5317d913521b470/packages)

## 能复用到什么程度

当前推荐 API 是 `createModels()` 加 provider factories，再调用 `models.stream/complete`；旧版全局 `getModel/complete` 已移至 `/compat`，且标明未来移除，新实现应避开旧教程入口。[迁移说明](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md#migrating-from-the-old-global-api)

- **连接与配置：** `createProvider()` 可声明自定义 provider、模型 ID、`baseUrl`、API 协议及兼容标志；请求可显式传 `apiKey`。可注册多个 provider；同一服务的多个账户可使用独立 provider ID 或请求级 key。每个 provider 只存一份凭据，配置命名、切换与持久化需自己设计。兼容 OpenAI 的服务仍可能需要调整角色、推理和 token 字段，不能保证任意地址直接可用。[自定义接入](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md#custom-providers)
- **消息与参数：** 提供统一 `Context`、消息类型、模型目录与上下文窗口等能力数据，支持 `temperature`、`maxTokens`、统一 reasoning 选项及部分协议专有参数。参数是否生效取决于模型和适配器。`Context.tools` 可省略，因此无需让模型执行工具。选择哪些原句或笔记、怎样拼接学习指令，以及结果怎样保存，都属于我们的产品逻辑。[类型定义](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/types.ts)
- **流式与失败：** 提供文本增量事件、最终消息与用量，支持 `AbortSignal`。流返回后的失败通过 `error` 事件及最终 `stopReason=error/aborted` 表达；应用不能只依赖 `try/catch`。停止按钮、部分结果展示、重试体验与保存状态需自己处理。[错误与取消契约](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md#error-handling)

## 认证与凭据保存

优先采用用户自己的 API key。请求级 key 优先，其次是已存凭据，未存时才解析环境变量等来源。默认 `InMemoryCredentialStore` 只在内存保存；通过 `createModels({ credentials })` 注入 `CredentialStore`，实现 `read/list/modify/delete`，其中 `modify` 负责串行读改写。还有 `models.login(providerId, type, interaction, options)`、`logout`、`getAuth`；“登录后持久化”实际写入的是所注入的 store。[认证源码](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/auth/resolve.ts)、[凭据接口](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/auth/types.ts)、[Models 实现](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/src/models.ts)

CLI 另有 `AuthStorage.create()`，默认写 `~/.pi/agent/auth.json`，属于 coding-agent 的 JSON 文件实现；它不是 pi-ai 默认行为。建议为本软件实现自己的凭据存储适配器，优先考虑 Windows 凭据保护。库包含部分 OAuth 流程，但这不足以证明消费者订阅或登录方式可用于我们的产品，本次不作承诺。[CLI 存储源码](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/core/auth-storage.ts)、[默认目录](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/coding-agent/src/config.ts)

## 运行条件与许可

pi-ai 是 TypeScript 源码、发布 ESM JavaScript 与类型声明；**其自身** `engines.node` 为 `>=22.19.0`。运行依赖包括 OpenAI、Anthropic、Google、AWS SDK，以及 pi-schema、pi-telemetry 等；仅导入所需 provider 有助控制打包范围。这是客户端库，不需要下载模型权重。Windows 桌面若有 Node 后台可直接封装；尚未验证我们的安装包与具体服务连通性。[包清单](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/package.json)、[打包说明](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md#bundling-and-tree-shaking)

浏览器环境受支持，但 OAuth 登录和 Bedrock 有 Node 限制；桌面方案宜把 key 和模型请求放在后台。若后端选择 Python，复用此库需要额外的 Node 进程或服务，并桥接流式、取消、错误与打包生命周期；这是架构成本推断，不是已有 Python SDK 能力。[浏览器说明](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/README.md#browser-usage)

根 `LICENSE` 为 MIT，pi-ai 包也声明 MIT；允许使用、修改和分发，分发软件副本或实质部分时须保留版权及许可声明。最终安装包还需按实际打包依赖整理第三方声明，本次未逐项审计全部传递依赖。[根许可原文](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/LICENSE)、[包许可声明](https://github.com/earendil-works/pi/blob/b4afdddf44e059c67ccf5097e5317d913521b470/packages/ai/package.json)

建议首轮固定 `pi-ai@1.5.2`，在自有模型接口后验证一个 API-key 服务的生成、流式停止和错误展示，再确定桌面运行方式。本次仅查阅官方源码与公开元数据，没有安装或运行外部代码、调用真实模型、下载权重，也没有读取本机密钥或 Pi 账户。
