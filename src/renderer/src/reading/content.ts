import type { ReadingParagraph } from '../../../shared/reading'

/**
 * 把一段正文切成「句子块」与句间空隙，句子块里再按原文注释切成文字片段。
 * 渲染层只认这些块：正文文字一个不多一个不少，注释单独成段，绝不把注释
 * 拼回正文——复制与交给模型的文本因此天然是剥离注释后的英文。
 */

export type ReadingTextPart = {
  kind: 'text'
  text: string
}

export type ReadingAnnotationPart = {
  kind: 'annotation'
  /** 原词/短语本身。 */
  text: string
  gloss: string
  /** 段内字符区间。 */
  start: number
  end: number
}

export type ReadingPart = ReadingTextPart | ReadingAnnotationPart

export type ReadingBlock =
  | {
      kind: 'sentence'
      /** 段内句序，0 起。 */
      ordinal: number
      parts: ReadingPart[]
    }
  | {
      kind: 'gap'
      /** 句与句之间（以及段首段尾）的空隙，原样保留。 */
      text: string
    }

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)))
}

export function buildReadingBlocks(paragraph: ReadingParagraph): ReadingBlock[] {
  const { text } = paragraph
  const annotations = [...paragraph.annotations].sort((left, right) => left.start - right.start)
  const sentences = [...paragraph.sentences].sort((left, right) => left.ordinal - right.ordinal)

  const blocks: ReadingBlock[] = []
  let cursor = 0

  for (const sentence of sentences) {
    const start = clamp(sentence.start, text.length)
    const end = clamp(sentence.end, text.length)
    if (end <= start || start < cursor) {
      continue
    }

    if (start > cursor) {
      blocks.push({ kind: 'gap', text: text.slice(cursor, start) })
    }

    const parts: ReadingPart[] = []
    let partCursor = start
    for (const annotation of annotations) {
      if (annotation.start < partCursor || annotation.end > end) {
        continue
      }
      if (annotation.start > partCursor) {
        parts.push({ kind: 'text', text: text.slice(partCursor, annotation.start) })
      }
      parts.push({
        kind: 'annotation',
        text: text.slice(annotation.start, annotation.end),
        gloss: annotation.gloss,
        start: annotation.start,
        end: annotation.end
      })
      partCursor = annotation.end
    }
    if (partCursor < end) {
      parts.push({ kind: 'text', text: text.slice(partCursor, end) })
    }

    blocks.push({ kind: 'sentence', ordinal: sentence.ordinal, parts })
    cursor = end
  }

  if (cursor < text.length) {
    blocks.push({ kind: 'gap', text: text.slice(cursor) })
  }

  return blocks
}

/** 块拼回来的纯正文，与段落原文逐字一致。 */
export function paragraphText(blocks: readonly ReadingBlock[]): string {
  return blocks
    .map((block) =>
      block.kind === 'gap' ? block.text : block.parts.map((part) => part.text).join('')
    )
    .join('')
}
