import type { Page } from '@playwright/test'

type Boundary = { selector: string; index?: number } & (
  | { text: string; edge?: 'start' | 'end' }
  | { childOffset: number }
)

/** Place browser selection endpoints by visible text or by an element child boundary. */
export async function selectAnswerRange(page: Page, anchor: Boundary, focus: Boundary) {
  await page.evaluate(({ anchor, focus }) => {
    function point(boundary: Boundary): [Node, number] {
      const element = document.querySelectorAll(boundary.selector)[boundary.index ?? 0]
      if (!element) throw new Error(`没有匹配 ${boundary.selector} 的元素`)
      if ('childOffset' in boundary) return [element, boundary.childOffset]
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node as Text).data.indexOf(boundary.text)
        if (index >= 0) return [node, index + (boundary.edge === 'end' ? boundary.text.length : 0)]
      }
      throw new Error(`没有找到可选文字 ${boundary.text}`)
    }

    const selection = window.getSelection()
    if (!selection) throw new Error('没有选区')
    const [anchorNode, anchorOffset] = point(anchor)
    const [focusNode, focusOffset] = point(focus)
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
    document.querySelector('.chat-scroll')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  }, { anchor, focus })
}

export async function selectAnswerText(page: Page, text: string) {
  const selector = '.assistant-text[data-answer-id] p'
  await page.locator(selector).first().waitFor()
  const start = { selector, text }
  await selectAnswerRange(page, start, { ...start, edge: 'end' })
}
