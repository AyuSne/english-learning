import { describe, expect, it } from 'vitest'
import type { ChatStreamEvent } from '../../../shared/chat'
import {
  chatReducer,
  chatTurns,
  chatTurnsBefore,
  initialChatState,
  statusLabel,
  thinkingExpanded,
  thinkingSeconds,
  type AssistantItem,
  type ChatAction,
  type ChatState
} from './state'

const T0 = 1_000_000

function send(text = '你好', streamId = 's1'): ChatAction {
  return {
    type: 'send',
    user: { id: `user-${streamId}`, text },
    assistant: { id: `assistant-${streamId}` },
    streamId
  }
}

function stream(streamId: string, event: ChatStreamEvent, now = T0): ChatAction {
  return { type: 'stream', streamId, event, now }
}

function lastAssistant(state: ChatState): AssistantItem {
  const item = [...state.items].reverse().find((candidate) => candidate.role === 'assistant')
  if (!item || item.role !== 'assistant') {
    throw new Error('没有回答条目')
  }
  return item
}

describe('chatReducer', () => {
  it('发送后先加入提问与等待中的回答', () => {
    const state = chatReducer(initialChatState, send())

    expect(state.active).toEqual({ streamId: 's1', assistantId: 'assistant-s1' })
    expect(state.items).toEqual([
      { id: 'user-s1', role: 'user', text: '你好' },
      {
        id: 'assistant-s1',
        role: 'assistant',
        text: '',
        phase: 'waiting',
        thinking: null,
        error: null
      }
    ])
  })

  it('思维链先出现，正文抵达时冻结计时并继续追加正文', () => {
    let state = chatReducer(initialChatState, send())
    state = chatReducer(state, stream('s1', { type: 'thinking', text: '先' }, T0 + 500))
    state = chatReducer(state, stream('s1', { type: 'thinking', text: '想' }, T0 + 1000))

    expect(lastAssistant(state)).toMatchObject({
      phase: 'thinking',
      thinking: {
        text: '先想',
        startedAt: T0 + 500,
        endedAt: null
      }
    })

    state = chatReducer(state, stream('s1', { type: 'text', text: '答' }, T0 + 2200))
    state = chatReducer(state, stream('s1', { type: 'text', text: '案' }, T0 + 2300))
    state = chatReducer(state, stream('s1', { type: 'done' }, T0 + 2400))

    const assistant = lastAssistant(state)
    expect(assistant).toMatchObject({
      phase: 'done',
      text: '答案',
      thinking: {
        text: '先想',
        startedAt: T0 + 500,
        endedAt: T0 + 2200
      }
    })
    expect(state.active).toBeNull()
    expect(thinkingSeconds(assistant.thinking!, T0 + 60_000)).toBe(1)
  })

  it('模型不返回思维链时没有折叠块，正文直接出现', () => {
    let state = chatReducer(initialChatState, send())
    state = chatReducer(state, stream('s1', { type: 'text', text: '直接回答' }, T0 + 10))

    expect(lastAssistant(state)).toMatchObject({
      phase: 'writing',
      text: '直接回答',
      thinking: null
    })
  })

  it('停止后保留已输出内容并标「未完成」', () => {
    let state = chatReducer(initialChatState, send())
    state = chatReducer(state, stream('s1', { type: 'thinking', text: '想' }, T0 + 100))
    state = chatReducer(state, stream('s1', { type: 'text', text: '半句' }, T0 + 900))
    state = chatReducer(state, { type: 'stop', now: T0 + 1500 })

    const assistant = lastAssistant(state)
    expect(assistant.text).toBe('半句')
    expect(assistant.phase).toBe('stopped')
    expect(statusLabel(assistant)).toBe('已停止 · 未完成')
    expect(state.active).toBeNull()
    expect(thinkingSeconds(assistant.thinking!, T0 + 30_000)).toBe(0)
  })

  it('出错时保留已输出内容，错误挂在同一条回答上', () => {
    let state = chatReducer(initialChatState, send())
    state = chatReducer(state, stream('s1', { type: 'text', text: '半句' }, T0 + 100))
    state = chatReducer(
      state,
      stream('s1', { type: 'error', error: { code: 'server-busy', status: 503 } }, T0 + 200)
    )

    const assistant = lastAssistant(state)
    expect(assistant.phase).toBe('error')
    expect(assistant.error).toEqual({ code: 'server-busy', status: 503 })
    expect(assistant.text).toBe('半句')
    expect(statusLabel(assistant)).toBe('未完成')
    expect(state.active).toBeNull()
  })

  it('丢弃不属于当前生成的事件', () => {
    const state = chatReducer(initialChatState, send())

    expect(chatReducer(state, stream('other', { type: 'text', text: '迟到' }))).toBe(state)
  })

  it('思维链流式中自动展开，正文抵达后自动折起，手动选择在本线程内保留', () => {
    let state = chatReducer(initialChatState, send())
    state = chatReducer(state, stream('s1', { type: 'thinking', text: '想' }, T0))
    expect(thinkingExpanded(state, lastAssistant(state))).toBe(true)

    state = chatReducer(state, stream('s1', { type: 'text', text: '答' }, T0 + 1000))
    expect(thinkingExpanded(state, lastAssistant(state))).toBe(false)

    state = chatReducer(state, { type: 'toggle-thinking', open: true })
    expect(thinkingExpanded(state, lastAssistant(state))).toBe(true)

    state = chatReducer(state, stream('s1', { type: 'done' }, T0 + 1100))
    state = chatReducer(state, send('下一问', 's2'))
    state = chatReducer(state, stream('s2', { type: 'thinking', text: '再想' }, T0 + 2100))
    expect(thinkingExpanded(state, lastAssistant(state))).toBe(true)
  })

  it('重试把出错的回答清空并换成新的等待条目', () => {
    let state = chatReducer(initialChatState, send('第一问', 's1'))
    state = chatReducer(state, stream('s1', { type: 'text', text: '第一答' }, T0 + 10))
    state = chatReducer(state, stream('s1', { type: 'done' }, T0 + 20))
    state = chatReducer(state, send('第二问', 's2'))
    state = chatReducer(
      state,
      stream('s2', { type: 'error', error: { code: 'rate-limited', status: 429 } }, T0 + 40)
    )

    state = chatReducer(state, {
      type: 'restart',
      assistantId: 'assistant-s2',
      streamId: 's3'
    })

    expect(lastAssistant(state)).toEqual({
      id: 'assistant-s2',
      role: 'assistant',
      text: '',
      phase: 'waiting',
      thinking: null,
      error: null
    })
    expect(state.active).toEqual({ streamId: 's3', assistantId: 'assistant-s2' })
  })

  it('重试旧回答时事件落在它自己身上，不写进后面那条回答', () => {
    let state = chatReducer(initialChatState, send('第一问', 's1'))
    state = chatReducer(state, stream('s1', { type: 'text', text: '第一答' }, T0 + 10))
    state = chatReducer(state, stream('s1', { type: 'done' }, T0 + 20))
    state = chatReducer(state, send('第二问', 's2'))
    state = chatReducer(
      state,
      stream('s2', { type: 'error', error: { code: 'rate-limited', status: 429 } }, T0 + 30)
    )
    state = chatReducer(state, send('第三问', 's3'))
    state = chatReducer(state, stream('s3', { type: 'text', text: '第三答' }, T0 + 40))
    state = chatReducer(state, stream('s3', { type: 'done' }, T0 + 50))

    state = chatReducer(state, {
      type: 'restart',
      assistantId: 'assistant-s2',
      streamId: 's4'
    })
    expect(state.active).toEqual({ streamId: 's4', assistantId: 'assistant-s2' })

    state = chatReducer(state, stream('s4', { type: 'thinking', text: '再想' }, T0 + 60))
    state = chatReducer(state, stream('s4', { type: 'text', text: '重答' }, T0 + 70))
    state = chatReducer(state, stream('s4', { type: 'done' }, T0 + 80))

    const answers = state.items.filter((item) => item.role === 'assistant')
    expect(answers.map((item) => (item.role === 'assistant' ? item.text : ''))).toEqual([
      '第一答',
      '重答',
      '第三答'
    ])
    expect(answers[2]?.phase).toBe('done')
    expect(state.active).toBeNull()
  })
})

