import { describe, expect, it } from 'vitest'
import { articleWordsBackTarget, readingBackTarget } from './back-target'

/**
 * 返回目标的文字与去向只有这一份：阅读页按 `readingFrom` 说话，本篇选词按直接上游
 * 说话。这里锁住「页脚进来不会被说成文章库、直接打开也能确定回阅读页」两条规则。
 */

describe('readingBackTarget', () => {
  it('四种来源各说各的，缺省只写「返回」并回首页', () => {
    expect(readingBackTarget('library', null)).toMatchObject({
      label: '文章库',
      ariaLabel: '返回文章库',
      route: 'library'
    })
    expect(readingBackTarget('home', null)).toMatchObject({
      label: '首页',
      ariaLabel: '返回首页',
      route: 'home'
    })
    expect(readingBackTarget('search', null)).toMatchObject({
      label: '搜索结果',
      ariaLabel: '返回搜索结果',
      route: 'home'
    })
    expect(readingBackTarget(null, null)).toMatchObject({
      label: '',
      ariaLabel: '返回',
      route: 'home'
    })
  })

  it('从词条回到原文时带回要定位的原句，其他来源不带', () => {
    expect(readingBackTarget('entries', 'sentence 1').options).toEqual({
      entrySentenceId: 'sentence 1'
    })
    expect(readingBackTarget('entries', null).options).toEqual({})
    expect(readingBackTarget('library', 'sentence 1').options).toEqual({})
  })
})

describe('articleWordsBackTarget', () => {
  it('页脚进来回阅读页，并把阅读页自己的来源原样带回去', () => {
    expect(
      articleWordsBackTarget({
        articleId: 'a',
        readingFrom: 'entries',
        wordsFrom: 'reader'
      })
    ).toEqual({
      label: '阅读',
      ariaLabel: '返回阅读',
      route: 'reading',
      options: { articleId: 'a', readingFrom: 'entries' }
    })
  })

  it('文章库详情进来回文章库，并保持选中的文章', () => {
    expect(
      articleWordsBackTarget({ articleId: 'a', readingFrom: null, wordsFrom: 'library' })
    ).toEqual({
      label: '文章库',
      ariaLabel: '返回文章库',
      route: 'library',
      options: { articleId: 'a' }
    })
  })

  it('直接打开或刷新地址时没有上游，按阅读页兜底而不是去猜历史', () => {
    expect(
      articleWordsBackTarget({ articleId: 'a', readingFrom: 'home', wordsFrom: null })
    ).toMatchObject({ label: '阅读', route: 'reading' })
    expect(
      articleWordsBackTarget({ articleId: null, readingFrom: null, wordsFrom: null })
    ).toMatchObject({ label: '阅读', route: 'reading', options: {} })
  })
})
