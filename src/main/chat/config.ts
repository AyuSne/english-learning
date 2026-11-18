import type { ReasoningEffort } from '../../shared/chat'
import type { AppDatabase } from '../db/database'
import { readActiveProfile } from '../settings/profiles'
import type { SecretStore } from '../settings/secret-store'

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
  /** 来自设置页的哪套配置；环境变量配置没有这个，也不参与校验回写。 */
  profileId?: string
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

/**
 * 一次调用真正该用的配置：设置页里使用中的那套优先，没有才退回环境变量。
 * 每次调用都重新解析，所以切换配置只影响之后的调用，不动历史消息。
 */
export function resolveChatConfig(
  database: AppDatabase,
  secrets: SecretStore,
  env: NodeJS.ProcessEnv
): ChatConfig | null {
  const active = readActiveProfile(database, secrets)
  if (active !== null) {
    return {
      apiKey: active.apiKey,
      baseUrl: active.profile.baseUrl,
      model: active.profile.model,
      profileId: active.profile.id
    }
  }
  return readChatConfig(env)
}
