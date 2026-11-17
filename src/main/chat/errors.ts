import type { ChatError, ChatErrorCode } from '../../shared/chat'

/**
 * 按 HTTP 状态码分类，不依赖服务端给的 `code`：实测 401 的 code 也是
 * `invalid_request_error`，只信状态码才不会把“换密钥”给成“重试”。
 */
export function classifyChatError(status: number | undefined): ChatErrorCode {
  if (status === undefined) {
    return 'network'
  }
  if (status === 401 || status === 403) {
    return 'invalid-key'
  }
  if (status === 402) {
    return 'insufficient-balance'
  }
  if (status === 413) {
    return 'context-too-long'
  }
  if (status === 429) {
    return 'rate-limited'
  }
  if (status >= 500 && status <= 599) {
    return 'server-busy'
  }
  return 'unknown'
}

export function chatErrorFrom(
  status: number | undefined,
  detail?: string,
  requestId?: string
): ChatError {
  const id = requestId ?? requestIdFromDetail(detail)
  return {
    code: classifyChatError(status),
    ...(status !== undefined ? { status } : {}),
    ...(detail ? { detail } : {}),
    ...(id ? { requestId: id } : {})
  }
}

/**
 * DeepSeek 把 request_id 放在错误 message 的括号里，例如
 * `Authentication Fails (request_id: 123)`。没有独立字段可读时就从这里取。
 */
export function requestIdFromDetail(detail: string | undefined): string | undefined {
  if (!detail) {
    return undefined
  }
  const matched = /\(request_id:\s*([^)]+)\)/.exec(detail)
  return matched?.[1].trim() || undefined
}
