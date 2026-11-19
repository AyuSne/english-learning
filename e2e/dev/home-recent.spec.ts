import type { Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../../src/main/db/database'
import { migrate } from '../../src/main/db/migrations'
import { importCorpus } from '../../src/main/corpus/import'
import { openArticle } from '../../src/main/library/queries'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import { expect, test } from '../fixtures/app'
import { databasePath } from '../fixtures/database'
import { seedWordEntries } from '../fixtures/entries'

/**
 * 首页「最近收集」与「继续阅读」的真实内容。fixture 语料单独建在临时目录里，
 * 不依赖首批 63 篇正文，也不与其他用例共用 userData。
 */

const article = fixtureArticle({
  id: 'fixture-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  sentences: [
    [
      'Employers approach hiring differently.',
      'Context keeps the skill alive.',
      'A steady habit keeps the reading going.'
    ]
  ]
})

let corpusDirectory: string

test.beforeAll(async () => {
  corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-home-recent-corpus-'))
  writeCorpusDirectory(corpusDirectory, [article])
})

test.afterAll(async () => {
  await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

async function nav(page: Page, label: string): Promise<void> {
  await page
    .getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: label, exact: true })
    .click()
}

/** 先在库外写好三篇的状态，再启动应用；导出统一走真实的主进程读模型来断言。 */
function seedArticles(userDataDirectory: string, openedAt?: string): void {
  const database = openDatabase(databasePath(userDataDirectory))
  try {
    migrate(database)
    importCorpus(database, { directory: corpusDirectory })
    if (openedAt !== undefined) {
      openArticle(database, article.id, { now: openedAt })
    }
  } finally {
    database.close()
  }
}

test.describe('首页最近收集', () => {
  test('没收集过词条时只给明确空态，不摆假 chip', async ({ launch, userDataDirectory }) => {
    seedArticles(userDataDirectory)
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
    await expect(page.getByRole('heading', { name: '最近收集' })).toBeVisible()
    await expect(
      page.getByText('还没有词条。读的时候圈一个词，它就会出现在这里。')
    ).toBeVisible()
    await expect(page.locator('.home-entry')).toHaveCount(0)
  })

  test('按最近收集排序显示三个词条，点 chip 直接进对应词条', async ({
    launch,
    userDataDirectory
  }) => {
    seedWordEntries(userDataDirectory, corpusDirectory, {
      picks: [
        { entry: article, paragraphIndex: 0, needle: 'approach', at: '2026-11-18T08:00:00.000Z' },
        { entry: article, paragraphIndex: 0, needle: 'Context', at: '2026-11-18T08:05:00.000Z' },
        { entry: article, paragraphIndex: 0, needle: 'habit', at: '2026-11-18T08:10:00.000Z' }
      ]
    })
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })

    await expect(page.locator('.home-entry')).toHaveCount(3)
    await expect(page.locator('.home-entry-form')).toHaveText(['habit', 'Context', 'approach'])
    await expect(page.locator('.home-entry-meta').first()).toHaveText('1 句 · 1 篇')

    await page.locator('.home-entry').filter({ hasText: 'Context' }).click()

    await expect(page.getByRole('heading', { name: '词条', level: 1 })).toBeVisible()
    await expect(
      page.getByRole('region', { name: '词条内容' }).getByRole('heading', { name: 'Context', level: 2 })
    ).toBeVisible()
    await nav(page, '首页')
    await expect(page.locator('.home-entry')).toHaveCount(3)
  })

  test('继续阅读的场次在 eyebrow，标题是篇名，meta 不重复题型与场次', async ({
    launch,
    userDataDirectory
  }) => {
    seedArticles(userDataDirectory, '2026-11-18T09:00:00.000Z')
    const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })

    const block = page.getByRole('region', { name: '继续阅读' })
    await expect(block.locator('.eyebrow')).toHaveText('2026年6月 · 第1套')
    await expect(block.getByRole('heading', { level: 1 })).toHaveText('仔细阅读 Passage One')
    const meta = block.locator('.home-meta')
    await expect(meta).toHaveText(/^\d+ 词 · 读到 \d+%$/)
    await expect(meta).not.toContainText('仔细阅读 Passage One')
    await expect(meta).not.toContainText('2026年6月')
    await expect(meta).not.toContainText('第1套')
  })
})
