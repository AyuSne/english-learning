export type AnswerSelection = {
  answerId: string
  start: number
  end: number
  /** 选区在屏幕上的位置，浮卡贴着它显示。 */
  rect: DOMRect
}

function answerBodyOf(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement
  if (!element || element.closest('.pin-badge')) return null
  return element.closest<HTMLElement>('.assistant-text[data-answer-id]')
}

/** 选区两端必须在同一条已保存的回答正文；活动流不带回答 ID。 */
export function readAnswerSelection(container: HTMLElement): AnswerSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

  // Range is already in DOM order, including for backwards selections.
  const range = selection.getRangeAt(0)
  const body = answerBodyOf(range.startContainer)
  if (!body || !container.contains(body) || answerBodyOf(range.endContainer) !== body) return null
  const answerId = body.dataset.answerId
  if (!answerId) return null

  let start: number | undefined
  let end = 0
  for (const leaf of body.querySelectorAll('[data-md-leaf][data-source-start][data-source-end]')) {
    // A Markdown leaf's direct Text is the original UTF-16 slice. DOM element
    // boundaries can only enclose or miss it; only a Text boundary can clip it.
    const text = leaf.firstChild
    if (!(text instanceof Text)) continue
    if (range.comparePoint(text, 0) > 0) break
    if (range.comparePoint(text, text.length) < 0) continue
    const from = range.startContainer === text ? range.startOffset : 0
    const to = range.endContainer === text ? range.endOffset : text.length
    // A selection touching just the tail/head of a leaf contributes nothing.
    if (from >= to) continue

    start ??= Number(leaf.getAttribute('data-source-start')) + from
    end = Number(leaf.getAttribute('data-source-end')) - (text.length - to)
  }

  if (start === undefined || !(start < end)) return null
  return { answerId, start, end, rect: range.getBoundingClientRect() }
}
