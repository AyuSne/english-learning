# DeepSeek 服务实测：`deepseek-flash` 的流式、思维链与错误形状

调查日期：2026-11-17。方式：`curl` 直连 `https://api.deepseek.com`（OpenAI 兼容），未安装 SDK、未运行 Electron、未写库。所有请求体均为 UTF-8 **无 BOM**。

## 1. 模型清单（`GET /models`）

| id | 名称 | 上下文 | 最大输出 | 输入 | effort |
| --- | --- | ---: | ---: | --- | --- |
| `deepseek-flash` | DeepSeek-V4.1-Flash | 1,048,576 | 393,216 | text + image | low / high / max，默认 high |
| `deepseek-v4-pro` | DeepSeek-V4-Pro | 1,048,576 | 393,216 | text | 同上 |

传错模型名时，服务端会把可选名字念出来：

```
HTTP 400
{"error":{"message":"The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed deepseek-nope. (request_id: …)","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}
```

## 2. 流式形状（SSE）

每行 `data: {…}`，增量在 `choices[0].delta`：

```
{"delta":{"role":"assistant","content":null,"reasoning_content":""}, …}
{"delta":{"content":null,"reasoning_content":"We"}, …}
…
{"delta":{"content":"…"} …}
```

- **思维链先来、正文后到**：`reasoning_content` 逐 token 增量，正文 `content` 随后。两者互斥地出现在同一个 delta 里。
- 末尾给 `finish_reason`（本次未触发长度截断）。
- 每条 chunk 带同一个 `id`，可用来把一次生成拼起来。

## 3. 非流式字段

`choices[0].message` 同时含 `content` 与 `reasoning_content`。`usage` 是：

```json
{"prompt_tokens":31,"completion_tokens":54,"total_tokens":85,
 "prompt_tokens_details":{"cached_tokens":0},
 "completion_tokens_details":{"reasoning_tokens":17},
 "prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":31}
```

思维链的 token 单独计入 `reasoning_tokens`，与 `completion_tokens` 分开可看。

## 4. 错误形状

```
HTTP 401
{"error":{"message":"Authentication Fails, Your api key: ****-key is invalid (request_id: …)","type":"authentication_error","param":null,"code":"invalid_request_error"}}
```

- 每条错误都带 `request_id`，排障时应展示或记日志。
- 注意 `type` 与 `code` 的取值并不一一对应：401 的 `type` 是 `authentication_error`，`code` 却是 `invalid_request_error`。**按 HTTP 状态码分类，不要只信 `code`。**

## 5. 对设计的影响

1. **思维链是常态，不是可选**：即使 `reasoning_effort: "low"`，`reasoning_content` 照常输出。聊天页的思考区（#17 定的折叠块）在真实接入下会一直出现，不能当边缘情况做。
2. **模型名写死会坏**：`deepseek-flash` / `deepseek-v4-pro` 是当前两个可用项，界面上模型名应是自由文本 + 可列出的建议，别做成封闭下拉。
3. **上下文 1M**：ADR 0003 的压缩（compaction）路径在我们这个体量下几乎不会触发，但规则照旧保留；压缩阈值按 `context_window - reserve` 算，别写死数字。
4. **错误分类按 HTTP 码**：401 → 换密钥、402/余额 → 充值、429 → 限流可重试、5xx → 服务繁忙可重试、网络异常 → 检查网络。`request_id` 进日志。
5. **`reasoning_tokens` 与缓存命中字段**可以用来核对"继续生成"和上下文面板的字数，但首版不必展示。

## 6. 实现注意

- 请求体必须是 **UTF-8 无 BOM**。带 BOM 时服务端直接 400：`Failed to parse the request body as JSON: expected value at line 1 column 1`。这是实测踩到的坑。
- 模型清单里 `deepseek-flash` 声明支持图片输入，`deepseek-v4-pro` 不支持；首版不做图片，但配置界面不必据此限制。

## 7. 未验证

- 429 / 402 / 5xx 的真实报文（本次没有构造出来）。
- 流式中途取消后服务端行为（本地断开即可，未测计费截断）。
- 图片输入的实际格式与可用性。
- **pi-ai 1.5.2 的映射已核实**，见 §8。
- 这批密钥为临时测试用，未写进仓库；测试结束后应轮换。

## 8. pi-ai 1.5.2 实测（2026-11-17 补）

方式：`npm i @earendil-works/pi-ai@1.5.2`，用内置 provider `@earendil-works/pi-ai/providers/deepseek` 直连，真实调用 `deepseek-flash`。

**结论一：会映射。** `reasoning_content` 被解析成 `thinking` 块，事件是 `thinking_start` / `thinking_delta` / `thinking_end`，正文是 `text_delta`；最终消息的 `content` 是 `[thinking, text]`，`usage.reasoning` 记录思维链 token 数。把带 `thinking` 的 assistant 消息整条放回上下文再请求也正常（`compat.requiresReasoningContentOnAssistantMessages: true`，会自动补 `reasoning_content`）。

**结论二：默认不给你思维链。** 不传 `reasoningEffort` 时，pi-ai 对 DeepSeek 发的是 `thinking: { type: "disabled" }`，事件里完全没有 thinking，`usage.reasoning` 为 0。要开必须传 `reasoningEffort: "low" | "high" | "max"`（模型 `thinkingLevelMap` 只映射这三个，`minimal`/`medium` 为 `null`），服务端才收到 `thinking: { type: "enabled" }` + `reasoning_effort`。

源码位置：`dist/api/openai-completions.js` 的 `thinkingFormat === "deepseek"` 分支（传 `reasoningEffort` 才 `enabled`，否则 `disabled`），以及 `dist/providers/data/deepseek.json` 里两个模型的 `thinkingLevelMap`。

**对实现的含义**：聊天层必须显式传思考强度，否则界面上那块思维链永远不出现；这与"模型本身有思维链"是两件事。

