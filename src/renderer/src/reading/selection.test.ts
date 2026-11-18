import { describe, expect, it } from 'vitest'
import type { ReadingParagraph } from '../../../shared/reading'
import { locateSelection } from './selection'

function paragraph(): ReadingParagraph {
  const text = 'First sentence here. Second sentence follows.'
  return {
    id: '1',
    ordinal: 0,
    letter: null,
    text,
    pageStart: 1,
    pageEnd: 1,
    sentences: [
      { ordinal: 0, text: 'First sentence here.', start: 0, end: 20, page: 1 },
      { ordinal: 1, text: 'Second sentence follows.', start: 21, end: 45, page: 1 }
    ],
    annotations: []
  }
}

describe('locateSelection', () => {
  it('段内选区落到所在句子，带段内字符区间与原样词形', () => {
    expect(locateSelection(paragraph(), 6, 14)).toEqual({
      paragraphId: '1',
      sentenceOrdinal: 0,
      start: 6,
      end: 14,
      surface: 'sentence'
    })

    expect(locateSelection(paragraph(), 28, 36)).toMatchObject({
      sentenceOrdinal: 1,
      surface: 'sentence'
    })
  })

  it('选区两端的空白收紧，词形仍与原文逐字一致', () => {
    expect(locateSelection(paragraph(), 5, 15)).toEqual({
      paragraphId: '1',
      sentenceOrdinal: 0,
      start: 6,
      end: 14,
      surface: 'sentence'
    })
  })

  it('只按圈到的字符收，不自动扩成整词', () => {
    expect(locateSelection(paragraph(), 6, 10)).toMatchObject({ surface: 'sent' })
  })

  it('跨句、落在句间空隙、空选区与越界都不收', () => {
    expect(locateSelection(paragraph(), 0, 30)).toBeNull()
    expect(locateSelection(paragraph(), 6, 22)).toBeNull()
    expect(locateSelection(paragraph(), 20, 21)).toBeNull()
    expect(locateSelection(paragraph(), 6, 6)).toBeNull()
    expect(locateSelection(paragraph(), 5, 6)).toBeNull()
    expect(locateSelection(paragraph(), 0, 999)).toBeNull()
    expect(locateSelection(paragraph(), -1, 4)).toBeNull()
  })
})
