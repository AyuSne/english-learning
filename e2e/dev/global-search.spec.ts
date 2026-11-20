import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import { startSseStub, type SseStub, type StubScript } from '../../src/testing/sse-stub'
import { expect, test } from '../fixtures/app'
import { seedWordEntries, type SeedNote, type SeedPick } from '../fixtures/entries'
import { openArticle } from '../fixtures/reading'

/**
 * T14 全局搜索：外壳覆盖层、词条 / 文章两组、命中类型与真实片段高亮，
 * 词条原句与学习内容定位、文章普通未收集句定位、生成文章正文参与搜索，
 * 以及 Esc / 点外部关闭不丢底页状态、不误触阅读退出与对话停止。
 */

const article = fixtureArticle({
  id: 'fixture-global-search-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  sentences: [
    ['Employers approach hiring differently.', 'Approaching a new desk takes patience.'],
    ['Context keeps the skill alive.', 'A zebra never appears in the corpus.'],
    ['The counter stays open late.', 'Repeated words stick.']
  ]
})

const picks: SeedPick[] = [
  { entry: article, paragraphIndex: 0, needle: 'approach', at: '2026-11-18T08:00:00.000Z' },
  { entry: article, paragraphIndex: 1, needle: 'Context', at: '2026-11-18T08:05:00.000Z' }
]

const notes: SeedNote[] = [
  { entryMainForm: 'approach', body: '记：approach 是「做法、途径」。' }
]

const AI_BODY =
  'Approach shapes how we read. Context keeps the meaning alive.\n\n' +
  'A second paragraph follows here. The luminous lantern marks this line.'

let corpusDirectory: string
const stubs: SseStub[] = []

test.beforeAll(async () => {
  corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-global-search-'))
  writeCorpusDirectory(corpusDirectory, [article])
})

test.afterAll(async () => {
  await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

test.afterEach(async () => {
  await Promise.all(stubs.splice(0).map((stub) => stub.close()))
})

async function createStub(script: StubScript): Promise<SseStub> {
  const stub = await startSseStub(script)
  stubs.push(stub)
  return stub
}

function launchEnv(stub: SseStub | null = null): Record<string, string> {
  return {
    CORPUS_DIRECTORY: corpusDirectory,
    ...(stub === null
      ? {}
      : {
          DEEPSEEK_BASE_URL: stub.baseUrl,
          DEEPSEEK_API_KEY: 'e2e-test-key',
          DEEPSEEK_MODEL: 'deepseek-flash'
        })
  }
}

function seed(userDataDirectory: string): void {
  seedWordEntries(userDataDirectory, corpusDirectory, { picks, notes })
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: '全局导航' })
}

function searchDialog(page: Page) {
  return page.getByRole('dialog', { name: '全局搜索' })
}

function searchInput(page: Page) {
  return page.getByRole('searchbox', { name: '搜索词条与文章' })
}

async function openSearch(page: Page): Promise<void> {
  await page.getByRole('button', { name: '全局搜索' }).click()
  await expect(searchDialog(page)).toBeVisible()
  await expect(searchInput(page)).toBeFocused()
}

