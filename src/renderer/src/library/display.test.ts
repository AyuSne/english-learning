import { describe, expect, it } from 'vitest'
import type { LibraryArticle } from '../../../shared/library'
import {
  articleTitleParts,
  continueReadingDisplay,
  libraryArticleMetaParts
} from './display'

/**
 * 语料篇名的显示拆分：默认篇名里已经带场次、套数与题型，文章库列表与搜索就不再
 * 在 meta 里重复；用户改过名后才补回套数与题型做区分。首页与文章库共用同一份拆法。
 */

function article(overrides: Partial<LibraryArticle> = {}): LibraryArticle {
  return {
    id: 'fixture-2026-06-s1-c1',
    title: '2026年6月 · 第1套 · 仔细阅读 Passage One',
    kind: 'careful_reading',
    kindLabel: '仔细阅读 Passage One',
    sessionLabel: '2026年6月',
    setLabel: '第1套',
    wordCount: 19,
    progress: { state: 'reading', percent: 50 },
    lastOpenedAt: '2026-11-18T09:00:00.000Z',
    ...overrides
  }
}

describe('articleTitleParts', () => {
  it('默认语料篇名拆出场次与题型，剩下的就是题型本身', () => {
    expect(articleTitleParts(article())).toEqual({
      sessionLine: '2026年6月 · 第1套',
      rest: '仔细阅读 Passage One',
      titleIsKind: true
    })
  })

  it('题型后有实际篇名时只留实际篇名', () => {
    expect(
      articleTitleParts(
        article({ title: '2026年6月 · 第1套 · 仔细阅读 Passage One · Sarcasm and Jazz' })
      )
    ).toMatchObject({ rest: 'Sarcasm and Jazz', titleIsKind: false })
  })

  it('改过的篇名原样保留，也保留场次前缀里能拆的部分', () => {
    expect(articleTitleParts(article({ title: '我的精读笔记' }))).toEqual({
      sessionLine: '2026年6月 · 第1套',
      rest: '我的精读笔记',
      titleIsKind: false
    })
    expect(
      articleTitleParts(article({ title: '2026年6月 · 第1套 · 我的精读笔记' })).rest
    ).toBe('我的精读笔记')
  })

  it('语料没有单独篇名时用题型当标题，不把题型再说一遍', () => {
    expect(
      articleTitleParts(article({ title: '仔细阅读 Passage One', sessionLabel: '', setLabel: '' }))
    ).toEqual({ sessionLine: '', rest: '仔细阅读 Passage One', titleIsKind: true })
  })
})

describe('libraryArticleMetaParts', () => {
  it('默认篇名已含场次、套数与题型，meta 只留词数', () => {
    const meta = libraryArticleMetaParts(article())
    expect(meta).toEqual(['19 词'])
    expect(meta.join(' · ')).not.toContain('仔细阅读 Passage One')
    expect(meta.join(' · ')).not.toContain('第1套')
  })

  it('改过名后补回套数与题型；搜索再多带场次', () => {
    const renamed = article({ title: '我的文章' })
    expect(libraryArticleMetaParts(renamed)).toEqual([
      '第1套',
      '仔细阅读 Passage One',
      '19 词'
    ])
    expect(libraryArticleMetaParts(renamed, { includeSession: true })).toEqual([
      '2026年6月',
      '第1套',
      '仔细阅读 Passage One',
      '19 词'
    ])
  })

  it('长篇匹配的默认篇名同样不重复题型', () => {
    const longMatch = article({
      title: '2026年6月 · 第2套 · 长篇匹配',
      kind: 'long_match',
      kindLabel: '长篇匹配',
      setLabel: '第2套'
    })
    expect(libraryArticleMetaParts(longMatch)).toEqual(['19 词'])
    expect(articleTitleParts(longMatch).titleIsKind).toBe(true)
  })
})

describe('continueReadingDisplay', () => {
  it('场次在 eyebrow，题型作标题时 meta 不再重复题型', () => {
    expect(continueReadingDisplay(article())).toEqual({
      eyebrow: '2026年6月 · 第1套',
      title: '仔细阅读 Passage One',
      meta: '19 词 · 读到 50%'
    })
  })

  it('有实际篇名时标题是实际篇名，meta 保留题型做上下文', () => {
    expect(
      continueReadingDisplay(article({ title: '2026年6月 · 第1套 · 仔细阅读 Passage One · Sarcasm and Jazz' }))
    ).toEqual({
      eyebrow: '2026年6月 · 第1套',
      title: 'Sarcasm and Jazz',
      meta: '仔细阅读 Passage One · 19 词 · 读到 50%'
    })
  })

  it('改过名时原样显示，题型只在 meta 里出现', () => {
    expect(continueReadingDisplay(article({ title: 'Sarcasm and Jazz' }))).toEqual({
      eyebrow: '2026年6月 · 第1套',
      title: 'Sarcasm and Jazz',
      meta: '仔细阅读 Passage One · 19 词 · 读到 50%'
    })
  })
})
