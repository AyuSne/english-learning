# DeepSeek chat-demo 的 LLM 交互可借鉴点

调查日期：2026-11-16。对象是 [deepseek-ai/chat-demo](https://github.com/deepseek-ai/chat-demo)（MIT，2026-11-13 更新，约 3.8k star）。它是静态聊天示例：React + rspack，浏览器直连 DeepSeek API（Anthropic 兼容的 Messages / Files API），无应用后端，设置存 localStorage、会话存 IndexedDB。本次只读源码，未安装、未运行、未接入任何真实服务。

## 值得借的

1. **输入区**：发送与停止是同一个按钮，流式中原地变成停止；Enter 发送、Shift+Enter 换行、输入法组合状态不误发；草稿按会话保存，切换不丢；生成过程中输入框仍可编辑下一条。
2. **结果生命周期**：streaming / done / stopped / error 四态，错误带结构化信息；停止是正常状态而不是异常；中断后已输出的内容保留。
3. **迭代方式**：重新生成产生新版本，版本可切换、旧版本不丢；输出因上限被截断时可以“继续生成”。
4. **错误分类与文案**：按 401 / 402 / 413 / 429 / 5xx / 网络分类，各类给具体文案和动作（去改 Key、去充值）；只有网络、限流、服务端繁忙算可重试。
5. **密钥录入**：保存后只显示掩码，点编辑才重新输入；提交时先校验再保存，错误显示在字段下方。
6. **流式 Markdown**：解析与渲染做节流，长输出不卡；代码块、公式、图表按需加载。
7. **无障碍细节**：开关有 `aria-pressed`，按钮有 `aria-label` 与 Tooltip，移动端不自动聚焦避免弹键盘。

## 不照搬

- 多会话侧栏、自动标题、历史 ZIP 导入导出：我们按文章与词条组织，不按会话组织。
- 深度思考、联网搜索、链接阅读、语音、附件：首版不需要，生成文章也不该联网。
- API Key 存 localStorage 明文：我们用 Windows DPAPI。

## 对我们界面与交互的影响

- 生成结果用“结果卡 + 版本”组织：每次重新生成或改写产生一个版本，卡上可切换，保存时选一个版本；不做完整对话线程。
- 增加“继续生成”：输出达到上限时接着写，新内容接在同一版本后。
- 设置页的密钥字段改成“已保存显示掩码 + 编辑重输 + 提交前校验”。
- 错误提示按类型给具体文案与动作，只有可重试类错误显示重试按钮。
- 生成过程中输入区不锁死，发送键在流式中变成停止键。
- 学习上下文面板仍由我们自己做：chat-demo 只显示附件，不显示“这次发了哪些原句和段落”，这部分它没有可借的。

参考文件（仓库内路径）：`src/components/chatInput/ChatInput.tsx`、`src/components/messages/AssistantMessage.tsx`、`src/services/chat/reply.ts`、`src/services/api/errors.ts`、`src/components/settings/ApiKeyField.tsx`。
