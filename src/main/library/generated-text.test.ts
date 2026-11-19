import { describe, expect, it } from 'vitest'
import { splitGeneratedText } from './generated-text'

/**
 * 生成文章正文的切分：段落按空行切，句在段内切。契约只有一条硬要求——
 * `sentence.text` 必须等于 `paragraph.text.slice(start, end)`，偏移是 JS 的 UTF-16 段内区间；
 * 阅读页的选词、收原句与回链都直接依赖它，切错一个字符就会选不到。
 */

function expectConsistent(
  paragraphs: ReturnType<typeof splitGeneratedText>
): void {
  for (const paragraph of paragraphs) {
    expect(paragraph.text.trim()).toBe(paragraph.text)
    expect(paragraph.text).not.toBe('')
    let previousEnd = 0
    for (const sentence of paragraph.sentences) {
      expect(sentence.text).toBe(paragraph.text.slice(sentence.start, sentence.end))
      expect(sentence.text.trim()).toBe(sentence.text)
      expect(sentence.text).not.toBe('')
      expect(sentence.start).toBeGreaterThanOrEqual(previousEnd)
      expect(sentence.end).toBeGreaterThan(sentence.start)
      expect(sentence.end).toBeLessThanOrEqual(paragraph.text.length)
      previousEnd = sentence.end
    }
  }
}

describe('splitGeneratedText', () => {
  it('按空行切段，每段按句切；CRLF 与末句无标点都保留', () => {
    const paragraphs = splitGeneratedText(
      'First one starts here. Second one ends here.\r\n\r\n' +
        'Next paragraph has two. A final line without any period'
    )

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.text).toBe('First one starts here. Second one ends here.')
    expect(paragraphs[0]?.sentences.map((sentence) => sentence.text)).toEqual([
      'First one starts here.',
      'Second one ends here.'
    ])
    expect(paragraphs[1]?.sentences.map((sentence) => sentence.text)).toEqual([
      'Next paragraph has two.',
      'A final line without any period'
    ])
    // 末句没有标点也要成为一条可选的句子，不能被丢掉。
    expect(paragraphs[1]?.sentences.at(-1)?.end).toBe(paragraphs[1]?.text.length)
    expectConsistent(paragraphs)
  })

  it('段内单换行不另起一段，原样留在段落正文里', () => {
    const paragraphs = splitGeneratedText(
      'A line keeps going.\nAnother line in the same paragraph.\n\nSecond paragraph here.'
    )

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]?.text).toBe(
      'A line keeps going.\nAnother line in the same paragraph.'
    )
    expect(paragraphs[0]?.sentences).toHaveLength(2)
    expect(paragraphs[0]?.sentences[1]?.start).toBe(
      'A line keeps going.\n'.length
    )
    expectConsistent(paragraphs)
  })

  it('空白行与连续空行都当分段；首尾空行不产出空段', () => {
    const paragraphs = splitGeneratedText(
      '\r\n  \r\nFirst paragraph.\r\n   \r\n\r\nSecond paragraph.\r\n\r\n'
    )

    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'First paragraph.',
      'Second paragraph.'
    ])
    expectConsistent(paragraphs)
  })

  it('emoji（非 BMP）、缩写与小数不破坏段内偏移', () => {
    const paragraphs = splitGeneratedText(
      'Dr. Lee wrote 3.14 pages. 😀 A face stays in the second sentence. Last line'
    )

    expect(paragraphs).toHaveLength(1)
    const sentences = paragraphs[0]?.sentences ?? []
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'Dr. Lee wrote 3.14 pages.',
      '😀 A face stays in the second sentence.',
      'Last line'
    ])
    // emoji 是 2 个 UTF-16 码元：第二句起点按 JS 字符串下标算。
    expect(sentences[1]?.start).toBe('Dr. Lee wrote 3.14 pages. '.length)
    expect(sentences[1]?.end).toBe(
      'Dr. Lee wrote 3.14 pages. 😀 A face stays in the second sentence.'.length
    )
    expectConsistent(paragraphs)
  })

  it('整段只有一句时也按句结构保存，不把整篇回答塞成一条句子', () => {
    const paragraphs = splitGeneratedText('Only one sentence here.')

    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.sentences).toHaveLength(1)
    expect(paragraphs[0]?.sentences[0]).toEqual({
      text: 'Only one sentence here.',
      start: 0,
      end: 'Only one sentence here.'.length
    })
  })

  it('空正文不产出段落', () => {
    expect(splitGeneratedText('')).toEqual([])
    expect(splitGeneratedText(' \r\n \n \t ')).toEqual([])
  })
})
