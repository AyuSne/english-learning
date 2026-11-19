import { describe, expect, it } from 'vitest'
import type { EntrySentence } from '../../../shared/entries'
import {
  articleWordsSummaryText,
  paragraphWordsCountText,
  paragraphWordsLabel,
  splitSentenceSurface
} from './article-words-format'

describe('articleWordsSummaryText', () => {
  it('分别写出不同词条数与原句数', () => {
    expect(
      articleWordsSummaryText({ wordEntryCount: 3, collectedSentenceCount: 5 })
    ).toBe('3 个词条 · 5 条原句')
    expect(
      articleWordsSummaryText({ wordEntryCount: 1, collectedSentenceCount: 1 })
    ).toBe('1 个词条 · 1 条原句')
  })
})

describe('paragraphWordsLabel', () => {
  it('长篇匹配用原卷段落字母，仔细阅读写第几段', () => {
    expect(paragraphWordsLabel({ ordinal: 1, letter: 'A' })).toBe('A')
    expect(paragraphWordsLabel({ ordinal: 2, letter: null })).toBe('第 2 段')
  })
})

describe('paragraphWordsCountText', () => {
  it('按这一段的词条数写', () => {
    expect(paragraphWordsCountText(0)).toBe('0 个词条')
    expect(paragraphWordsCountText(2)).toBe('2 个词条')
  })
})

describe('splitSentenceSurface', () => {
  const sentence = (overrides: Partial<EntrySentence> = {}): EntrySentence => ({
    id: 'es-1',
    surface: 'approach',
    articleId: 'a',
    articleTitle: '篇名',
    paragraphId: '1',
    paragraphOrdinal: 1,
    paragraphLetter: null,
    sentenceOrdinal: 0,
    sentenceText: 'Employers approach hiring differently.',
    start: 10,
    end: 18,
    surfaceOffset: 10,
    page: 1,
    previousSentence: null,
    nextSentence: null,
    canSplitToNew: false,
    collectedAt: '2026-11-18T08:00:00.000Z',
    ...overrides
  })

  it('把原句切成「前 / 圈下的词 / 后」，保留原句逐字', () => {
    expect(splitSentenceSurface(sentence())).toEqual({
      before: 'Employers ',
      surface: 'approach',
      after: ' hiring differently.'
    })
  })

  it('位置对不上时整句不标，不猜也不吞字', () => {
    expect(splitSentenceSurface(sentence({ surfaceOffset: 0 }))).toEqual({
      before: 'Employers approach hiring differently.',
      surface: '',
      after: ''
    })
    expect(splitSentenceSurface(sentence({ surface: '' }))).toEqual({
      before: 'Employers approach hiring differently.',
      surface: '',
      after: ''
    })
  })
})
