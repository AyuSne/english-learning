import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * 打开一篇文章的阅读页：文章库 → 第一行 → 继续阅读。
 * `title` 是语料里的篇名，用来确认打开的是这一篇。
 */
export async function openArticle(page: Page, title: string): Promise<void> {
  await page
    .getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '文章库' })
    .click()
  await expect(page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()
  await page.locator('.library-row').first().click()
  await page
    .getByRole('complementary', { name: '文章详情' })
    .getByRole('button', { name: '继续阅读' })
    .click()
  await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
}

/**
 * 按段落在 DOM 里圈出一段文字，再补一次 mouseup，走的是阅读页真实的选区处理。
 * 浏览器里拖选不一定逐字可控，这里用 Range 精确落下同一段选区。
 */
export async function selectText(
  page: Page,
  paragraphIndex: number,
  text: string
): Promise<void> {
  await page.evaluate(
    ({ paragraphIndex: index, text: target }) => {
      const paragraph = document.querySelectorAll('.reading-paragraph')[index]
      if (!paragraph) throw new Error(`没有第 ${index} 段`)
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      const nodes: { node: Text; start: number }[] = []
      let full = ''
      while (walker.nextNode()) {
        const node = walker.currentNode as Text
        nodes.push({ node, start: full.length })
        full += node.textContent ?? ''
      }
      const start = full.indexOf(target)
      if (start < 0) throw new Error(`段落里没有 ${target}`)

      const locate = (offset: number): [Text, number] => {
        for (const entry of nodes) {
          const length = entry.node.textContent?.length ?? 0
          if (offset >= entry.start && offset <= entry.start + length) {
            return [entry.node, offset - entry.start]
          }
        }
        const last = nodes.at(-1)
        if (!last) throw new Error('没有文字节点')
        return [last.node, last.node.textContent?.length ?? 0]
      }

      const [startNode, startOffset] = locate(start)
      const [endNode, endOffset] = locate(start + target.length)
      const range = document.createRange()
      range.setStart(startNode, startOffset)
      range.setEnd(endNode, endOffset)
      const selection = window.getSelection()
      if (!selection) throw new Error('没有选区')
      selection.removeAllRanges()
      selection.addRange(range)
      document
        .querySelector('.reading-body')
        ?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    },
    { paragraphIndex, text }
  )
}

/** 点正文外的地方收起浮层，让选中态变成已收集的弱高亮。 */
export async function clickAway(page: Page): Promise<void> {
  await page.locator('.reading-bar-title').click()
  await expect(page.locator('.reading-selected')).toHaveCount(0)
}
