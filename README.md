# 素读

面向六级备考的 Windows 桌面应用：读真题文章、圈出想学的词，把原句与出处收进词条，再用对话和钉住补充学习内容。

当前进度是**应用骨架**（#26）、**对话骨架**（#27）与**语料导入与文章库**（#28）：左侧全局栏、首页首屏空态、首次启动建本机 SQLite 库并写 schema 版本、渲染层只经一份带白名单的 bridge 访问主进程；空白线程可发消息，思维链流式流出、正文抵达后折起，可随时停止，错误按类型给文案与动作；首次启动把首批 63 篇真题从随包语料导入本机库，文章库按 7 个场次分组、可按篇名与正文搜索、右侧看详情，首页「继续阅读」指向最近打开的一篇与上次位置。文章阅读、选词、词条与钉住在后续 ticket 里落地。

## 开发

需要 Node.js 22.12 或更新版本（Electron 45 内置 Node 24）。

```bash
npm install          # 安装依赖（会下载 Electron 二进制）
npm run dev          # 开发模式启动（Vite + Electron）
npm run build        # 构建到 out/
npm run typecheck    # 主进程、渲染层、E2E 三套 tsconfig
npm run test:unit    # Vitest：迁移、设置、IPC 注册、preload bridge、路由、语料导入、文章库查询、对话流与状态
npm run test:e2e     # Playwright：构建后用临时 userData 启动开发产物
npm run package      # 打包到 release/（@electron/packager）
npm run test:e2e:packaged  # 打包后启动打包产物
npm run verify       # 以上检查全跑一遍
```

`test:e2e` 与 `test:e2e:packaged` 会各自先跑构建/打包，不需要手动准备产物。E2E 用 `--user-data-dir` 指向临时目录，退出后删除，不碰真实资料库。

## 模型配置（临时）

对话的模型配置只从环境变量读，设置页在后续 ticket 里做。开发时把 `.env.example` 复制成 `.env` 并填值；开发态启动会读取仓库根目录的 `.env`，已存在的环境变量优先。打包产物只读系统环境变量，不读 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 无 | 必填；缺失时发送会提示“还没有配置模型服务” |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI 兼容接口地址 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 模型名，自由文本 |

思考强度固定传 `high`，不在界面暴露；漏传会让服务端关闭思考，所以适配层把它作为必填参数。

模型适配层跑 `@earendil-works/pi-ai@1.5.2`，把服务商的流归一成 `thinking` / `text` / `done` / `error` 事件。pi-ai 只导出 ESM，而主进程产物是 CJS，所以用动态 `import()` 加载；electron-vite 的 `dynamicImportInCjs` 保证这个 `import()` 不被改写成 `require()`。

如果 `npm install` 卡在下载 Electron 二进制，可以先设镜像再装：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_CUSTOM_DIR = '{{ version }}'
npm install
```

## 语料

首批 63 篇真题正文在 `docs/corpus/`（manifest 加每篇一个 JSON）。构建时把其中的 JSON 复制到 `out/main/corpus/`，主进程按 `__dirname/corpus` 读，所以打包只带 `out/` 也能离线导入。

启动时与清单对一遍：以文章 id 判重，内容哈希没变就跳过；哈希变了说明源 PDF 被替换，按新内容重写这篇的段落与句子，阅读位置保留（原来的段落不在了就清空）。单篇不过（清单项不合法、句区间与正文对不上、混进中文、统计不一致等）只丢这一篇，其余照常入库，失败原因在文章库顶部列出，不静默跳过。

E2E 用 `CORPUS_DIRECTORY` 指向临时构造的语料目录，验证部分导入与提示，不碰真实语料。

## 结构

```text
src/
├── main/      主进程：窗口、SQLite 建库与迁移、语料导入、文章库查询、IPC 注册、对话流与模型适配、启动失败处理
├── preload/   contextBridge，唯一 bridge 与 channel 白名单
├── renderer/  React 界面（全局栏、首页、文章库、对话页、其它视图的占位）
├── shared/    IPC 契约与跨层类型
└── testing/   测试用的语料构造器与 SSE stub
e2e/           Playwright：dev 产物用 Electron 启动器，打包产物走 CDP；对话用本地 SSE stub
docs/          产品范围、界面 token、ADR、语料
```

本机资料库在 `app.getPath('userData')/english-learning.db`，schema 版本走 `PRAGMA user_version` 与显式迁移（见 `src/main/db/migrations.ts`）。渲染层不直接碰数据库与网络，只调用 `window.api.invoke(channel, payload)`；对话流事件通过 `window.api.subscribe('chat:event', handler)` 回到渲染层。未知 channel 在调用时由 preload 立即拒绝，主进程启动时也会校验处理函数与契约是否一一对应，缺一个或多一个都不开窗口。
