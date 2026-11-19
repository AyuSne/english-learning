import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askQuestion, createThread, saveAnswer } from '../../src/main/chat/threads'
import { openDatabase } from '../../src/main/db/database'
import { createPin } from '../../src/main/pins/pins'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import { expect, test } from '../fixtures/app'
import { databasePath } from '../fixtures/database'
import { seedWordEntries } from '../fixtures/entries'

const SHORT_SENTENCE = 'Employers approach hiring differently.'
const LONG_SENTENCE = 'Approaching a new desk takes patience, especially when every unfamiliar detail of the workplace makes it harder to find the notes left by the previous team.'
const article = fixtureArticle({
  id: 'fixture-context-pin-board',
  sentences: [[SHORT_SENTENCE], [LONG_SENTENCE]]
})

let corpusDirectory: string

test.beforeAll(async () => {
  corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-context-pin-board-'))
  writeCorpusDirectory(corpusDirectory, [article])
})

test.afterAll(async () => {
  await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

test('词条和原句线程区分主词形与原句，长句截断但悬停可看全文', async ({
  launch,
  userDataDirectory
}) => {
  seedWordEntries(userDataDirectory, corpusDirectory, {
    picks: [
      { entry: article, paragraphIndex: 0, needle: 'approach', at: '2026-11-18T08:00:00.000Z' },
      { entry: article, paragraphIndex: 1, needle: 'Approaching', at: '2026-11-18T08:01:00.000Z' }
    ]
  })
  const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  await page.getByRole('navigation', { name: '全局导航' }).getByRole('button', { name: '词条' }).click()
  await page.locator('.entries-row').filter({ hasText: 'approach' }).click()
  await page.getByRole('button', { name: '开始对话' }).click()

  const context = page.getByRole('region', { name: '学习上下文' })
  const chips = context.locator('.context-chip-label')
  await expect(chips).toHaveText(['approach', LONG_SENTENCE], { timeout: 3000 })
  const original = context.getByTitle(LONG_SENTENCE, { exact: true })
  await expect(original).toBeVisible()
  await expect(original).toHaveCSS('text-overflow', 'ellipsis')
  expect(await original.evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(true)

  await page.getByRole('heading', { name: 'approach', level: 1 }).getByRole('button').click()
  const shortSentence = page.locator('.entry-sentence').filter({ hasText: SHORT_SENTENCE })
  await shortSentence.hover()
  await shortSentence.getByRole('button', { name: '用这句提问' }).click()
  await expect(chips).toHaveText(['approach', SHORT_SENTENCE])
  await expect(context.getByTitle(SHORT_SENTENCE, { exact: true })).toBeVisible()
})

function seedPinThreads(userDataDirectory: string): string {
  seedWordEntries(userDataDirectory, corpusDirectory, { picks: [] })
  const database = openDatabase(databasePath(userDataDirectory))
  try {
    const seedThread = (question: string, filed: string, unfiled: string[]): string => {
      const thread = createThread(database, { main: { kind: 'none' } })
      if (thread.status !== 'created') throw new Error('线程没建起来')
      const threadId = thread.thread.id
      const asked = askQuestion(database, { threadId, text: question })
      if (asked.status !== 'asked') throw new Error('问题没写进去')
      const text = [filed, ...unfiled].join('\n\n')
      const saved = saveAnswer(database, {
        threadId, questionId: asked.questionId, text, thinking: '', phase: 'done'
      })
      const answerId = saved.status === 'saved' && saved.thread.turns[0]?.answer?.id
      if (!answerId) throw new Error('没有回答')
      for (const excerpt of [filed, ...unfiled]) {
        const start = text.indexOf(excerpt)
        const result = createPin(database, {
          threadId, answerId, start, end: start + excerpt.length,
          target: excerpt === filed ? { kind: 'article', articleId: article.id } : { kind: 'unfiled' }
        })
        if (result.status !== 'pinned') throw new Error('没钉上')
      }
      return threadId
    }
    const currentId = seedThread('本线程的提问', '本线程已归档', ['本线程的暂存'])
    seedThread('另一条线程的提问', '其他线程已归档', ['其他线程的第一条暂存', '其他线程的第二条暂存'])
    return currentId
  } finally {
    database.close()
  }
}

test('顶栏和窄条区分本线程与全局未归档，两类 tab 的计数对应实际卡片', async ({
  launch,
  userDataDirectory
}) => {
  const currentId = seedPinThreads(userDataDirectory)
  const { page } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  await page.evaluate((id) => { window.location.hash = `#/chat/${id}` }, currentId)
  await expect(page.getByRole('heading', { name: '本线程的提问', level: 1 })).toBeVisible()

  const board = page.getByRole('complementary', { name: '钉板', exact: true })
  await expect(board.getByRole('button', { name: '未归档 3', exact: true })).toContainText('未归档', { timeout: 3000 })
  await board.getByRole('button', { name: '未归档 3', exact: true }).click()
  await expect(board.getByRole('tab', { name: '未归档 3', exact: true })).toHaveAttribute('aria-selected', 'true')
  const panel = board.getByRole('tabpanel')
  await expect(panel.getByRole('article')).toHaveCount(3)
  await expect(panel).toContainText('本线程的暂存')
  await expect(panel).toContainText('其他线程的第二条暂存')
  await expect(panel).not.toContainText('已归档')

  await page.getByRole('button', { name: '钉板 1 · 本线程', exact: true }).click()
  await expect(board.getByRole('tab', { name: '这条线程 1', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('article')).toHaveCount(1)
  await expect(panel).toContainText('本线程已归档')
  await expect(panel).not.toContainText('其他线程已归档')
})

test('窄窗钉板覆盖而不挤压正文，空态一行并可用关闭按钮、遮罩或 Esc 收起', async ({ launch }) => {
  const { page, electronApp } = await launch({ env: { CORPUS_DIRECTORY: corpusDirectory } })
  if (electronApp === null) throw new Error('需要开发版 Electron 进程')
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) throw new Error('没有主窗口')
    window.setContentSize(1080, 820)
  })
  await expect.poll(() => page.evaluate(() => matchMedia('(max-width: 1100px)').matches)).toBe(true)
  await page.getByRole('navigation', { name: '全局导航' }).getByRole('button', { name: '对话' }).click()
  const answerColumn = page.locator('.chat-column')
  const composer = page.getByRole('textbox', { name: '输入问题' })
  await composer.fill('暂不发送的提问')
  const originalColumn = await answerColumn.boundingBox()
  if (originalColumn === null) throw new Error('找不到正文列')
  const openThread = page.getByRole('button', { name: '钉板 0 · 本线程', exact: true })
  const board = page.getByRole('complementary', { name: '钉板', exact: true })
  const close = board.getByRole('button', { name: '关闭钉板' })
  const collapsed = board.getByRole('button', { name: '未归档 0', exact: true })
  const panel = board.getByRole('tabpanel')

  await openThread.click()
  await expect(panel).toHaveText('这条线程还没有钉住')
  expect(await answerColumn.boundingBox()).toEqual(originalColumn)
  await expect(close).toHaveText('关闭', { timeout: 3000 })
  await close.click()
  await expect(collapsed).toBeVisible()

  await collapsed.click()
  await expect(panel).toHaveText('没有未归档')
  await expect(board).not.toContainText('未归档 0 条 · 不计入收集')
  await page.mouse.click(originalColumn.x + 8, originalColumn.y + 8)
  await expect(collapsed).toBeVisible()

  await openThread.click()
  await page.keyboard.press('Escape')
  await expect(collapsed).toBeVisible()
  await expect(composer).toHaveValue('暂不发送的提问')
})
