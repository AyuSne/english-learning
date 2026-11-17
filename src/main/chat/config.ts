import type { ReasoningEffort } from '../../shared/chat'

/**
 * 首版固定把思考强度传成 high，设置界面不暴露（见 docs/product-scope.md）。
 * 这个值必须显式出现在请求里，否则服务端会关闭思考。
 */
export const THINKING_EFFORT: ReasoningEffort = 'high'

export const DEFAULT_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_MODEL = 'deepseek-flash'

export type ChatConfig = {
  apiKey: string
  baseUrl: string
  model: string
}

/**
 * 模型配置先由环境变量注入，不经过设置页。缺密钥时返回 null，
 * 由对话服务在发送时给出一条明确的配置错误。
 */
export function readChatConfig(env: NodeJS.ProcessEnv): ChatConfig | null {
  const apiKey = env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) {
    return null
  }
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL
  }
}
