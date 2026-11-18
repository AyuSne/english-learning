import type { Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import { expect, test } from '../fixtures/app'

/** 加长句子，保证 620 列正文在默认窗口里能滚起来。 */
function sentence(lead: string): string {
  return `${lead} This sentence keeps going so the passage is long enough to scroll through at a comfortable pace.`
}

const longMatchTitle = '2026年6月 · 第1套 · 长篇匹配'
const carefulTitle = '2026年6月 · 第1套 · 仔细阅读 Passage One'

const longMatch = fixtureArticle({
  id: 'fixture-2026-06-s1-b',
  year: 2026,
  month: 6,
  set: 1,
  kind: 'long_match',
  sentences: [
    [
      sentence('Phyllis Hartman knows what it is like to sit through one meeting after another.'),
      sentence('Managers arranged so many meetings that attendees would fall asleep at the table.')
    ],
    [
      sentence('Some readers lament the way meetings swallow whole afternoons of quiet work.'),
      sentence('A shipwreck of a schedule leaves no room for reading or thinking.')
    ],
    [
      sentence('The habit of blocking out hours keeps the calendar full but the mind empty.'),
      sentence('Changing that habit begins with noticing where the time actually goes.')
    ],
    [
      sentence('A shorter agenda forces everyone to say what matters and skip the rest.'),
      sentence('Teams that try it report fewer meetings and clearer decisions.')
    ],
    [
      sentence('Quiet hours return once the calendar stops filling every open slot.'),
      sentence('The work still gets done, and the afternoon feels longer.')
    ],
    [
      sentence('Reading a passage slowly shows which sentences carry the argument.'),
      sentence('That habit of attention is what the whole practice is for.')
    ]
  ],
  annotations: [
    { surface: 'lament', gloss: '悲叹', paragraph: 1, sentence: 0 },
    { surface: 'shipwreck', gloss: '海难', paragraph: 1, sentence: 1 }
  ]
})

const carefulReading = fixtureArticle({
  id: 'fixture-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  kind: 'careful_reading',
  sentences: [
    [sentence('Careful reading keeps paragraph letters out of sight.'), sentence('The text still runs down the page in one column.')],
    [sentence('A second paragraph keeps the passage going.'), sentence('Nothing else about the layout changes here.')]
  ]
})

let corpusDirectory: string

test.beforeAll(async () => {
  corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-reading-corpus-'))
  writeCorpusDirectory(corpusDirectory, [longMatch, carefulReading])
})

test.afterAll(async () => {
  await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

async function openFromLibrary(page: Page, index: number): Promise<void> {
  await page
    .getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '文章库' })
    .click()
  await expect(page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()
  await page.locator('.library-row').nth(index).click()
  await page
    .getByRole('complementary', { name: '文章详情' })
    .getByRole('button', { name: '继续阅读' })
    .click()
  await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
  await expect(page.locator('.reading-paragraph').first()).toBeVisible()
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: '阅读设置' }).click()
  await expect(page.getByRole('region', { name: '阅读设置' })).toBeVisible()
}

