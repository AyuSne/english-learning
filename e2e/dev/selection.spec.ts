import type { Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import { expect, test } from '../fixtures/app'

const articleTitle = '2026年6月 · 第1套 · 仔细阅读 Passage One'

const article = fixtureArticle({
  id: 'fixture-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  sentences: [
    [
      'Employers approach hiring differently.',
      'Approaching a new desk takes patience and a little nerve.'
    ],
    ['She approached the counter quietly.', 'Practice keeps the skill alive over time.']
  ]
})

let corpusDirectory: string

test.beforeAll(async () => {
  corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-selection-corpus-'))
  writeCorpusDirectory(corpusDirectory, [article])
})

test.afterAll(async () => {
  await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

async function openArticle(page: Page): Promise<void> {
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
  await expect(page.getByRole('heading', { name: articleTitle, level: 1 })).toBeVisible()
}

/**
 * 按段落在 DOM 里圈出一段文字，再补一次 mouseup，走的是阅读页真实的选区处理。
 * 浏览器里拖选不一定逐字可控，这里用 Range 精确落下同一段选区。
 */
async function selectText(page: Page, paragraphIndex: number, text: string): Promise<void> {
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
async function clickAway(page: Page): Promise<void> {
  await page.locator('.reading-bar-title').click()
  await expect(page.locator('.reading-selected')).toHaveCount(0)
}

test.describe('选词与原句', () => {
  test('圈一个词当场高亮，收成原句与词条，重读时弱高亮', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openArticle(page)

    await selectText(page, 0, 'hiring')

    await expect(page.locator('.reading-selected')).toHaveText(['hiring'])
    const panel = page.getByRole('complementary', { name: '选词结果' })
    await expect(panel).toBeVisible()
    await expect(panel.getByText('已收下')).toBeVisible()
    await expect(panel.locator('.reading-panel-word')).toHaveText('hiring')
    await expect(panel.getByText('词条 hiring')).toBeVisible()
    await expect(panel.locator('.reading-panel-sentence')).toHaveText(
      'Employers approach hiring differently.'
    )
    await expect(panel.getByText('已有 1 条原句 · 来自 1 篇文章')).toBeVisible()

    await clickAway(page)
    await expect(page.locator('.reading-collected')).toHaveText(['hiring'])

    // 退回文章库再打开，弱高亮还在，说明原句与归属都落了库。
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()
    await page.locator('.library-row').first().click()
    await page
      .getByRole('complementary', { name: '文章详情' })
      .getByRole('button', { name: '继续阅读' })
      .click()
    await expect(page.locator('.reading-collected')).toHaveText(['hiring'])
  })

  test('同篇同句重复圈只留一条关联', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openArticle(page)

    await selectText(page, 0, 'hiring')
    await expect(page.getByRole('complementary', { name: '选词结果' })).toBeVisible()
    await clickAway(page)

    await selectText(page, 0, 'hiring')

    const panel = page.getByRole('complementary', { name: '选词结果' })
    await expect(panel.getByText('这条原句已经收过')).toBeVisible()
    await expect(panel.getByText('已有 1 条原句 · 来自 1 篇文章')).toBeVisible()
    await clickAway(page)
    await expect(page.locator('.reading-collected')).toHaveCount(1)
  })

  test('常见词形变化归入同一词条，点弱高亮能看词条卡', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openArticle(page)

    await selectText(page, 0, 'approach')
    await clickAway(page)
    await selectText(page, 0, 'Approaching')
    await clickAway(page)

    await expect(page.locator('.reading-collected')).toHaveCount(2)
    await page.locator('.reading-collected').first().click()

    const card = page.getByRole('complementary', { name: '词条' })
    await expect(card).toBeVisible()
    await expect(card.locator('.reading-panel-word')).toHaveText('approach')
    await expect(card.getByText('已收集 2 条原句 · 来自 1 篇文章')).toBeVisible()
    await expect(card.locator('.reading-panel-variants')).toContainText('Approaching')
    await expect(card.locator('.reading-panel-sentence')).toHaveCount(2)
  })

  test('已收集的词弱高亮可以关掉，再打开', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openArticle(page)

    await selectText(page, 0, 'hiring')
    await clickAway(page)
    await expect(page.locator('.reading-collected')).toHaveCount(1)

    await page.getByRole('button', { name: '阅读设置' }).click()
    await page.getByRole('checkbox', { name: '已收集的词弱高亮' }).uncheck()
    await expect(page.locator('.reading-collected')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: '阅读设置' }).click()
    await page.getByRole('checkbox', { name: '已收集的词弱高亮' }).check()
    await page.keyboard.press('Escape')
    await expect(page.locator('.reading-collected')).toHaveCount(1)
  })

  test('删原句后计数正确，删最后一条先提示再连词条一起删', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openArticle(page)

    await selectText(page, 0, 'approach')
    await clickAway(page)
    await selectText(page, 0, 'Approaching')
    await clickAway(page)

    await page.locator('.reading-collected').first().click()
    const card = page.getByRole('complementary', { name: '词条' })
    await expect(card.getByText('已收集 2 条原句 · 来自 1 篇文章')).toBeVisible()

    // 还剩一条时直接删，不弹确认。
    await card.getByRole('button', { name: '删除这条原句' }).first().click()
    await expect(card.getByText('已收集 1 条原句 · 来自 1 篇文章')).toBeVisible()

    // 最后一条先给提示，取消后不动。
    await card.getByRole('button', { name: '删除这条原句' }).click()
    await expect(card.getByText('这是最后一条原句')).toBeVisible()
    await card.getByRole('button', { name: '取消' }).click()
    await expect(card.getByText('已收集 1 条原句 · 来自 1 篇文章')).toBeVisible()

    await card.getByRole('button', { name: '删除这条原句' }).click()
    await card.getByRole('button', { name: '删除词条与原句' }).click()

    await expect(page.getByRole('complementary', { name: '词条' })).toHaveCount(0)
    await expect(page.locator('.reading-collected')).toHaveCount(0)
    await expect(page.getByText('原句与这个词条已删除。')).toBeVisible()
  })
})
