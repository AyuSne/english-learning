import type { ReadingParagraph } from '../../../shared/reading'

/**
 * 选词的纯逻辑：把一次段内字符选区对到所在的句子，收紧两端空白，得到原样的词形。
 * 一次只收一句之内的词或短语；跨句、落在句间空隙、空选区都不收。
 */

export type ReadingSelection = {
  paragraphId: string
  /** 段内句序，0 起。 */
  sentenceOrdinal: number
  /** 段内字符区间，两端已去空白。 */
  start: number
  end: number
  /** 原文切片，逐字一致。 */
  surface: string
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character)
}

export function locateSelection(
  paragraph: ReadingParagraph,
  start: number,
  end: number
): ReadingSelection | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return null
  }
  if (start < 0 || end > paragraph.text.length || end <= start) {
    return null
  }

  const sentence = paragraph.sentences.find(
    (candidate) => start >= candidate.start && start < candidate.end
  )
  if (!sentence) {
    return null
  }
  // 跨句的选区可能只是想把整句抄走，不该留下一条原句记录。
  if (end > sentence.end) {
    return null
  }

  let trimmedStart = Math.max(start, sentence.start)
  let trimmedEnd = Math.min(end, sentence.end)
  while (trimmedStart < trimmedEnd && isWhitespace(paragraph.text[trimmedStart])) {
    trimmedStart += 1
  }
  while (trimmedEnd > trimmedStart && isWhitespace(paragraph.text[trimmedEnd - 1])) {
    trimmedEnd -= 1
  }
  if (trimmedEnd <= trimmedStart) {
    return null
  }

  return {
    paragraphId: paragraph.id,
    sentenceOrdinal: sentence.ordinal,
    start: trimmedStart,
    end: trimmedEnd,
    surface: paragraph.text.slice(trimmedStart, trimmedEnd)
  }
}

/**
 * 当前浏览器选区相对所在段落正文的起止字符位置。选区跨出这一段落时返回 null，
 * 交给界面给出「一次圈一个词或短语」的提示。
 */
export function selectionOffsets(paragraph: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (
    !paragraph.contains(range.startContainer) ||
    !paragraph.contains(range.endContainer)
  ) {
    return null
  }

  const prefix = document.createRange()
  prefix.selectNodeContents(paragraph)
  prefix.setEnd(range.startContainer, range.startOffset)
  const start = prefix.toString().length
  return { start, end: start + range.toString().length }
}

export type ParagraphSelection = {
  paragraph: ReadingParagraph
  selection: ReadingSelection
}

/**
 * 把浏览器里当前的选区落成「哪一段、哪一句、哪几个字符」。选区不存在、
 * 跨段或落在句间空隙时返回 null；段落解析留在这里，阅读页只负责拿结果。
 */
export function readParagraphSelection(
  paragraphs: readonly ReadingParagraph[]
): ParagraphSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  const startElement =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  const paragraphElement = startElement?.closest<HTMLElement>('.reading-paragraph') ?? null
  if (paragraphElement === null) {
    return null
  }
  const paragraphId = paragraphElement.dataset.paragraphId
  const paragraph = paragraphs.find((candidate) => candidate.id === paragraphId)
  if (!paragraph) {
    return null
  }
  const offsets = selectionOffsets(paragraphElement)
  if (offsets === null) {
    return null
  }
  const located = locateSelection(paragraph, offsets.start, offsets.end)
  return located === null ? null : { paragraph, selection: located }
}
