import { describe, expect, it } from 'vitest'
import {
  entryHeadlineText,
  entryListMetaText,
  noteSourceText,
  sentenceSourceText
} from './format'

describe('entryListMetaText', () => {
  it('左栏一行写几句几篇', () => {
    expect(entryListMetaText({ sentenceCount: 2, articleCount: 1 })).toBe('2 句 · 1 篇')
  })
})

describe('sentenceSourceText', () => {
  it('长篇匹配写原卷段落字母，句序与页码', () => {
    expect(
      sentenceSourceText({
        paragraphLetter: 'D',
        paragraphOrdinal: 4,
        sentenceOrdinal: 2,
        page: 4
      })
    ).toBe('段 D · 第 3 句 · 第 4 页')
  })

  it('仔细阅读写段序；没有页码就不写', () => {
    expect(
      sentenceSourceText({
        paragraphLetter: null,
        paragraphOrdinal: 2,
        sentenceOrdinal: 0,
        page: null
      })
    ).toBe('第 2 段 · 第 1 句')
  })
})

describe('noteSourceText', () => {
  const createdAt = new Date(2026, 10, 18, 9, 30).toISOString()

  it('手写的学习内容标「词条内手写」', () => {
    expect(noteSourceText({ source: 'manual', createdAt })).toBe('词条内手写 · 2026-11-18')
  })

  it('从对话钉进来的内容标「来自对话」', () => {
    expect(noteSourceText({ source: 'pin', createdAt })).toBe('来自对话 · 2026-11-18')
  })
})

describe('entryHeadlineText', () => {
  it('标题下写收集规模与最近收集日期', () => {
    const lastCollectedAt = new Date(2026, 10, 15, 9, 30).toISOString()

    expect(entryHeadlineText({ sentenceCount: 6, articleCount: 3, lastCollectedAt })).toBe(
      '已收集 6 条原句 · 来自 3 篇 · 最近 2026-11-15'
    )
  })
})
