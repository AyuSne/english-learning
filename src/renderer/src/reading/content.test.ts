import { describe, expect, it } from 'vitest'
import type { ReadingParagraph } from '../../../shared/reading'
import { buildReadingBlocks, paragraphText } from './content'

function paragraph(overrides: Partial<ReadingParagraph> = {}): ReadingParagraph {
  const text = 'Reading widely makes hard sentences easier. Context carries most of the meaning.'
  return {
    id: '1',
    ordinal: 0,
    letter: null,
    text,
    pageStart: 1,
    pageEnd: 1,
    sentences: [
      { ordinal: 0, text: text.slice(0, 43), start: 0, end: 43, page: 1 },
      { ordinal: 1, text: text.slice(44), start: 44, end: text.length, page: 1 }
    ],
    annotations: [],
    ...overrides
  }
}

describe('buildReadingBlocks', () => {
  it('按句切块，段落里的空格留在句间，拼回去与原文逐字一致', () => {
    const source = paragraph()
    const blocks = buildReadingBlocks(source)

    expect(blocks.map((block) => block.kind)).toEqual(['sentence', 'gap', 'sentence'])
    expect(blocks[1]).toEqual({ kind: 'gap', text: ' ' })
    expect(paragraphText(blocks)).toBe(source.text)
  })

  it('注释从句子正文里切出来，带词形与释义', () => {
    const source = paragraph({
      annotations: [
        { surface: 'Context', gloss: '语境', start: 44, end: 51, sentenceOrdinal: 1 }
      ]
    })

    const sentence = buildReadingBlocks(source)[2]
    expect(sentence).toMatchObject({
      kind: 'sentence',
      ordinal: 1,
      parts: [
        {
          kind: 'annotation',
          text: 'Context',
          gloss: '语境',
          start: 44,
          end: 51
        },
        { kind: 'text', text: ' carries most of the meaning.' }
      ]
    })
  })

  it('一句里多条注释按位置切开，注释在句首或句尾也不丢正文', () => {
    const source = paragraph({
      annotations: [
        { surface: 'meaning', gloss: '意思', start: 72, end: 79, sentenceOrdinal: 1 },
        { surface: 'Context', gloss: '语境', start: 44, end: 51, sentenceOrdinal: 1 }
      ]
    })

    const sentence = buildReadingBlocks(source)[2]
    expect(sentence?.kind === 'sentence' ? sentence.parts : []).toEqual([
      { kind: 'annotation', text: 'Context', gloss: '语境', start: 44, end: 51 },
      { kind: 'text', text: ' carries most of the ' },
      { kind: 'annotation', text: 'meaning', gloss: '意思', start: 72, end: 79 },
      { kind: 'text', text: '.' }
    ])
    expect(paragraphText(buildReadingBlocks(source))).toBe(source.text)
  })

  it('句首之前与末句之后的内容作为间隙保留', () => {
    const source = paragraph({
      text: '  Leading space stays. Trailing stays.  ',
      sentences: [
        { ordinal: 0, text: 'Leading space stays.', start: 2, end: 22, page: 1 },
        { ordinal: 1, text: 'Trailing stays.', start: 23, end: 38, page: 1 }
      ]
    })

    const blocks = buildReadingBlocks(source)
    expect(blocks[0]).toEqual({ kind: 'gap', text: '  ' })
    expect(blocks.at(-1)).toEqual({ kind: 'gap', text: '  ' })
    expect(paragraphText(blocks)).toBe(source.text)
  })

  it('没有注释时整段就是句子原文', () => {
    const source = paragraph({ annotations: [] })
    expect(paragraphText(buildReadingBlocks(source))).toBe(source.text)
  })
})
