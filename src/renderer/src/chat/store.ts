import { useSyncExternalStore } from 'react'
import type { ChatStreamUpdate, ChatTurn } from '../../../shared/chat'
import {
  chatReducer,
  chatTurns,
  chatTurnsBefore,
  initialChatState,
  isStreaming,
  type ChatAction,
  type ChatState
} from './state'

let state: ChatState = initialChatState
const listeners = new Set<() => void>()
let connected = false

export function getChatState(): ChatState {
  return state
}

export function subscribeChat(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function dispatchChat(action: ChatAction): void {
  const next = chatReducer(state, action)
  if (next === state) {
    return
  }
  state = next
  for (const listener of [...listeners]) {
    listener()
  }
}

/**
 * 事件订阅跟随整个应用生命周期：切到别的页面再回来，正在生成的回答也不会丢。
 */
export function ensureChatEvents(): void {
  if (connected) {
    return
  }
  connected = true
  window.api.subscribe('chat:event', (update: ChatStreamUpdate) => {
    dispatchChat({
      type: 'stream',
      streamId: update.streamId,
      event: update.event,
      now: Date.now()
    })
  })
}

export function useChatState(): ChatState {
  return useSyncExternalStore(subscribeChat, getChatState, getChatState)
}

export function sendChatMessage(raw: string): boolean {
  const text = raw.trim()
  if (text === '' || isStreaming(state)) {
    return false
  }

  const streamId = newId()
  const messages = [...chatTurns(state.items), { role: 'user' as const, content: text }]
  dispatchChat({
    type: 'send',
    user: { id: newId(), text },
    assistant: { id: newId() },
    streamId
  })
  startStream(streamId, messages)
  return true
}

export function stopChat(): void {
  const streamId = state.active?.streamId
  if (!streamId) {
    return
  }
  dispatchChat({ type: 'stop', now: Date.now() })
  void window.api.invoke('chat:stop', { streamId }).catch(() => undefined)
}

export function retryChat(assistantId: string): void {
  if (isStreaming(state)) {
    return
  }
  const messages = chatTurnsBefore(state.items, assistantId)
  if (!messages) {
    return
  }

  const streamId = newId()
  dispatchChat({ type: 'restart', assistantId, streamId })
  startStream(streamId, messages)
}

export function setThinkingOpen(open: boolean): void {
  dispatchChat({ type: 'toggle-thinking', open })
}

function startStream(streamId: string, messages: ChatTurn[]): void {
  const fail = (): void => {
    dispatchChat({
      type: 'stream',
      streamId,
      event: { type: 'error', error: { code: 'unknown' } },
      now: Date.now()
    })
  }

  void window.api
    .invoke('chat:start', { streamId, messages })
    .then((result) => {
      if (!result.accepted) {
        fail()
      }
    })
    .catch(fail)
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
