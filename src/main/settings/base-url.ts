/** 接口地址的解析与 OpenAI 兼容路径，校验、保存与对话共用一处。 */

export function parseHttpUrl(value: string): URL | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
}

/**
 * 与 pi-ai 的 OpenAI 兼容路径一致：接口地址后接 `/chat/completions`。
 * 用户已经把完整地址写进来时保持原样，不重复拼。
 */
export function chatCompletionsEndpoint(baseUrl: string): string | null {
  const url = parseHttpUrl(baseUrl)
  if (url === null) {
    return null
  }

  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith('/chat/completions')
    ? path
    : `${path}/chat/completions`
  url.search = ''
  url.hash = ''
  return url.toString()
}
