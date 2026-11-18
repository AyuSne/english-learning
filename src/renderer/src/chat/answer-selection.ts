/**
 * 把浏览器里的选区换算成回答正文的字符区间。回答按段落渲染，
 * 每段带 `data-para-start`，所以跨段选区也能落到同一版正文的 [start, end) 上。
 */

export type AnswerSelection = {
  answerId: string
  start: number
  end: number
  /** 选区在屏幕上的位置，浮卡贴着它显示。 */
  rect: DOMRect
}

function elementOf(node: Node | null): Element | null {
  if (node === null) return null
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
}

function offsetWithin(root: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(root)
  try {
    range.setEnd(node, offset)
  } catch {
    return root.textContent?.length ?? 0
  }
  return range.toString().length
}

/** 只有落在一条回答正文里的非空选区才算可钉；其余返回 null。 */
export function readAnswerSelection(container: HTMLElement): AnswerSelection | null {
  const selection = window.getSelection()
  if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) {
    return null
  }

  const startElement = elementOf(range.startContainer)
  const endElement = elementOf(range.endContainer)
  const startText = startElement?.closest<HTMLElement>('.assistant-paragraph-text')
  const endText = endElement?.closest<HTMLElement>('.assistant-paragraph-text')
  if (!startText || !endText) {
    return null
  }
  const startParagraph = startText.closest<HTMLElement>('.assistant-paragraph')
  const endParagraph = endText.closest<HTMLElement>('.assistant-paragraph')
  const answerRoot = startText.closest<HTMLElement>('[data-answer-id]')
  if (!startParagraph || !endParagraph || !answerRoot) {
    return null
  }
  if (endText.closest<HTMLElement>('[data-answer-id]') !== answerRoot) {
    return null
  }
  const answerId = answerRoot.dataset.answerId
  if (answerId === undefined) {
    return null
  }

  const startBase = Number(startParagraph.dataset.paraStart)
  const endBase = Number(endParagraph.dataset.paraStart)
  if (!Number.isFinite(startBase) || !Number.isFinite(endBase)) {
    return null
  }

  const start = startBase + offsetWithin(startText, range.startContainer, range.startOffset)
  const end = endBase + offsetWithin(endText, range.endContainer, range.endOffset)
  if (!(start < end)) {
    return null
  }
  const rect = range.getBoundingClientRect()
  return { answerId, start, end, rect }
}
