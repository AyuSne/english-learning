import { describe, expect, it } from 'vitest'
import { formatDay, progressText, readingPointText } from './format'

describe('progressText', () => {
  it('没打开过写未读', () => {
    expect(progressText({ state: 'unread', percent: 0 })).toBe('未读')
  })

  it('打开过写读到百分之几', () => {
    expect(progressText({ state: 'reading', percent: 33 })).toBe('读到 33%')
  })
})

describe('readingPointText', () => {
  it('写第几段第几句', () => {
    expect(
      readingPointText({
        paragraphId: 'G',
        paragraphOrdinal: 3,
        sentenceOrdinal: 2,
        sentenceText: 'Some sentence.'
      })
    ).toBe('第 3 段 · 第 2 句')
  })
})

describe('formatDay', () => {
  it('按本机时区只写日期', () => {
    const iso = new Date(2026, 10, 18, 9, 30).toISOString()

    expect(formatDay(iso)).toBe('2026-11-18')
  })

  it('不是时间的值返回空串', () => {
    expect(formatDay('not-a-date')).toBe('')
  })
})
