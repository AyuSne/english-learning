/**
 * 对话流在渲染层与主进程之间传递的形状。渲染层只认这套事件，
 * 不认识 SSE、HTTP 状态码或具体服务商。
 */

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 思考强度必须显式传给模型服务：不传时服务端会回到“关闭思考”，
 * 界面上的思维链永远不会出现（已实测）。
 */
export type ReasoningEffort = 'low' | 'high' | 'max'

export type ChatErrorCode =
  | 'invalid-key'
  | 'insufficient-balance'
  | 'context-too-long'
  | 'rate-limited'
  | 'server-busy'
  | 'network'
  | 'not-configured'
  | 'unknown'

export type ChatError = {
  code: ChatErrorCode
  /** 服务端返回的 HTTP 状态码；网络异常等没有响应时为空。 */
  status?: number
  /** 供日志与排障使用的服务端报文，不直接展示给学习者。 */
  detail?: string
  requestId?: string
}

export type ChatStreamEvent =
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'done' }
  | { type: 'error'; error: ChatError }

/** 一次生成的所有事件都带着同一个 streamId，渲染层据此丢弃旧流。 */
export type ChatStreamUpdate = {
  streamId: string
  event: ChatStreamEvent
}

export type ChatStartRequest = {
  threadId: string
  streamId: string
  messages: ChatTurn[]
  /** 这次带上的学习上下文；没有上下文时不传，请求里也就没有 system 消息。 */
  systemPrompt?: string
}

export type ChatStartResult = {
  accepted: boolean
}

export type ChatStopRequest = {
  streamId: string
}

export type ChatStopResult = {
  stopped: boolean
}