async function resizeTo(
  page: Page,
  electronApp: ElectronApplication | null,
  width: number
): Promise<void> {
  if (electronApp !== null) {
    await electronApp.evaluate(
      ({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows()[0]
        if (window === undefined) throw new Error('没有主窗口')
        window.setContentSize(size.width, size.height)
      },
      { width, height: 820 }
    )
  } else {
    await page.setViewportSize({ width, height: 820 })
  }
  await expect
    .poll(() => page.evaluate(() => window.innerWidth), { timeout: 5_000 })
    .toBeLessThanOrEqual(width + 2)
  await page.waitForTimeout(200)
}

async function openEntries(page: Page): Promise<void> {
  await nav(page).getByRole('button', { name: '词条' }).click()
  await expect(page.getByRole('heading', { name: '词条', level: 1 })).toBeVisible()
}

async function openChat(page: Page): Promise<void> {
  await nav(page).getByRole('button', { name: '对话' }).click()
}

test('外壳搜索：按词条 / 文章分组，命中类型与真实片段高亮', async ({
  launch,
  userDataDirectory
}) => {
  seed(userDataDirectory)
  const { page } = await launch({ env: launchEnv() })

  await openSearch(page)
  await searchInput(page).fill('hiring')

  const entryGroup = page.getByRole('region', { name: '词条' })
  await expect(entryGroup.locator('.global-search-entry')).toHaveCount(1)
  const entryRow = entryGroup.locator('.global-search-entry')
  await expect(entryRow).toHaveAttribute('data-match', 'sentence')
  await expect(entryRow.locator('.global-search-hit-kind')).toHaveText('原句')
  await expect(entryRow.locator('.global-search-snippet')).toContainText(
    'Employers approach hiring differently.'
  )
  await expect(entryRow.locator('.global-search-snippet mark')).toHaveText('hiring')

  const articleGroup = page.getByRole('region', { name: '文章' })
  await expect(articleGroup.locator('.global-search-article')).toHaveCount(1)
  await expect(articleGroup.locator('.global-search-hit-kind')).toHaveText('正文')
  await expect(articleGroup.locator('.global-search-snippet mark')).toHaveText('hiring')

  // 主词形命中。
  await searchInput(page).fill('Context')
  await expect(page.getByRole('region', { name: '词条' }).locator('.global-search-entry')).toHaveAttribute(
    'data-match',
    'main-form'
  )
  await expect(
    page.getByRole('region', { name: '词条' }).locator('.global-search-hit-kind')
  ).toHaveText('主词形')

  // 学习内容命中：类型与片段都来自真实笔记；文章组明确为空。
  await searchInput(page).fill('途径')
  const noteRow = page.getByRole('region', { name: '词条' }).locator('.global-search-entry')
  await expect(noteRow).toHaveAttribute('data-match', 'learning-note')
  await expect(noteRow.locator('.global-search-hit-kind')).toHaveText('学习内容')
  await expect(noteRow.locator('.global-search-snippet mark')).toHaveText('途径')
  await expect(page.getByRole('region', { name: '文章' })).toContainText('没有命中的文章。')

  // 清空回到提示态；无结果给明确文案。
  await searchInput(page).fill('')
  await expect(searchDialog(page)).toContainText('输入关键词')
  await searchInput(page).fill('zzzz-not-there')
  await expect(searchDialog(page)).toContainText('没有搜到「zzzz-not-there」。换个词试试。')

  // Esc 关闭后重开：输入框是空的，不残留上一次的查询与结果。
  await page.keyboard.press('Escape')
  await expect(searchDialog(page)).toHaveCount(0)
  await openSearch(page)
  await expect(searchInput(page)).toHaveValue('')
  await expect(searchDialog(page)).toContainText('输入关键词')
})

test('词条原句命中：进入词条页并定位高亮那一句', async ({ launch, userDataDirectory }) => {
  seed(userDataDirectory)
  const { page } = await launch({ env: launchEnv() })

  await openSearch(page)
  await searchInput(page).fill('hiring')
  await page.getByRole('region', { name: '词条' }).locator('.global-search-entry').click()

  await expect(page.getByRole('heading', { name: '词条', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'approach', level: 2 })).toBeVisible()
  const focused = page.locator('.entry-sentence[data-focused="true"]')
  await expect(focused).toContainText('Employers approach hiring differently.')
  await expect(focused).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('sentence=')
})

test('词条学习内容命中：自动展开学习内容并定位高亮（窄屏抽屉也可见）', async ({
  launch,
  userDataDirectory
}) => {
  seed(userDataDirectory)
  const { page, electronApp } = await launch({ env: launchEnv() })
  await resizeTo(page, electronApp, 1000)

  // 底页先打开一个词条：关闭搜索后它仍是被选中的那一个。
  await openEntries(page)
  await page.locator('.entries-row').filter({ hasText: 'approach' }).click()
  await expect(page.getByRole('heading', { name: 'approach', level: 2 })).toBeVisible()
  await expect(page.locator('.entries-page')).toHaveAttribute('data-layout', 'drawer')

  await openSearch(page)
  await searchInput(page).fill('途径')
  await page.getByRole('region', { name: '词条' }).locator('.global-search-entry').click()

  await expect(page.getByRole('heading', { name: '词条', level: 1 })).toBeVisible()
  await expect(page.locator('.entries-rail-open')).toBeVisible()
  const focusedNote = page.locator('.entry-note[data-focused="true"]')
  await expect(focusedNote).toContainText('做法、途径')
  await expect(focusedNote).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.location.hash)).toContain('note=')
  // 窄屏是覆盖抽屉：有遮罩、是 modal dialog，内容仍看得见。
  await expect(page.locator('.entries-rail-open')).toHaveAttribute('role', 'dialog')
  await expect(
    page.getByRole('region', { name: '词条内容' }).getByRole('heading', { name: 'approach', level: 2 })
  ).toBeVisible()
})