describe('chatTurns', () => {
  it('只带已完成的问答，不带等待中、出错或正在生成的那条', () => {
    let state = chatReducer(initialChatState, send('第一问', 's1'))
    state = chatReducer(state, stream('s1', { type: 'text', text: '第一答' }, T0 + 10))
    state = chatReducer(state, stream('s1', { type: 'done' }, T0 + 20))
    state = chatReducer(state, send('第二问', 's2'))
    state = chatReducer(state, stream('s2', { type: 'text', text: '没写完' }, T0 + 40))
    state = chatReducer(
      state,
      stream('s2', { type: 'error', error: { code: 'network' } }, T0 + 50)
    )

    expect(chatTurns(state.items)).toEqual([
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一答' },
      { role: 'user', content: '第二问' }
    ])
  })

  it('重试历史只截到出错的那条回答之前', () => {
    let state = chatReducer(initialChatState, send('第一问', 's1'))
    state = chatReducer(state, stream('s1', { type: 'text', text: '第一答' }, T0 + 10))
    state = chatReducer(state, stream('s1', { type: 'done' }, T0 + 20))
    state = chatReducer(state, send('第二问', 's2'))
    state = chatReducer(
      state,
      stream('s2', { type: 'error', error: { code: 'network' } }, T0 + 50)
    )

    expect(chatTurnsBefore(state.items, 'assistant-s2')).toEqual([
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一答' },
      { role: 'user', content: '第二问' }
    ])
    expect(chatTurnsBefore(state.items, 'missing')).toBeNull()
  })
})

describe('thinkingSeconds', () => {
  it('流式中按当前时间计时，结束后定格', () => {
    expect(thinkingSeconds({ text: '', startedAt: T0, endedAt: null }, T0 + 2600)).toBe(2)
    expect(thinkingSeconds({ text: '', startedAt: T0, endedAt: T0 + 1800 }, T0 + 99_000)).toBe(1)
  })
})
