import type { Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import { expect, test } from '../fixtures/app'
import { readBootstrap } from '../fixtures/bridge'
import { seedWordEntries } from '../fixtures/entries'

const TITLE_A = '2024年6月 · 第1套 · 仔细阅读 Passage One'
const TITLE_B = '2024年6月 · 第1套 · 仔细阅读 Passage Two'

const articleA = fixtureArticle({
  id: 'fixture-2024-06-s1-c1',
  year: 2024,
  month: 6,
  set: 1,
  sentences: [['Alpha opens the passage.', 'A second sentence stays put.']]
})

const articleB = fixtureArticle({
  id: 'fixture-2024-06-s1-c2',
  year: 2024,
  month: 6,
  set: 1,
  label: TITLE_B,
  sentences: [['Bravo carries the other article.', 'It survives the first deletion.']]
})

async function openLibrary(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '文章库' })
    .click()
  await expect(page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()
}

test.describe('文章重命名与删除', () => {
  test('改显示名在列表/详情/阅读页同步，删除前看到影响面，重启不复活也不丢名字', async ({
    launch,
    userDataDirectory
  }) => {
    const corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-e2e-article-'))
    try {
      writeCorpusDirectory(corpusDirectory, [articleA, articleB])
      seedWordEntries(userDataDirectory, corpusDirectory, {
        picks: [{ entry: articleA, paragraphIndex: 0, needle: 'Alpha' }],
        notes: [{ entryMainForm: 'Alpha', body: 'Alpha 的学习内容' }]
      })

      const first = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
      const page = first.page
      await openLibrary(page)
      await expect(page.getByText('2 篇 · 1 个场次')).toBeVisible()

      const detail = page.getByRole('complementary', { name: '文章详情' })
      await expect(detail.locator('.library-detail-title')).toHaveText(TITLE_A)
      await expect(page.locator('.library-row').first()).toContainText(TITLE_A)

      await detail.getByRole('button', { name: '重命名' }).click()
      await detail.getByRole('textbox', { name: '篇名' }).fill('我的文章')
      await detail.getByRole('button', { name: '保存篇名' }).click()

      await expect(detail.locator('.library-detail-title')).toHaveText('我的文章')
      await expect(page.locator('.library-row').first()).toContainText('我的文章')
      await expect(page.getByText('篇名已改为「我的文章」。')).toBeVisible()

      await detail.getByRole('button', { name: '继续阅读' }).click()
      await expect(page.getByRole('heading', { name: '我的文章', level: 1 })).toBeVisible()
      await page.keyboard.press('Escape')
      await openLibrary(page)

      // 重启一次：语料导入不能把改过的名字覆盖回清单里的篇名。
      await first.close()
      const second = await launch({ userDataDirectory, env: { CORPUS_DIRECTORY: corpusDirectory } })
      await openLibrary(second.page)
      await expect(second.page.locator('.library-row').first()).toContainText('我的文章')
      await expect(second.page.getByText('2 篇 · 1 个场次')).toBeVisible()

      await second.page.locator('.library-row').first().click()
      const secondDetail = second.page.getByRole('complementary', { name: '文章详情' })
      await secondDetail.getByRole('button', { name: '删除文章' }).click()
      const dialog = second.page.getByRole('alertdialog', { name: '删除文章' })
      await expect(dialog).toContainText('将删除 1 条原句关联。')
      await expect(dialog).toContainText(
        '影响 1 个词条：0 个仍有别的原句、会保留，1 个会连同 1 条学习内容一起删除。'
      )
      await expect(dialog).toContainText('没有挂在本篇的钉住。')
      await dialog.getByRole('button', { name: '确认删除' }).click()

      await expect(second.page.getByText('1 篇 · 1 个场次')).toBeVisible()
      await expect(second.page.locator('.library-row')).toHaveCount(1)
      await expect(second.page.locator('.library-row').first()).toContainText(TITLE_B)
      await expect(second.page.getByText('文章已删除。')).toBeVisible()
      await expect(secondDetail.locator('.library-detail-title')).toHaveText(TITLE_B)

      // 直接输入已删文章的阅读地址：回到文章库，不白屏、不留在死地址上。
      await second.page.evaluate(() => {
        window.location.hash = '#/reading/fixture-2024-06-s1-c1'
      })
      await expect(second.page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()
      await expect(second.page.locator('.library-row')).toHaveCount(1)

      await second.close()
      const third = await launch({ userDataDirectory, env: { CORPUS_DIRECTORY: corpusDirectory } })
      await openLibrary(third.page)
      await expect(third.page.getByText('1 篇 · 1 个场次')).toBeVisible()
      await expect(third.page.locator('.library-row')).toHaveCount(1)
      await expect(third.page.locator('.library-row').first()).toContainText(TITLE_B)
      const bootstrap = await readBootstrap(third.page)
      expect(bootstrap.corpusImport).toMatchObject({ imported: 0, updated: 0, skipped: 2 })
    } finally {
      await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })
})