test('文章正文命中：普通未收集句也能进入真实阅读、滚到并高亮，返回真的回到搜索结果', async ({
  launch,
  userDataDirectory
}) => {
  seed(userDataDirectory)
  const { page } = await launch({ env: launchEnv() })

  const originHash = await page.evaluate(() => window.location.hash || '#/home')
  await openSearch(page)
  await searchInput(page).fill('zebra')

  const articleGroup = page.getByRole('region', { name: '文章' })
  await expect(articleGroup.locator('.global-search-article')).toHaveCount(1)
  await expect(articleGroup.locator('.global-search-hit-kind')).toHaveText('正文')
  await expect(articleGroup.locator('.global-search-snippet mark')).toHaveText('zebra')
  await articleGroup.locator('.global-search-article').click()

  // 真实阅读页：标题、正文、命中句高亮都在；这一句从未被收集过。
  await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '2026年6月 · 第1套 · 仔细阅读 Passage One', level: 1 })
  ).toBeVisible()
  const focused = page.locator('.reading-sentence-focused')
  await expect(focused).toHaveText('A zebra never appears in the corpus.')
  await expect(focused).toBeInViewport()
  await expect(page.locator('.reading-context')).toContainText('来自搜索「zebra」')
  await expect(page.getByRole('button', { name: '返回搜索结果' })).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toContain('from=search')

  // 返回「搜索结果」不是假标签：回到搜索前的页面，并重新打开同一批结果。
  await page.getByRole('button', { name: '返回搜索结果' }).click()
  await expect(searchDialog(page)).toBeVisible()
  await expect(searchInput(page)).toHaveValue('zebra')
  await expect(page.getByRole('region', { name: '文章' }).locator('.global-search-article')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(originHash)
  await page.keyboard.press('Escape')
  await expect(searchDialog(page)).toHaveCount(0)
})

test('文章篇名命中：进入文章本身，不伪造正文句定位', async ({ launch, userDataDirectory }) => {
  seed(userDataDirectory)
  const { page } = await launch({ env: launchEnv() })

  await openSearch(page)
  await searchInput(page).fill('Passage')
  const articleGroup = page.getByRole('region', { name: '文章' })
  await expect(articleGroup.locator('.global-search-article')).toHaveCount(1)
  await expect(articleGroup.locator('.global-search-hit-kind')).toHaveText('篇名')
  await expect(articleGroup.locator('.global-search-snippet mark')).toHaveText('Passage')

  await articleGroup.locator('.global-search-article').click()
  await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '2026年6月 · 第1套 · 仔细阅读 Passage One', level: 1 })
  ).toBeVisible()
  await expect(page.locator('.reading-sentence-focused')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '返回搜索结果' })).toBeVisible()
})

test('AI 生成文章端到端：本地生成 → 存为文章 → 搜正文独有词 → 文章组 → 阅读高亮正确句', async ({
  launch,
  userDataDirectory
}) => {
  seed(userDataDirectory)
  const stub = await createStub({ kind: 'stream', text: [AI_BODY], firstChunkDelayMs: 200 })
  const { page } = await launch({ env: launchEnv(stub) })

  // 真实用户路径：词条页多选 → 生成文章指令 → 发送 → 等回答完成 → 存为文章。
  await openEntries(page)
  await page.getByRole('checkbox', { name: '选择词条：approach' }).check()
  await page.getByRole('checkbox', { name: '选择词条：Context' }).check()
  await page.getByRole('button', { name: '用这些词学习' }).click()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  const instructions = page.getByRole('region', { name: '学习指令' })
  await instructions.getByRole('button', { name: '选用指令' }).click()
  await instructions.getByRole('button', { name: '示例：生成文章' }).click()
  await page.getByRole('textbox', { name: '输入问题' }).fill('用这两个词写一篇短文。')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('The luminous lantern marks this line.')).toBeVisible()
  await page.locator('.assistant-actions').getByRole('button', { name: '存为文章' }).click()
  await expect(page.getByText(/已存为文章「/)).toBeVisible()

  const originHash = await page.evaluate(() => window.location.hash)
  await openSearch(page)
  await searchInput(page).fill('luminous')

  const articleGroup = page.getByRole('region', { name: '文章' })
  await expect(articleGroup.locator('.global-search-article')).toHaveCount(1)
  const aiRow = articleGroup.locator('.global-search-article')
  await expect(aiRow).toHaveAttribute('data-source', 'ai')
  await expect(aiRow).toContainText('AI 生成')
  await expect(aiRow.locator('.global-search-hit-kind')).toHaveText('正文')
  await expect(aiRow.locator('.global-search-snippet mark')).toHaveText('luminous')
  // 正文独有词不属于任何词条。
  await expect(page.getByRole('region', { name: '词条' })).toContainText('没有命中的词条。')

  await aiRow.click()
  await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
  await expect(page.locator('.reading-paragraph')).toHaveCount(2)
  const focused = page.locator('.reading-sentence-focused')
  await expect(focused).toHaveText('The luminous lantern marks this line.')
  await expect(focused).toBeInViewport()
  await expect(page.locator('.reading-context')).toContainText('来自搜索「luminous」')

  // 回到搜索结果：同一查询、同一批结果，底页回到生成文章时所在的线程。
  await page.getByRole('button', { name: '返回搜索结果' }).click()
  await expect(searchDialog(page)).toBeVisible()
  await expect(searchInput(page)).toHaveValue('luminous')
  await expect(articleGroup.locator('.global-search-article')).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(originHash)
  await page.keyboard.press('Escape')
  await expect(searchDialog(page)).toHaveCount(0)
  await expect(page.getByText('The luminous lantern marks this line.')).toBeVisible()
})