test.describe('阅读页与阅读设置', () => {
  test('长篇匹配：620 列、默认字号行距、段首 A–P、宽窗口页边注', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openFromLibrary(page, 0)

    await expect(page.getByRole('heading', { name: longMatchTitle, level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: '全局导航' })).toHaveCount(0)

    const firstParagraph = page.locator('.reading-paragraph').first()
    await expect(firstParagraph).toHaveCSS('font-size', '20px')
    await expect(firstParagraph).toHaveCSS('line-height', '36px')
    const paragraphBox = await firstParagraph.boundingBox()
    expect(Math.round(paragraphBox?.width ?? 0)).toBe(620)

    await expect(page.locator('.reading-letter')).toHaveText(['A', 'B', 'C', 'D', 'E', 'F'])

    const notes = page.locator('.reading-note')
    await expect(notes).toHaveCount(2)
    await expect(notes.first()).toContainText('lament')
    await expect(notes.first()).toContainText('悲叹')
    await expect(notes.nth(1)).toContainText('shipwreck')
    await expect(notes.nth(1)).toContainText('海难')

    // 宽窗口不把注释缩成行内上标，正文里也不出现注释文字。
    const inlineGloss = await page
      .locator('.reading-annotated')
      .first()
      .evaluate((element) => getComputedStyle(element, '::after').content)
    expect(inlineGloss).toBe('none')

    // 顶栏一键隐藏 / 显示注释。
    await page.getByRole('button', { name: '隐藏原文注释' }).click()
    await expect(page.locator('.reading-notes').first()).toBeHidden()
    await page.getByRole('button', { name: '显示原文注释' }).click()
    await expect(page.locator('.reading-notes').first()).toBeVisible()
  })

  test('字号、行距与注释开关按篇记住，仔细阅读不显示段落字母', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openFromLibrary(page, 0)

    await openSettings(page)
    await page.getByRole('group', { name: '字号' }).getByRole('button', { name: '22' }).click()
    await page.getByRole('group', { name: '行距' }).getByRole('button', { name: '2.0' }).click()
    await page.getByRole('checkbox', { name: '显示原文注释' }).uncheck()

    const firstParagraph = page.locator('.reading-paragraph').first()
    await expect(firstParagraph).toHaveCSS('font-size', '22px')
    await expect(firstParagraph).toHaveCSS('line-height', '44px')
    await expect(page.locator('.reading-notes').first()).toBeHidden()
    await expect(page.getByText('字号 22 · 行距 2.0 · 按本篇记住')).toBeVisible()

    // 第一次 Esc 关设置，第二次才退回文章库。
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: '阅读设置' })).toBeHidden()
    await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()

    // 同一篇的设置在重新打开后还在。
    await openFromLibrary(page, 0)
    await expect(page.locator('.reading-paragraph').first()).toHaveCSS('font-size', '22px')
    await expect(page.locator('.reading-notes').first()).toBeHidden()
    await openSettings(page)
    await expect(page.getByRole('checkbox', { name: '显示原文注释' })).not.toBeChecked()
    await page.keyboard.press('Escape')

    // 换一篇仍是全局默认，说明上一步只记住了那一篇。
    await page.keyboard.press('Escape')
    await openFromLibrary(page, 1)
    await expect(page.getByRole('heading', { name: carefulTitle, level: 1 })).toBeVisible()
    await expect(page.locator('.reading-paragraph').first()).toHaveCSS('font-size', '20px')
    await expect(page.locator('.reading-paragraph').first()).toHaveCSS('line-height', '36px')
    await expect(page.locator('.reading-letter')).toHaveCount(0)
    await openSettings(page)
    await expect(page.getByRole('checkbox', { name: '显示原文注释' })).toBeChecked()
    await expect(page.getByText('字号 20 · 行距 1.8 · 来自全局默认')).toBeVisible()
  })

  test('窄窗口把注释改为行内展开，正文与复制文本不含注释', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openFromLibrary(page, 0)

    await page.setViewportSize({ width: 960, height: 800 })
    await expect(page.locator('.reading-notes').first()).toBeHidden()

    const annotated = page.locator('.reading-annotated').first()
    const inlineGloss = await annotated.evaluate(
      (element) => getComputedStyle(element, '::after').content
    )
    expect(inlineGloss).toContain('悲叹')

    // 划走整段：伪元素注释不进入选区文字，复制与交给模型的正文因此是干净的。
    const selected = await page.evaluate(() => {
      const paragraphs = document.querySelectorAll('.reading-paragraph')
      const target = paragraphs[1]
      if (!target) return ''
      const range = document.createRange()
      range.selectNodeContents(target)
      const selection = window.getSelection()
      if (!selection) return ''
      selection.removeAllRanges()
      selection.addRange(range)
      return selection.toString()
    })
    expect(selected).toContain('lament')
    expect(selected).toContain('shipwreck')
    expect(selected).not.toContain('悲叹')
    expect(selected).not.toContain('海难')

    // 一键隐藏后行内注释也不再出现。
    await openSettings(page)
    await page.getByRole('checkbox', { name: '显示原文注释' }).uncheck()
    const hiddenGloss = await annotated.evaluate(
      (element) => getComputedStyle(element, '::after').content
    )
    expect(hiddenGloss).toBe('none')
  })

  test('读到哪记到哪，首页续读回到那一句', async ({ launch }) => {
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await openFromLibrary(page, 0)

    await page.locator('.reading-scroll').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    // 等滚动后的位置更新与那次节流写库都落地，再读页脚、退回。
    await page.waitForTimeout(800)
    const footer = (await page.locator('.reading-foot span').first().textContent()) ?? ''
    const matched = footer.match(/第 (\d+) 段 · 第 (\d+) 句/)
    expect(matched).not.toBeNull()
    const paragraphOrdinal = Number(matched?.[1]) - 1
    const sentenceOrdinal = Number(matched?.[2]) - 1

    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()

    await page
      .getByRole('navigation', { name: '全局导航' })
      .getByRole('button', { name: '首页' })
      .click()
    await expect(page.getByText(`上次停在 第 ${paragraphOrdinal + 1} 段 · 第 ${sentenceOrdinal + 1} 句`)).toBeVisible()

    await page.getByRole('button', { name: '继续阅读' }).click()
    await expect(page.locator('[data-reading-page="true"]')).toBeVisible()

    const restored = page.locator(
      `[data-paragraph-ordinal="${paragraphOrdinal}"][data-sentence-ordinal="${sentenceOrdinal}"]`
    )
    await expect(restored).toBeVisible()
    const restoredBox = await restored.boundingBox()
    expect(restoredBox?.y ?? 0).toBeLessThan(300)
    expect(
      await page.locator('.reading-scroll').evaluate((element) => element.scrollTop)
    ).toBeGreaterThan(0)
  })
})
