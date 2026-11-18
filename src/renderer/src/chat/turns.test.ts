import { describe, expect, it } from 'vitest'
import type { ChatThreadView, ThreadAnswer, ThreadContextItem, ThreadTurn } from '../../../shared/threads'
import {
  CONTINUE_INSTRUCTION,
  buildMessages,
  contextSummaryText,
  lastTurn,
  selectedVersionIndex,
  summarizeContext,
  threadHeaderText,
  threadSystemPrompt
} from './turns'

const contextItem: ThreadContextItem = {
  id: 'sentence:es-1',
  kind: 'sentence',
  label: 'lament',
  text: 'Left alone on an unknown island, Crusoe has much to lament.',
  source: '2026年6月 · 第1套 · 长篇匹配 · 段 B · 第 6 句'
}

function answer(overrides: Partial<ThreadAnswer> = {}): ThreadAnswer {
  return {
    id: 'a-1',
    versions: [{ id: 'a-1', selected: true }],
    text: '第一版回答。',
    thinking: '想了一下。',
    thinkingMs: 3000,
    phase: 'done',
    error: null,
    model: 'deepseek-flash',
    createdAt: '2026-11-18T09:01:00.000Z',
    continuationIds: [],
    ...overrides
  }
}

function turn(
  question: Partial<ThreadTurn['question']> & { id: string; text: string },
  answerValue: ThreadAnswer | null = null
): ThreadTurn {
  return {
    question: {
      createdAt: '2026-11-18T09:00:00.000Z',
      versions: [{ id: question.id, selected: true }],
      ...question
    },
    answer: answerValue
  }
}

function view(overrides: Partial<ChatThreadView> = {}): ChatThreadView {
  return {
    id: 't-1',
    title: 'lament',
    main: {
      kind: 'entry',
      entryId: 'e-1',
      mainForm: 'lament',
      sentenceCount: 3,
      articleCount: 2
    },
    context: [contextItem],
    contextSummary: { sentenceCount: 1, charCount: 56 },
    turns: [],
    createdAt: '2026-11-18T08:00:00.000Z',
    updatedAt: '2026-11-18T08:00:00.000Z',
    ...overrides
  }
}

describe('contextSummaryText', () => {
  it('按「N 条原句 · 约 M 字」显示', () => {
    expect(contextSummaryText({ sentenceCount: 3, charCount: 420 })).toBe('3 条原句 · 约 420 字')
    expect(contextSummaryText({ sentenceCount: 0, charCount: 0 })).toBe('0 条原句 · 约 0 字')
  })

  it('原句只数 sentence，字数把词与段落也算进去', () => {
    expect(
      summarizeContext([
        contextItem,
        { id: 'word:e-1', kind: 'word', label: 'lament', text: 'lament', source: '' },
        { id: 'note:1', kind: 'note', label: 'lament', text: '学习内容', source: '' }
      ])
    ).toEqual({
      sentenceCount: 1,
      charCount: Array.from(contextItem.text).length + 6 + 4
    })
  })
})

describe('threadSystemPrompt', () => {
  it('把带上的材料按种类排成 system 前言；没有上下文时为 null', () => {
    const prompt = threadSystemPrompt([
      contextItem,
      {
        id: 'word:e-1',
        kind: 'word',
        label: 'lament',
        text: 'lament',
        source: '已收 3 条原句 · 2 篇'
      }
    ])
    expect(prompt).not.toBeNull()
    expect(prompt).toContain('[词] lament')
    expect(prompt).toContain('[原句] Left alone on an unknown island, Crusoe has much to lament.')
    expect(prompt).toContain('2026年6月 · 第1套 · 长篇匹配 · 段 B · 第 6 句')
    expect(threadSystemPrompt([])).toBeNull()
  })
})

