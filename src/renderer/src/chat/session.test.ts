import { describe, expect, it } from 'vitest'
import {
  chatSessionReducer,
  initialChatSession,
  isGenerating,
  liveAnswerText,
  liveAnswerThinking,
  thinkingExpanded,

  type ChatSessionState,
  type LiveGeneration
} from './session'

const STREAM = 'stream-1'

function begun(overrides: Partial<LiveGeneration> = {}): ChatSessionState {
  return chatSessionReducer(initialChatSession, {
    type: 'begin',
    threadId: 'thread-1',
    streamId: STREAM,
    mode: 'answer',
    questionId: 'q-1',
    answerId: null,
    baseText: '',
    baseThinking: '',
    baseThinkingMs: 0,
    now: 1_000,
    ...overrides
  })
}

function generation(state: ChatSessionState): LiveGeneration {
  const value = state.generation
  if (!value) throw new Error('没有正在生成的一条')
  return value
}

describe('生成中的回答', () => {
  it('开始生成时是等待态，历史里有底稿就带着', () => {
    const state = begun({ mode: 'continue', questionId: null, answerId: 'a-1', baseText: '底稿。' })
    expect(isGenerating(state)).toBe(true)
    expect(generation(state)).toMatchObject({
      phase: 'waiting',
      text: '',
      mode: 'continue',
      answerId: 'a-1',
      status: 'live'
    })
    expect(liveAnswerText(generation(state))).toBe('底稿。')
  })

  it('思维链先到就进入思考态并开始计时，正文一到自动结束计时', () => {
    let state = begun()
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'thinking', text: '先想' },
      now: 1_500
    })
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'thinking', text: '一下。' },
      now: 1_600
    })
    expect(generation(state)).toMatchObject({
      phase: 'thinking',
      thinking: '先想一下。',
      thinkingStartedAt: 1_500,
      thinkingEndedAt: null
    })

    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'text', text: '答案' },
      now: 4_000
    })
    expect(generation(state)).toMatchObject({
      phase: 'writing',
      text: '答案',
      thinkingEndedAt: 4_000
    })

    // 正文开始之后迟到的思维链不再改动这一条。
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'thinking', text: '迟到' },
      now: 4_100
    })
    expect(generation(state).thinking).toBe('先想一下。')
  })

  it('done 结束生成，之后不再算正在生成', () => {
    let state = begun()
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'text', text: '写完了' },
      now: 2_000
    })
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'done' },
      now: 2_500
    })
    expect(isGenerating(state)).toBe(false)
    expect(generation(state)).toMatchObject({
      phase: 'writing',
      status: 'finishing',
      terminal: 'done'
    })
  })

  it('出错时记下类型并结束生成', () => {
    let state = begun()
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'thinking', text: '想' },
      now: 1_500
    })
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'error', error: { code: 'rate-limited', status: 429 } },
      now: 1_800
    })
    expect(isGenerating(state)).toBe(false)
    expect(generation(state)).toMatchObject({
      error: { code: 'rate-limited', status: 429 },
      status: 'finishing',
      terminal: 'error',
      thinkingEndedAt: 1_800
    })
  })

  it('停止立刻结束生成，之后迟到的 done 不再改动', () => {
    let state = begun()
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'thinking', text: '想' },
      now: 1_500
    })
    state = chatSessionReducer(state, { type: 'stop', now: 1_900 })
    expect(isGenerating(state)).toBe(false)
    expect(generation(state)).toMatchObject({
      status: 'finishing',
      terminal: 'stopped',
      thinkingEndedAt: 1_900
    })

    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'done' },
      now: 2_000
    })
    expect(generation(state).status).toBe('finishing')
  })

  it('别的流的事件不影响这一条', () => {
    const state = begun()
    const next = chatSessionReducer(state, {
      type: 'stream',
      streamId: 'another',
      event: { type: 'text', text: '不该出现' },
      now: 2_000
    })
    expect(next).toBe(state)
  })

  it('继续生成的正文接在底稿后面，思考也各占一段', () => {
    const state = begun({ mode: 'continue', baseText: '旧的。', baseThinking: '旧想。' })
    const next = chatSessionReducer(
      chatSessionReducer(state, {
        type: 'stream',
        streamId: STREAM,
        event: { type: 'thinking', text: '新想。' },
        now: 1_500
      }),
      {
        type: 'stream',
        streamId: STREAM,
        event: { type: 'text', text: '新的。' },
        now: 1_600
      }
    )
    expect(liveAnswerText(generation(next))).toBe('旧的。新的。')
    expect(liveAnswerThinking(generation(next))).toBe('旧想。\n\n新想。')
  })

  it('清掉这一条后回到空闲', () => {
    const state = chatSessionReducer(begun(), { type: 'clear' })
    expect(state.generation).toBeNull()
    expect(isGenerating(state)).toBe(false)
  })

  it('异步落库回来只清掉原来那一条，不误删之后新起的那条', () => {
    const state = begun()
    expect(chatSessionReducer(state, { type: 'clear', streamId: 'another' })).toBe(state)
    expect(chatSessionReducer(state, { type: 'clear', streamId: STREAM }).generation).toBeNull()
  })
})

describe('思维链的展开', () => {
  it('流式思考时默认展开，正文到了自动折起；手动选择优先', () => {
    let state = begun()
    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'thinking', text: '想' },
      now: 1_500
    })
    expect(thinkingExpanded(state, generation(state))).toBe(true)

    state = chatSessionReducer(state, {
      type: 'stream',
      streamId: STREAM,
      event: { type: 'text', text: '正文' },
      now: 1_600
    })
    expect(thinkingExpanded(state, generation(state))).toBe(false)

    const opened = chatSessionReducer(state, { type: 'toggle-thinking', open: true })
    expect(thinkingExpanded(opened, generation(opened))).toBe(true)
  })

  it('没有思维链时不展开', () => {
    const state = begun()
    expect(thinkingExpanded(state, generation(state))).toBe(false)
  })
})