test('Esc 与点外部关闭：词条的选中、草稿、搜索与排序、滚动都不丢，焦点还回入口', async ({
  launch,
  userDataDirectory
}) => {
  seed(userDataDirectory)
  const { page } = await launch({ env: launchEnv() })

  await openEntries(page)
  await page.getByRole('button', { name: '字母', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜词条名、原句或学习内容' }).fill('approach')
  await page.locator('.entries-row').filter({ hasText: 'approach' }).click()
  await expect(
    page.getByRole('region', { name: '词条内容' }).getByRole('heading', { name: 'approach', level: 2 })
  ).toBeVisible()
  await page.getByRole('button', { name: '展开学习内容' }).click()
  const rail = page.locator('.entries-rail-open')
  await expect(rail).toBeVisible()
  await rail.getByRole('textbox', { name: '写学习内容' }).fill('草稿：还没保存的笔记')
  await expect(page.getByRole('button', { name: '字母', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  const hashBefore = await page.evaluate(() => window.location.hash)
  const scrollBefore = await page.evaluate(() => document.querySelector('main')?.scrollTop ?? 0)

  // 点外部关闭：点在遮罩上，不动底页。
  await openSearch(page)
  await searchInput(page).fill('hiring')
  await expect(page.getByRole('region', { name: '词条' }).locator('.global-search-entry')).toHaveCount(1)
  await page.mouse.click(8, 400)
  await expect(searchDialog(page)).toHaveCount(0)

  expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore)
  await expect(
    page.getByRole('region', { name: '词条内容' }).getByRole('heading', { name: 'approach', level: 2 })
  ).toBeVisible()
  await expect(rail.getByRole('textbox', { name: '写学习内容' })).toHaveValue('草稿：还没保存的笔记')
  await expect(page.getByRole('searchbox', { name: '搜词条名、原句或学习内容' })).toHaveValue('approach')
  await expect(page.getByRole('button', { name: '字母', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(await page.evaluate(() => document.querySelector('main')?.scrollTop ?? 0)).toBe(scrollBefore)
  // 焦点回到打开搜索的按钮，而不是把页面滚回顶部。
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''))
    .toBe('全局搜索')

  // Esc 关闭同样不动底页，也不触发任何导航。
  await openSearch(page)
  await searchInput(page).fill('hiring')
  await page.keyboard.press('Escape')
  await expect(searchDialog(page)).toHaveCount(0)
  expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore)
  await expect(
    page.getByRole('region', { name: '词条内容' }).getByRole('heading', { name: 'approach', level: 2 })
  ).toBeVisible()
  await expect(rail.getByRole('textbox', { name: '写学习内容' })).toHaveValue('草稿：还没保存的笔记')
  expect(await page.evaluate(() => document.querySelector('main')?.scrollTop ?? 0)).toBe(scrollBefore)
})

test('阅读页 Esc：只关搜索，不退出阅读、不改变滚动位置', async ({ launch, userDataDirectory }) => {
  seed(userDataDirectory)
  const { page } = await launch({ env: launchEnv() })
  await openArticle(page, '2026年6月 · 第1套 · 仔细阅读 Passage One')
  await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('.reading-scroll')
    if (scroll) scroll.scrollTop = 260
  })
  const scrollBefore = await page.evaluate(
    () => document.querySelector<HTMLElement>('.reading-scroll')?.scrollTop ?? 0
  )
  const hashBefore = await page.evaluate(() => window.location.hash)

  await openSearch(page)
  await searchInput(page).fill('hiring')
  await page.keyboard.press('Escape')

  await expect(searchDialog(page)).toHaveCount(0)
  await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore)
  expect(
    await page.evaluate(() => document.querySelector<HTMLElement>('.reading-scroll')?.scrollTop ?? 0)
  ).toBe(scrollBefore)

  // 点外部关闭同样留在阅读页。
  await openSearch(page)
  await searchInput(page).fill('hiring')
  await page.mouse.click(6, 300)
  await expect(searchDialog(page)).toHaveCount(0)
  await expect(page.locator('[data-reading-page="true"]')).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore)
  expect(
    await page.evaluate(() => document.querySelector<HTMLElement>('.reading-scroll')?.scrollTop ?? 0)
  ).toBe(scrollBefore)
})

