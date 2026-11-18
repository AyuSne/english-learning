import type { AssistantMessage, Context, Model } from '@earendil-works/pi-ai'
import type { ChatError, ChatStreamEvent, ChatTurn, ReasoningEffort } from '../../shared/chat'
import { chatErrorFrom, requestIdFromDetail } from './errors'

export type StreamChatOptions = {
  baseUrl: string
  apiKey: string
  model: string
  messages: readonly ChatTurn[]
  /** 学习上下文以 system 消息打头；没有上下文时不传。 */
  systemPrompt?: string
  /** 必填：漏传就发不出去，避免服务端静默关闭思考。 */
  reasoningEffort: ReasoningEffort
  signal: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

/**
 * 把 pi-ai 的事件归一成 thinking / text / done / error 四种事件。
 * 渲染层不需要知道 pi-ai、SSE 或状态码。
 *
 * pi-ai 1.5.2 只导出 ESM（`exports` 没有 require 条件），而主进程产物是 CJS，
 * 所以这里用动态 import 加载；`dynamicImportInCjs` 保持 CJS 里的 import()。
 */
export async function streamChatCompletion(options: StreamChatOptions): Promise<void> {
  if (!options.reasoningEffort) {
    throw new Error('思考强度必须显式传入，否则模型服务会关闭思考')
  }

  let status: number | undefined
  let requested = false

  try {
    const pi = await loadPi()
    const catalog = pi.DEEPSEEK_MODELS as unknown as Record<
      string,
      Model<'openai-completions'>
    >
    const catalogModel = catalog[options.model] ?? catalog['deepseek-flash']
    if (!catalogModel) {
      throw new Error('pi-ai 的 DeepSeek 模型目录里找不到 deepseek-flash')
    }
    const model: Model<'openai-completions'> = {
      ...catalogModel,
      id: options.model,
      name: options.model,
      baseUrl: options.baseUrl
    }

    const provider = pi.createProvider({
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: options.baseUrl,
      // 必需，但请求级的 apiKey 会优先；这里只声明“密钥从调用处来”。
      auth: {
        apiKey: {
          name: 'DeepSeek API key',
          resolve: async () => ({ auth: {} })
        }
      },
      models: [model],
      api: pi.openAICompletionsApi()
    })

    const models = pi.createModels()
    models.setProvider(provider)

    const stream = models.stream(model, toContext(options.messages, options.model, options.systemPrompt), {
      apiKey: options.apiKey,
      reasoningEffort: options.reasoningEffort,
      signal: options.signal,
      // 重试由界面决定，模型层不自动重试。
      maxRetries: 0,
      fetch: async (input, init) => {
        requested = true
        const response = await fetch(input, init)
        status = response.status
        return response
      }
    })

    for await (const event of stream) {
      switch (event.type) {
        case 'thinking_delta':
          options.onEvent({ type: 'thinking', text: event.delta })
          break
        case 'text_delta':
          options.onEvent({ type: 'text', text: event.delta })
          break
        case 'done':
          options.onEvent({ type: 'done' })
          return
        case 'error':
          if (event.reason === 'aborted' || options.signal.aborted) {
            return
          }
          options.onEvent({
            type: 'error',
            error: failureError(
              status,
              requested,
              event.error.errorMessage ?? '模型服务中断了这次生成'
            )
          })
          return
        default:
          break
      }
    }

    options.onEvent({ type: 'done' })
  } catch (error) {
    if (options.signal.aborted) {
      return
    }
    options.onEvent({
      type: 'error',
      error: failureError(status, requested, describeError(error))
    })
  }
}

type PiModules = {
  createModels: typeof import('@earendil-works/pi-ai').createModels
  createProvider: typeof import('@earendil-works/pi-ai').createProvider
  openAICompletionsApi: typeof import(
    '@earendil-works/pi-ai/api/openai-completions.lazy'
  ).openAICompletionsApi
  DEEPSEEK_MODELS: typeof import(
    '@earendil-works/pi-ai/providers/deepseek.models'
  ).DEEPSEEK_MODELS
}

let modules: Promise<PiModules> | null = null

function loadPi(): Promise<PiModules> {
  if (!modules) {
    modules = Promise.all([
      import('@earendil-works/pi-ai'),
      import('@earendil-works/pi-ai/api/openai-completions.lazy'),
      import('@earendil-works/pi-ai/providers/deepseek.models')
    ]).then(([pi, api, catalog]) => ({
      createModels: pi.createModels,
      createProvider: pi.createProvider,
      openAICompletionsApi: api.openAICompletionsApi,
      DEEPSEEK_MODELS: catalog.DEEPSEEK_MODELS
    }))
    modules = modules.catch((error: unknown) => {
      // 加载失败不要留下永远 reject 的缓存，下一次发送还能再试。
      modules = null
      throw error
    })
  }
  return modules
}

function toContext(
  messages: readonly ChatTurn[],
  model: string,
  systemPrompt: string | undefined
): Context {
  return {
    ...(systemPrompt ? { systemPrompt } : {}),
    messages: messages.map((turn) =>
      turn.role === 'user'
        ? { role: 'user', content: turn.content, timestamp: Date.now() }
        : assistantMessage(turn.content, model)
    )
  }
}

function assistantMessage(text: string, model: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'deepseek',
    model,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: 'stop',
    timestamp: Date.now()
  }
}

/**
 * 分类只看 HTTP 状态码。响应已经 2xx 之后断流算网络异常；请求还没发出去
 * 就失败（例如适配层自身出错）算未知错误，不误导成“检查网络”。
 */
function failureError(
  status: number | undefined,
  requested: boolean,
  detail: string
): ChatError {
  const requestId = requestIdFromDetail(detail)
  if (!requested) {
    return { code: 'unknown', detail, ...(requestId ? { requestId } : {}) }
  }
  if (status === undefined || (status >= 200 && status < 300)) {
    return { code: 'network', detail, ...(requestId ? { requestId } : {}) }
  }
  return chatErrorFrom(status, detail)
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
