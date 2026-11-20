import { describe, expect, it } from 'vitest'
import { buildSearchSnippet, splitSearchSnippet } from './search'

function highlightedTexts(snippet: ReturnType<typeof buildSearchSnippet>): string[] {
  return snippet.ranges.map((range) => snippet.text.slice(range.start, range.end))
}

describe('buildSearchSnippet', () => {
  it('命中短文本时原样给出片段，并标出关键词在片段里的区间', () => {
    const snippet = buildSearchSnippet('Employers approach hiring differently.', 'approach')

    expect(snippet.text).toBe('Employers approach hiring differently.')
    expect(snippet.ranges).toEqual([{ start: 10, end: 18 }])
    expect(highlightedTexts(snippet)).toEqual(['approach'])
  })

  it('大小写不敏感，片段里每一处命中都标出来', () => {
    const snippet = buildSearchSnippet('Approach and approach are the same form.', 'APPROACH')

    expect(snippet.text).toBe('Approach and approach are the same form.')
    expect(highlightedTexts(snippet)).toEqual(['Approach', 'approach'])
  })

  it('长正文只取命中处前后一小段，两边加省略号，区间跟着偏移', () => {
    const body = `${'a '.repeat(80)}needle${' b'.repeat(80)}`
    const snippet = buildSearchSnippet(body, 'needle', { context: 20 })

    expect(snippet.text.startsWith('…')).toBe(true)
    expect(snippet.text.endsWith('…')).toBe(true)
    expect(snippet.text).toContain('needle')
    expect(highlightedTexts(snippet)).toEqual(['needle'])
  })

  it('学习内容里的换行与连续空白压成一行，命中区间仍落在原词上', () => {
    const snippet = buildSearchSnippet('第一行\n\n第二行   approach 用法', 'approach')

    expect(snippet.text).toBe('第一行 第二行 approach 用法')
    expect(snippet.text).not.toContain('\n')
    expect(highlightedTexts(snippet)).toEqual(['approach'])
  })

  it('查不到时不给高亮区间，长文本按上限截断', () => {
    const snippet = buildSearchSnippet('x'.repeat(200), 'zebra')

    expect(snippet.ranges).toEqual([])
    expect(snippet.text.length).toBe(161)
    expect(snippet.text.endsWith('…')).toBe(true)
  })

  it('空查询只压空白，不给高亮区间', () => {
    const snippet = buildSearchSnippet('  spaced\n\ntext  ', '   ')

    expect(snippet).toEqual({ text: 'spaced text', ranges: [] })
  })
})

describe('splitSearchSnippet', () => {
  it('按区间切成普通 / 高亮两种片段，拼回去与片段文本一致', () => {
    const snippet = buildSearchSnippet('…Employers approach hiring…', 'approach')
    const parts = splitSearchSnippet(snippet)

    expect(parts.map((part) => part.text).join('')).toBe(snippet.text)
    expect(parts.filter((part) => part.highlighted).map((part) => part.text)).toEqual(['approach'])
    expect(parts[0]).toEqual({ text: '…Employers ', highlighted: false })
  })

  it('区间越界或互相重叠时只切有效部分，不丢文字', () => {
    const snippet = {
      text: 'abcDEFghi',
      ranges: [
        { start: 2, end: 5 },
        { start: 4, end: 7 },
        { start: 20, end: 24 }
      ]
    }
    const parts = splitSearchSnippet(snippet)

    expect(parts.map((part) => part.text).join('')).toBe('abcDEFghi')
    expect(parts.filter((part) => part.highlighted).map((part) => part.text)).toEqual(['cDE', 'Fg'])
  })
})
