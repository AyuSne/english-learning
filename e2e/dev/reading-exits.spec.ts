import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import { startSseStub } from '../../src/testing/sse-stub'
import { expect, test } from '../fixtures/app'
import { seedWordEntries } from '../fixtures/entries'
import { clickAway, selectText } from '../fixtures/reading'

const article = fixtureArticle({
  id: 'fixture-reading-exits',
  sentences: [
    ['Employers approach hiring differently.'],
    ['Approaching a new desk takes patience.']
  ],
  annotations: [{ surface: 'approach', gloss: '接近', paragraph: 0, sentence: 0 }]
})

let corpusDirectory: string

test.beforeAll(async () => {
  corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-reading-exits-'))
  writeCorpusDirectory(corpusDirectory, [article])
})

test.afterAll(async () => {
  await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

test('阅读页返回按钮标明来源，缺省时仍可返回', async ({ launch, userDataDirectory }) => {
  seedWordEntries(userDataDirectory, corpusDirectory, {
    picks: [{ entry: article, paragraphIndex: 0, needle: 'approach' }]
  })
  const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  const nav = page.getByRole('navigation', { name: '全局导航' })
  await nav.getByRole('button', { name: '文章库' }).click()
  await page.locator('.library-row').first().click()
  await page.getByRole('complementary', { name: '文章详情' })
    .getByRole('button', { name: '继续阅读' }).click()
  await expect(page.getByRole('button', { name: '返回文章库' })).toContainText('文章库')
  await page.getByRole('button', { name: '返回文章库' }).click()

  await nav.getByRole('button', { name: '首页' }).click()
  await page.getByRole('button', { name: '继续阅读' }).click()
  await expect(page.getByRole('button', { name: '返回首页' })).toContainText('首页')
  await page.getByRole('button', { name: '返回首页' }).click()

  await nav.getByRole('button', { name: '词条' }).click()
  await page.locator('.entries-row').filter({ hasText: 'approach' }).click()
  await page.getByRole('button', { name: '回到原文' }).first().click()
  await expect(page.getByRole('button', { name: '返回词条' })).toContainText('词条')
  await page.getByRole('button', { name: '返回词条' }).click()

  // 全局搜索尚未实现，先验证它可以通过来源参数标明返回目标。
  await page.evaluate((id) => { window.location.hash = `#/reading/${id}?from=search` }, article.id)
  await expect(page.getByRole('button', { name: '返回搜索结果' })).toContainText('搜索结果')
  await page.evaluate((id) => { window.location.hash = `#/reading/${id}` }, article.id)
  await expect(page.getByRole('button', { name: '返回', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.getByRole('button', { name: '返回搜索结果' })).toBeVisible()
})

test('刚收下与已收集的词都能直接打开选中的词条', async ({ launch }) => {
  const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  await page.getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '文章库' }).click()
  await page.locator('.library-row').first().click()
  await page.getByRole('complementary', { name: '文章详情' })
    .getByRole('button', { name: '继续阅读' }).click()

  await selectText(page, 0, 'approach')
  await page.getByRole('complementary', { name: '选词结果' })
    .getByRole('button', { name: '查看词条' }).click()
  await expect(page.getByRole('heading', { name: '词条', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'approach', level: 2 })).toBeVisible()

  await page.goBack()
  await expect(page.locator('.reading-collected')).toHaveCount(1)
  await clickAway(page)
  await page.locator('.reading-collected').first().click()
  await page.getByRole('complementary', { name: '词条' })
    .getByRole('button', { name: '打开词条' }).click()
  await expect(page.getByRole('heading', { name: '词条', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'approach', level: 2 })).toBeVisible()
})

test('就正文里点中的词提问时带上该词与那条原句', async ({ launch, userDataDirectory }) => {
  seedWordEntries(userDataDirectory, corpusDirectory, {
    picks: [
      { entry: article, paragraphIndex: 0, needle: 'approach' },
      { entry: article, paragraphIndex: 1, needle: 'Approaching' }
    ]
  })
  const stub = await startSseStub({ kind: 'stream', text: ['好的。'] })
  try {
    const { page } = await launch({ env: {
      CORPUS_DIRECTORY: corpusDirectory,
      DEEPSEEK_BASE_URL: stub.baseUrl,
      DEEPSEEK_API_KEY: 'e2e-test-key',
      DEEPSEEK_MODEL: 'deepseek-flash'
    } })
    await page.getByRole('navigation', { name: '全局导航' })
      .getByRole('button', { name: '文章库' }).click()
    await page.locator('.library-row').first().click()
    await page.getByRole('complementary', { name: '文章详情' })
      .getByRole('button', { name: '继续阅读' }).click()
    await page.locator('.reading-collected').filter({ hasText: 'approach' }).first().click()
    await page.getByRole('complementary', { name: '词条' })
      .getByRole('button', { name: '就这个词提问' }).click()

    await expect(page.getByRole('heading', { name: 'approach · 原句', level: 1 })).toBeVisible()
    await expect(page.locator('.context-chip-label')).toHaveText(['approach', 'approach'])
    await page.getByRole('textbox', { name: '输入问题' }).fill('这句怎么理解？')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('好的。')).toBeVisible()
    const messages = (stub.requests[0]?.body.messages ?? []) as { role: string; content: string }[]
    expect(messages[0]?.content).toContain('[原句] Employers approach hiring differently.')
    expect(messages[0]?.content).not.toContain('Approaching a new desk takes patience.')
  } finally {
    await stub.close()
  }
})

test('阅读页顶部可以围绕当前文章对话', async ({ launch }) => {
  const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  await page.getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '文章库' }).click()
  await page.locator('.library-row').first().click()
  await page.getByRole('complementary', { name: '文章详情' })
    .getByRole('button', { name: '继续阅读' }).click()
  const title = await page.locator('.reading-bar-title').innerText()
  await page.getByRole('button', { name: '与这篇文章对话' }).click()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(page.getByTestId('context-summary')).toHaveText(/^0 条原句 · 约 \d+ 字$/)
})

test('注释开关显示当前状态，并与正文的注释一致', async ({ launch }) => {
  const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  await page.getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '文章库' }).click()
  await page.locator('.library-row').first().click()
  await page.getByRole('complementary', { name: '文章详情' })
    .getByRole('button', { name: '继续阅读' }).click()
  const hide = page.getByRole('button', { name: '隐藏原文注释' })
  await expect(hide).toHaveText('注释：开')
  await expect(hide).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.reading-notes')).toBeVisible()
  await hide.click()
  const show = page.getByRole('button', { name: '显示原文注释' })
  await expect(show).toHaveText('注释：关')
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.reading-notes')).toBeHidden()
  await show.click()
  await expect(hide).toHaveText('注释：开')
  await expect(page.locator('.reading-notes')).toBeVisible()
})

test('阅读页可以为同一篇文章明确新开一条线程', async ({ launch }) => {
  const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  await page.getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '文章库' }).click()
  await page.locator('.library-row').first().click()
  await page.getByRole('complementary', { name: '文章详情' })
    .getByRole('button', { name: '继续阅读' }).click()
  await page.getByRole('button', { name: '与这篇文章对话' }).click()
  await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#\/chat\//)
  const firstThread = await page.evaluate(() => window.location.hash)
  await page.goBack()
  await expect(page.getByRole('button', { name: '新开一条文章线程' })).toBeVisible()
  await page.getByRole('button', { name: '新开一条文章线程' }).click()
  await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/^#\/chat\//)
  expect(await page.evaluate(() => window.location.hash)).not.toBe(firstThread)
})
