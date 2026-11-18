import { describe, expect, it } from 'vitest'
import type { Pin, PinTargetView } from '../../../shared/pins'
import type { ThreadMain } from '../../../shared/threads'
import {
  defaultPinTarget,
  pinExcerpt,
  pinProvenanceText,
  pinTouchesParagraph,
  samePinTarget,
  splitAnswerParagraphs,
  targetFromView,
  targetLabel
} from './pin-text'

const pin = (overrides: Partial<Pin> = {}): Pin => ({
  id: 'pin-1',
  capturedText: 'lament',
  start: 3,
  end: 9,
  target: { kind: 'unfiled' },
  defaultTarget: { kind: 'unfiled' },
  provenance: {
    threadId: 'thread-1',
    threadTitle: 'lament',
    answerId: 'answer-1',
    turnIndex: 2,
    model: 'deepseek-flash',
    sourceSentence: null
  },
  threadAlive: true,
  createdAt: new Date(2026, 10, 18, 9, 5).toISOString(),
  ...overrides
})

describe('splitAnswerParagraphs', () => {
  it('按空行切段，保留每段在整版正文里的字符区间', () => {
    const text = '第一段。\n\n第二段。\n\n\n第三段。'

    expect(splitAnswerParagraphs(text)).toEqual([
      { text: '第一段。', start: 0, end: 4 },
      { text: '第二段。', start: 6, end: 10 },
      { text: '第三段。', start: 13, end: 17 }
    ])
  })

  it('段内单个换行保留在段落里，空正文没有段落', () => {
    expect(splitAnswerParagraphs('第一行\n第二行')).toEqual([
      { text: '第一行\n第二行', start: 0, end: 7 }
    ])
    expect(splitAnswerParagraphs('')).toEqual([])
    expect(splitAnswerParagraphs('\n\n')).toEqual([])
    // 模型偶尔吐 CRLF，换段照样认。
    expect(splitAnswerParagraphs('a\r\n\r\nb')).toEqual([
      { text: 'a', start: 0, end: 1 },
      { text: 'b', start: 5, end: 6 }
    ])
  })

  it('片段跨段时两段都算被钉住，正好落在空行上不算', () => {
    const paragraphs = splitAnswerParagraphs('第一段。\n\n第二段。')
    const first = paragraphs[0]
    const second = paragraphs[1]
    if (!first || !second) throw new Error('没切出段落')

    expect(pinTouchesParagraph({ start: 2, end: 4 }, first)).toBe(true)
    expect(pinTouchesParagraph({ start: 2, end: 10 }, first)).toBe(true)
    expect(pinTouchesParagraph({ start: 4, end: 6 }, first)).toBe(false)
    expect(pinTouchesParagraph({ start: 4, end: 6 }, second)).toBe(false)
    expect(pinTouchesParagraph({ start: 4, end: 7 }, second)).toBe(true)
  })
})

describe('defaultPinTarget', () => {
  it('挂词条的线程预选这个词条', () => {
    const main: ThreadMain = {
      kind: 'entry',
      entryId: 'entry-1',
      mainForm: 'lament',
      sentenceCount: 2,
      articleCount: 1
    }

    expect(defaultPinTarget(main)).toEqual({
      kind: 'entry',
      entryId: 'entry-1',
      label: 'lament'
    })
  })

  it('挂原句的线程预选它所属的词条', () => {
    const main: ThreadMain = {
      kind: 'sentence',
      entryId: 'entry-1',
      entrySentenceId: 'sentence-1',
      mainForm: 'approach',
      surface: 'approach',
      sentenceText: 'Employers approach hiring differently.',
      articleId: 'article-1',
      articleTitle: '2026年6月 · 第1套 · 仔细阅读 Passage One',
      paragraphId: '1',
      paragraphOrdinal: 1,
      paragraphLetter: null,
      sentenceOrdinal: 0
    }

    expect(defaultPinTarget(main)).toMatchObject({ kind: 'entry', entryId: 'entry-1' })
  })

  it('挂文章的线程预选这篇文章，空白线程预选未归档', () => {
    expect(
      defaultPinTarget({
        kind: 'article',
        articleId: 'article-1',
        title: 'A Title',
        sessionLabel: '2026年6月',
        setLabel: '第1套',
        kindLabel: '仔细阅读 Passage One',
        wordCount: 300
      })
    ).toEqual({ kind: 'article', articleId: 'article-1', label: 'A Title' })

    expect(defaultPinTarget({ kind: 'none' })).toEqual({ kind: 'unfiled' })
  })
})

describe('落点与出处文字', () => {
  it('落点标签直接写词条名或篇名，未归档写未归档', () => {
    const entry: PinTargetView = { kind: 'entry', entryId: 'entry-1', label: 'lament' }
    const article: PinTargetView = { kind: 'article', articleId: 'article-1', label: 'A Title' }

    expect(targetLabel(entry)).toBe('lament')
    expect(targetLabel(article)).toBe('A Title')
    expect(targetLabel({ kind: 'unfiled' })).toBe('未归档')
  })

  it('把落点视图换回只带 id 的移动请求', () => {
    expect(targetFromView({ kind: 'entry', entryId: 'e', label: 'x' })).toEqual({
      kind: 'entry',
      entryId: 'e'
    })
    expect(targetFromView({ kind: 'article', articleId: 'a', label: 'y' })).toEqual({
      kind: 'article',
      articleId: 'a'
    })
    expect(targetFromView({ kind: 'unfiled' })).toEqual({ kind: 'unfiled' })
  })

  it('同一种落点按种类与 id 比较，标签不参与', () => {
    expect(
      samePinTarget({ kind: 'entry', entryId: 'e' }, { kind: 'entry', entryId: 'e' })
    ).toBe(true)
    expect(
      samePinTarget({ kind: 'entry', entryId: 'e' }, { kind: 'entry', entryId: 'f' })
    ).toBe(false)
    expect(samePinTarget({ kind: 'unfiled' }, { kind: 'unfiled' })).toBe(true)
    expect(samePinTarget({ kind: 'unfiled' }, { kind: 'entry', entryId: 'e' })).toBe(false)
  })

  it('出处行写线程名、轮次、模型与时间，模型为空时不显示空档', () => {
    expect(pinProvenanceText(pin())).toBe('lament · 第 2 轮 · deepseek-flash · 09:05')
    expect(pinProvenanceText(pin({ provenance: { ...pin().provenance, model: '' } }))).toBe(
      'lament · 第 2 轮 · 09:05'
    )
  })

  it('摘变压掉换行并截断', () => {
    expect(pinExcerpt('  a\n\n b  ', 20)).toBe('a b')
    expect(pinExcerpt('一二三四五', 3)).toBe('一二三…')
  })
})
