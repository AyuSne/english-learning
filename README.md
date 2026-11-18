# 素读

面向六级备考的 Windows 桌面应用：读真题文章、圈出想学的词，把原句与出处收进词条，再用对话和钉住补充学习内容。

当前进度是**应用骨架**（#26）、**对话骨架**（#27）、**语料导入与文章库**（#28）、**阅读页与阅读设置**（#29）与**选词与原句**（#30）：左侧全局栏、首页首屏空态、首次启动建本机 SQLite 库并写 schema 版本、渲染层只经一份带白名单的 bridge 访问主进程；空白线程可发消息，思维链流式流出、正文抵达后折起，可随时停止，错误按类型给文案与动作；首次启动把首批 63 篇真题从随包语料导入本机库，文章库按 7 个场次分组、可按篇名与正文搜索、右侧看详情，首页「继续阅读」指向最近打开的一篇与上次位置；阅读页按 620 列排版，字号行距、原文注释与已收集词的弱高亮按篇记住，滚动位置写回；圈一个词或短语当场高亮并收成词条下的一条原句，同篇同句只留一条，常见词形归到同一词条，点弱高亮的词能看词条卡并删原句；随包一份裁剪后的 ECDICT 离线词典（#34），阅读划词卡、词条右栏与对话浮卡都能查音标与按词性分条的中文释义，查不到时明说「没收录」，一条释义可起草进学习内容编辑框但不自动保存。词条页与学习内容、对话上下文与回答版本、钉住与钉板（#31–#33）也已经在分支上落地。

设置页（#35）也已经接上：模型服务可保存多套并随时切换，切换只影响之后的调用；密钥用系统密钥库加密，界面只显示掩码，保存前发一次最小请求校验，被拒时保留原密钥，断网时先存为「未验证」、成功调用后自动转「已验证」；外观可选浅色 / 深色 / 跟随系统；阅读默认值在这里统一改，阅读页里按篇改的覆盖值不受影响。

收官验收（#37）把整条链路与发布前的不变量纳入了 Playwright：一条端到端用例从首页空态走到「来源回跳」，覆盖文章库、阅读选词、词条、对话、钉住与钉板归位；深色下从真实 computed style 逐项实测 WCAG 对比度；1100 / 1000 / 900 三个断点用真实窗口内容宽度验页面不横向溢出、该折的栏都折；强杀进程（不走退出收尾）后重启，阅读位置、词条、对话与钉住逐项与重启前一致；加载、导入、保存与模型错误都给出文案与下一步动作，并能在原地重试。

## 开发

需要 Node.js 22.12 或更新版本（Electron 45 内置 Node 24）。

```bash
npm install          # 安装依赖（会下载 Electron 二进制）
npm run dev          # 开发模式启动（Vite + Electron）
npm run build        # 构建到 out/
npm run typecheck    # 主进程、渲染层、E2E 三套 tsconfig
npm run test:unit    # Vitest：迁移、设置、IPC 注册、preload bridge、路由、语料导入、文章库与阅读查询、选词与词形归并、内置词典、对话流与状态、模型配置与密钥校验
npm run test:e2e     # Playwright：构建后用临时 userData 启动开发产物
npm run package      # 打包到 release/（@electron/packager）
npm run test:e2e:packaged  # 打包后启动打包产物
npm run verify       # 以上检查全跑一遍
```

`test:e2e` 与 `test:e2e:packaged` 会各自先跑构建/打包，不需要手动准备产物。E2E 用 `--user-data-dir` 指向临时目录，退出后删除，不碰真实资料库。

## 模型配置

对话以设置页里「使用中」的那套模型服务为准，每套存接口地址、模型名与密钥；切换只影响之后的调用，不动历史消息。设置页没有配置时退回环境变量（开发与 E2E 用），两边都没有就提示先配一套。

密钥在 Windows 上走 Electron `safeStorage`（DPAPI）加密后存本机库，明文不落库、也不进备份；界面只显示掩码，点「编辑」才出现输入框。填了新密钥会先发一次最小请求校验：通过才存为「已验证」；被拒（401 / 403）不落库，原密钥保留；断网或服务暂时不可用时允许保存为「未验证」，下一次成功调用自动转「已验证」。

开发时也可以把 `.env.example` 复制成 `.env` 并填值；开发态启动会读取仓库根目录的 `.env`，已存在的环境变量优先。打包产物只读系统环境变量，不读 `.env`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 无 | 没有本机配置时用它；缺失时发送会提示“还没有配置模型服务” |
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

## 词典

内置词典是从 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）裁出的只读 SQLite，放在 `assets/dictionary/`：两万核心词、四六级标签词与 63 篇语料里出现的词，另加一份词形变化到原形的 lemma 表（约 2.4 万条词头、2.3 万条映射，3.6 MB）。查询先按词形精确匹配，再按 lemma 回退到原形（approached → approach），都没有就是「没收录」；不联网，也不调用模型。

构建时复制到 `out/main/dictionary/`；打包时整个目录放进 `resources/dictionary/`（SQLite 文件不能被 native 驱动从 asar 里读，所以留在 asar 外）。E2E 用 `DICTIONARY_DIRECTORY` 指向 fixture 词典。裁剪脚本、收录范围与重新生成步骤见 [`assets/dictionary/README.md`](./assets/dictionary/README.md)，分发物带着 ECDICT 的版权声明。

## 结构

```text
src/
├── main/      主进程：窗口、SQLite 建库与迁移、语料导入、文章库与阅读查询、选词与词条查询、内置词典、设置与密钥、IPC 注册、对话流与模型适配、启动失败处理
├── preload/   contextBridge，唯一 bridge 与 channel 白名单
├── renderer/  React 界面（全局栏、首页、文章库、阅读页、词条页、对话页、设置页）
├── shared/    IPC 契约、词典查询结果与跨层类型
└── testing/   测试用的语料构造器、词典 fixture 与 SSE stub
e2e/           Playwright：dev 产物用 Electron 启动器，打包产物走 CDP；对话用本地 SSE stub
docs/          产品范围、界面 token、ADR、语料
```

本机资料库在 `app.getPath('userData')/english-learning.db`，schema 版本走 `PRAGMA user_version` 与显式迁移（见 `src/main/db/migrations.ts`）。文章、句子、阅读位置、阅读设置、词条与原句都存在这一本库里；渲染层不直接碰数据库与网络，只调用 `window.api.invoke(channel, payload)`；对话流事件通过 `window.api.subscribe('chat:event', handler)` 回到渲染层。未知 channel 在调用时由 preload 立即拒绝，主进程启动时也会校验处理函数与契约是否一一对应，缺一个或多一个都不开窗口。
