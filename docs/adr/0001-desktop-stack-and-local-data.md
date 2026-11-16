# 桌面技术栈与本机数据边界

Electron 45（内置 Node 24.22.3）承载界面与主进程，`@earendil-works/pi-ai@1.5.2` 直接在主进程调用，免去另起 Node 服务与跨进程转发流式、取消和错误；运行时业务数据（文章、词条、原句、学习内容、配置）存 SQLite 单库；API 密钥用 Windows DPAPI（Electron `safeStorage`）单独加密保存，默认不进备份；备份是数据库快照，恢复整体替换，替换前自动留一份当前快照。

## Considered Options

- **Tauri + Node sidecar**：安装包更小，但 pi-ai 必须跑在旁挂 Node 进程里，流式、取消与打包生命周期要跨两个运行时接，失败面最大。
- **本地 Node 服务 + 浏览器界面**：最轻，但窗口、文件对话框、单实例与离线启动都要另建，个人备考桌面软件不值得。
- **JSON 文件集代替 SQLite**：词条与原句是多对多且要计数、跨文章查询，JSON 得手写索引和原子写。

## Consequences

- 安装包较大（约百余 MB），首次启动需要解压与建库。
- `better-sqlite3` 是原生模块，升级 Electron 时要重编译。
- 密钥与机器绑定，换电脑需重填；备份可在任意机器恢复文章与学习记录。