describe('buildMessages', () => {
  it('新提问只带这一路的历史与最后一问', () => {
    const thread = view({
      turns: [
        turn({ id: 'q-1', text: '第一问' }, answer()),
        turn({ id: 'q-2', text: '第二问' })
      ]
    })
    expect(buildMessages(thread, { kind: 'answer' })).toEqual([
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一版回答。' },
      { role: 'user', content: '第二问' }
    ])
  })

  it('重新生成截到那一问，不带当前这一版回答', () => {
    const thread = view({
      turns: [
        turn({ id: 'q-1', text: '第一问' }, answer()),
        turn({ id: 'q-2', text: '第二问' }, answer({ id: 'a-2', text: '第二版回答。' }))
      ]
    })
    expect(
      buildMessages(thread, { kind: 'regenerate', questionId: 'q-2' })
    ).toEqual([
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '第一版回答。' },
      { role: 'user', content: '第二问' }
    ])
  })

  it('继续生成把已写出的部分作为回答带上，再接一句继续的要求', () => {
    const thread = view({
      turns: [
        turn(
          { id: 'q-1', text: '写一段' },
          answer({ text: '已经写到这里。', thinking: '想过。' })
        )
      ]
    })
    expect(buildMessages(thread, { kind: 'continue' })).toEqual([
      { role: 'user', content: '写一段' },
      { role: 'assistant', content: '已经写到这里。' },
      { role: 'user', content: CONTINUE_INSTRUCTION }
    ])
  })

  it('停下来或出错的回答只要写出来了就带回历史；字数为空的不带', () => {
    const thread = view({
      turns: [
        turn(
          { id: 'q-1', text: '第一问' },
          answer({ id: 'a-1', text: '半截回答', phase: 'stopped' })
        ),
        turn(
          { id: 'q-2', text: '第二问' },
          answer({ id: 'a-2', text: '', phase: 'error', error: { code: 'network' } })
        ),
        turn({ id: 'q-3', text: '第三问' })
      ]
    })
    expect(buildMessages(thread, { kind: 'answer' })).toEqual([
      { role: 'user', content: '第一问' },
      { role: 'assistant', content: '半截回答' },
      { role: 'user', content: '第二问' },
      { role: 'user', content: '第三问' }
    ])
  })
})

describe('版本与页头', () => {
  it('找出选中版本的位置，从 1 起数', () => {
    expect(
      selectedVersionIndex([
        { id: 'a-1', selected: false },
        { id: 'a-2', selected: true }
      ])
    ).toBe(2)
    expect(selectedVersionIndex([])).toBe(0)
  })

  it('页头副标题按主对象给', () => {
    expect(threadHeaderText(view())).toBe('词条 lament · 3 条原句 · 2 篇')
    expect(threadHeaderText(view({ main: { kind: 'none' } }))).toBe(
      '未挂任何对象 · 从词或文章开始'
    )
    expect(
      threadHeaderText(
        view({
          main: {
            kind: 'sentence',
            entryId: 'e-1',
            entrySentenceId: 'es-1',
            mainForm: 'lament',
            surface: 'lament',
            sentenceText: '句',
            articleId: 'art-1',
            articleTitle: '2026年6月 · 第1套 · 长篇匹配',
            paragraphId: 'B',
            paragraphOrdinal: 2,
            paragraphLetter: 'B',
            sentenceOrdinal: 5
          }
        })
      )
    ).toBe('2026年6月 · 第1套 · 长篇匹配 · 段 B · 第 6 句')
    expect(
      threadHeaderText(
        view({
          main: {
            kind: 'article',
            articleId: 'art-1',
            title: '2026年6月 · 第1套 · 长篇匹配',
            sessionLabel: '2026年6月',
            setLabel: '第1套',
            kindLabel: '长篇匹配',
            wordCount: 1200
          }
        })
      )
    ).toBe('2026年6月 · 第1套 · 长篇匹配 · 1200 词')
  })

  it('最后一轮与它的回答是重生成和继续生成的前提', () => {
    expect(lastTurn(view())).toBeNull()
    const answered = view({ turns: [turn({ id: 'q-1', text: '问' }, answer())] })
    expect(lastTurn(answered)?.answer?.id).toBe('a-1')
  })
})
