import type { ChatError, ChatStreamEvent, ChatTurn } from '../../../shared/chat'

export type AssistantPhase =
  | 'waiting'
  | 'thinking'
  | 'writing'
  | 'done'
  | 'stopped'
  | 'error'

export type ThinkingBlock = {
  text: string
  startedAt: number
  endedAt: number | null
}

export type UserItem = {
  id: string
  role: 'user'
  text: string
}

export type AssistantItem = {
  id: string
  role: 'assistant'
  text: string
  phase: AssistantPhase
  thinking: ThinkingBlock | null
  error: ChatError | null
}

export type ChatItem = UserItem | AssistantItem

export type ActiveStream = {
  streamId: string
  assistantId: string
}

export type ChatState = {
  items: readonly ChatItem[]
  /** 正在生成的那条回答；null 表示空闲。重试旧回答时指向旧条目，不落到最后一条。 */
  active: ActiveStream | null
  /** 学习者手动展开/折起思维链的选择；null 表示按当前阶段自动。 */
  thinkingOpen: boolean | null
}

export const initialChatState: ChatState = {
  items: [],
  active: null,
  thinkingOpen: null
}

export type ChatAction =
  | {
      type: 'send'
      user: { id: string; text: string }
      assistant: { id: string }
      streamId: string
    }
  | { type: 'stream'; streamId: string; event: ChatStreamEvent; now: number }
  | { type: 'stop'; now: number }
  | { type: 'restart'; assistantId: string; streamId: string }
  | { type: 'toggle-thinking'; open: boolean }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send':
      return {
        ...state,
        active: { streamId: action.streamId, assistantId: action.assistant.id },
        items: [
          ...state.items,
          { id: action.user.id, role: 'user', text: action.user.text },
          {
            id: action.assistant.id,
            role: 'assistant',
            text: '',
            phase: 'waiting',
            thinking: null,
            error: null
          }
        ]
      }

    case 'stream':
      return applyStreamEvent(state, action.streamId, action.event, action.now)

    case 'stop': {
      const active = state.active
      if (!active) {
        return state
      }
      return {
        ...state,
        active: null,
        items: replaceAssistant(state.items, active.assistantId, (item) => ({
          ...item,
          phase: 'stopped',
          thinking: finishThinking(item.thinking, action.now)
        }))
      }
    }

    case 'restart': {
      const existing = findAssistant(state.items, action.assistantId)
      if (!existing) {
        return state
      }
      return {
        ...state,
        active: { streamId: action.streamId, assistantId: action.assistantId },
        items: replaceAssistant(state.items, action.assistantId, () => ({
          id: action.assistantId,
          role: 'assistant',
          text: '',
          phase: 'waiting',
          thinking: null,
          error: null
        }))
      }
    }

    case 'toggle-thinking':
      return { ...state, thinkingOpen: action.open }
  }
}

export function isStreaming(state: ChatState): boolean {
  return state.active !== null
}

function applyStreamEvent(
  state: ChatState,
  streamId: string,
  event: ChatStreamEvent,
  now: number
): ChatState {
  const active = state.active
  if (!active || active.streamId !== streamId) {
    return state
  }

  const assistant = findAssistant(state.items, active.assistantId)
  if (!assistant) {
    return state
  }

  switch (event.type) {
    case 'thinking': {
      if (event.text === '' || (assistant.phase !== 'waiting' && assistant.phase !== 'thinking')) {
        return state
      }
      const thinking = assistant.thinking
        ? { ...assistant.thinking, text: assistant.thinking.text + event.text }
        : { text: event.text, startedAt: now, endedAt: null }
      return {
        ...state,
        items: replaceAssistant(state.items, active.assistantId, (item) => ({
          ...item,
          phase: 'thinking',
          thinking
        }))
      }
    }

    case 'text': {
      if (event.text === '') {
        return state
      }
      return {
        ...state,
        items: replaceAssistant(state.items, active.assistantId, (item) => ({
          ...item,
          phase: 'writing',
          text: item.text + event.text,
          thinking: finishThinking(item.thinking, now)
        }))
      }
    }

    case 'done': {
      return {
        ...state,
        active: null,
        items: replaceAssistant(state.items, active.assistantId, (item) => ({
          ...item,
          phase: 'done',
          thinking: finishThinking(item.thinking, now)
        }))
      }
    }

    case 'error': {
      return {
        ...state,
        active: null,
        items: replaceAssistant(state.items, active.assistantId, (item) => ({
          ...item,
          phase: 'error',
          error: event.error,
          thinking: finishThinking(item.thinking, now)
        }))
      }
    }
  }
}

function finishThinking(thinking: ThinkingBlock | null, now: number): ThinkingBlock | null {
  if (!thinking || thinking.endedAt !== null) {
    return thinking
  }
  return { ...thinking, endedAt: now }
}

function replaceAssistant(
  items: readonly ChatItem[],
  id: string,
  update: (item: AssistantItem) => AssistantItem
): readonly ChatItem[] {
  const index = items.findIndex((item) => item.role === 'assistant' && item.id === id)
  if (index === -1) {
    return items
  }
  const next = [...items]
  next[index] = update(next[index] as AssistantItem)
  return next
}

function findAssistant(items: readonly ChatItem[], id: string): AssistantItem | null {
  const item = items.find((candidate) => candidate.role === 'assistant' && candidate.id === id)
  return item?.role === 'assistant' ? item : null
}

/**
 * 发给模型的历史：只带上已完成的问答。出错、等待中或正在生成的那条不算，
 * 重试与新问题都从同一份干净的上下文开始。
 */
export function chatTurns(items: readonly ChatItem[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const item of items) {
    if (item.role === 'user') {
      turns.push({ role: 'user', content: item.text })
      continue
    }
    if ((item.phase === 'done' || item.phase === 'stopped') && item.text.trim() !== '') {
      turns.push({ role: 'assistant', content: item.text })
    }
  }
  return turns
}

/**
 * 重试时用的历史：截到指定回答之前，那条失败的问答不重复带上。
 * 找不到对应回答时返回 null，调用方不必再自己找一遍。
 */
export function chatTurnsBefore(
  items: readonly ChatItem[],
  assistantId: string
): ChatTurn[] | null {
  const index = items.findIndex(
    (item) => item.role === 'assistant' && item.id === assistantId
  )
  return index === -1 ? null : chatTurns(items.slice(0, index))
}

export function thinkingSeconds(block: ThinkingBlock, now: number): number {
  const end = block.endedAt ?? now
  return Math.max(0, Math.floor((end - block.startedAt) / 1000))
}

/**
 * 流式思考时默认展开；正文一到自动折起。学习者手动点过之后，
 * 这个选择在本线程内一直有效。
 */
export function thinkingExpanded(state: ChatState, item: AssistantItem): boolean {
  if (!item.thinking) {
    return false
  }
  if (state.thinkingOpen !== null) {
    return state.thinkingOpen
  }
  return item.phase === 'thinking'
}

export function statusLabel(item: AssistantItem): string | null {
  if (item.phase === 'stopped') {
    return '已停止 · 未完成'
  }
  if (item.phase === 'error' && item.text.trim() !== '') {
    return '未完成'
  }
  return null
}
