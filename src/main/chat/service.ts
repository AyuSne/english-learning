import type {
  ChatStartRequest,
  ChatStartResult,
  ChatStopResult,
  ChatStreamUpdate
} from '../../shared/chat'
import { THINKING_EFFORT, type ChatConfig } from './config'
import { streamChatCompletion } from './pi-stream'

export type ChatUpdateSender = (update: ChatStreamUpdate) => void

export type ChatService = {
  start(request: ChatStartRequest, send: ChatUpdateSender): ChatStartResult
  stop(streamId: string): ChatStopResult
}

/**
 * 一次生成的生命周期：start 立刻返回，事件经 send 推给调用方；stop 本地中断，
 * 已发出的内容由渲染层保留。同一 streamId 不会被启动两次。
 */
export function createChatService(options: {
  config: ChatConfig | null
}): ChatService {
  const active = new Map<string, AbortController>()

  return {
    start(request, send) {
      if (active.has(request.streamId)) {
        return { accepted: false }
      }

      const controller = new AbortController()
      active.set(request.streamId, controller)

      // 窗口可能在生成中途关闭；发事件失败不该把主进程的流带崩。
      const emit: ChatUpdateSender = (update) => {
        try {
          send(update)
        } catch {
          // 接收方已不在。
        }
      }

      void runStream(request, emit, controller, options.config)
        .catch(() => {
          if (!controller.signal.aborted) {
            emit({
              streamId: request.streamId,
              event: { type: 'error', error: { code: 'unknown' } }
            })
          }
        })
        .finally(() => {
          active.delete(request.streamId)
        })

      return { accepted: true }
    },

    stop(streamId) {
      const controller = active.get(streamId)
      if (!controller) {
        return { stopped: false }
      }
      controller.abort()
      return { stopped: true }
    }
  }
}

async function runStream(
  request: ChatStartRequest,
  send: ChatUpdateSender,
  controller: AbortController,
  config: ChatConfig | null
): Promise<void> {
  if (!config) {
    send({
      streamId: request.streamId,
      event: { type: 'error', error: { code: 'not-configured' } }
    })
    return
  }

  await streamChatCompletion({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    messages: request.messages,
    reasoningEffort: THINKING_EFFORT,
    signal: controller.signal,
    onEvent: (event) => send({ streamId: request.streamId, event })
  })
}