test('对话页 Esc：只关搜索，不停止生成、不丢未发送草稿', async ({ launch }) => {
  const stub = await createStub({ kind: 'hang', text: ['Half an answer starts here.'] })
  const { page } = await launch({ env: launchEnv(stub) })
  await openChat(page)
  await page.getByRole('textbox', { name: '输入问题' }).fill('写一段话。')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('Half an answer starts here.')).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()

  await openSearch(page)
  await searchInput(page).fill('anything')
  await page.keyboard.press('Escape')
  await expect(searchDialog(page)).toHaveCount(0)
  // Esc 没有冒泡到对话页：生成仍在继续。
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
  await expect(page.getByText('Half an answer starts here.')).toBeVisible()

  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByText('已停止 · 未完成')).toBeVisible()

  // 未发送草稿：开关搜索不影响输入框内容。
  const input = page.getByRole('textbox', { name: '输入问题' })
  await input.fill('还没发出去的草稿')
  await openSearch(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: '输入问题' })).toHaveValue('还没发出去的草稿')
})

test('加载中、无结果、出错都有明确文案，重试可用', async ({
  launch,
  userDataDirectory
}) => {
  seed(userDataDirectory)
  const { page, electronApp: app } = await launch({ env: launchEnv() })
  if (app === null) throw new Error('需要开发版 Electron 进程')

  // 慢一点的实现：先看到加载文案，再看到无结果文案。
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('search:global')
    ipcMain.handle('search:global', async (_event, payload: { query: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return { query: payload.query, entries: [], articles: [] }
    })
  })
  await openSearch(page)
  await searchInput(page).fill('slow')
  await expect(searchDialog(page)).toContainText('正在搜索…')
  await expect(searchDialog(page)).toContainText('没有搜到「slow」。换个词试试。')

  // 实现报错：给一句人话 + 重试。
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('search:global')
    ipcMain.handle('search:global', () => {
      throw new Error('stub search failure')
    })
  })
  await searchInput(page).fill('boom')
  await expect(searchDialog(page).getByRole('alert')).toContainText('搜索没有完成，再试一次。')
  await expect(searchDialog(page).getByRole('button', { name: '重试' })).toBeVisible()

  // 重试发的是同一个查询。
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('search:global')
    ipcMain.handle('search:global', (_event, payload: { query: string }) => ({
      query: payload.query,
      entries: [],
      articles: []
    }))
  })
  await searchDialog(page).getByRole('button', { name: '重试' }).click()
  await expect(searchDialog(page)).toContainText('没有搜到「boom」。换个词试试。')
})

test('焦点与输入法：Tab 不跑出覆盖层，组合态的 Esc 不关闭搜索', async ({
  launch,
  userDataDirectory
}) => {
  seed(userDataDirectory)
  const { page } = await launch({ env: launchEnv() })

  await openSearch(page)
  await searchInput(page).fill('hiring')
  await expect(page.getByRole('region', { name: '词条' }).locator('.global-search-entry')).toHaveCount(1)

  // 从输入框往前 Tab 到关闭按钮，再 Tab 一圈仍留在覆盖层里。
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab')
    expect(
      await page.evaluate(() =>
        Boolean(document.querySelector('.global-search')?.contains(document.activeElement))
      )
    ).toBe(true)
  }

  // 输入法组合态里的 Esc 交给输入法，不关闭搜索。
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('.global-search-input')
    input?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        isComposing: true,
        bubbles: true,
        cancelable: true
      })
    )
  })
  await expect(searchDialog(page)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(searchDialog(page)).toHaveCount(0)
})
