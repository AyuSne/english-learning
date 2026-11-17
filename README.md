# 素读

面向六级备考的 Windows 桌面应用：读真题文章、圈出想学的词，把原句与出处收进词条，再用对话和钉住补充学习内容。

当前进度是**应用骨架**（#26）：左侧全局栏、首页首屏空态、首次启动建本机 SQLite 库并写 schema 版本、渲染层只经一份带白名单的 bridge 访问主进程。文章、阅读、选词、词条与对话在后续 ticket 里落地。

## 开发

需要 Node.js 22.12 或更新版本（Electron 45 内置 Node 24）。

```bash
npm install          # 安装依赖（会下载 Electron 二进制）
npm run dev          # 开发模式启动（Vite + Electron）
npm run build        # 构建到 out/
npm run typecheck    # 主进程、渲染层、E2E 三套 tsconfig
npm run test:unit    # Vitest：迁移、设置、IPC 注册、preload bridge、路由
npm run test:e2e     # Playwright：构建后用临时 userData 启动开发产物
npm run package      # 打包到 release/（@electron/packager）
npm run test:e2e:packaged  # 打包后启动打包产物
npm run verify       # 以上检查全跑一遍
```

`test:e2e` 与 `test:e2e:packaged` 会各自先跑构建/打包，不需要手动准备产物。E2E 用 `--user-data-dir` 指向临时目录，退出后删除，不碰真实资料库。

如果 `npm install` 卡在下载 Electron 二进制，可以先设镜像再装：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_CUSTOM_DIR = '{{ version }}'
npm install
```

## 结构

```text
src/
├── main/      主进程：窗口、SQLite 建库与迁移、IPC 注册、启动失败处理
├── preload/   contextBridge，唯一 bridge 与 channel 白名单
├── renderer/  React 界面（全局栏、首页、其它视图的占位）
└── shared/    IPC 契约与跨层类型
e2e/           Playwright：dev 产物用 Electron 启动器，打包产物走 CDP
docs/          产品范围、界面 token、ADR、语料
```

本机资料库在 `app.getPath('userData')/english-learning.db`，schema 版本走 `PRAGMA user_version` 与显式迁移（见 `src/main/db/migrations.ts`）。渲染层不直接碰数据库与网络，只调用 `window.api.invoke(channel, payload)`；未知 channel 在调用时由 preload 立即拒绝，主进程启动时也会校验处理函数与契约是否一一对应，缺一个或多一个都不开窗口。
