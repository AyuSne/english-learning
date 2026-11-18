import type { Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtureArticle, writeCorpusDirectory } from '../../src/testing/corpus-fixture'
import {
  startSseStub,
  unusedBaseUrl,
  type SseStub,
  type StubScript
} from '../../src/testing/sse-stub'
import { expect, test } from '../fixtures/app'

const stubs: SseStub[] = []

test.afterEach(async () => {
  await Promise.all(stubs.splice(0).map((stub) => stub.close()))
})

async function createStub(script: StubScript): Promise<SseStub> {
  const stub = await startSseStub(script)
  stubs.push(stub)
  return stub
}

/** 空的 env 密钥把开发态 .env 挡住：这些用例从「还没配置」开始。 */
const noEnvironmentConfig = { DEEPSEEK_API_KEY: '' }

function settingsNav(page: Page) {
  return page.getByRole('complementary', { name: '设置分区' })
}

async function openSettings(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '设置' })
    .click()
  await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()
}

async function addProfile(
  page: Page,
  input: { name: string; baseUrl: string; model: string; apiKey: string }
): Promise<void> {
  await page.getByRole('button', { name: '新增一套' }).click()
  await page.getByLabel('名称').fill(input.name)
  await page.getByLabel('接口地址').fill(input.baseUrl)
  await page.getByLabel('模型名').fill(input.model)
  await page.getByLabel('API 密钥').fill(input.apiKey)
  await page.getByRole('button', { name: '保存并校验' }).click()
}

const firstArticle = fixtureArticle({
  id: 'fixture-settings-2024-06-s1-c1',
  year: 2024,
  month: 6,
  set: 1,
  sentences: [
    ['Settings keep the global default in one place.', 'Each passage can still keep its own.'],
    ['Reading never loses the sentence it came from.']
  ]
})

const secondArticle = fixtureArticle({
  id: 'fixture-settings-2024-06-s1-c2',
  year: 2024,
  month: 6,
  set: 1,
  sentences: [
    ['A second passage follows the global default.', 'No override has been written for it yet.'],
    ['The reading column stays at six hundred and twenty pixels.']
  ]
})

let corpusDirectory: string

test.beforeAll(async () => {
  corpusDirectory = await mkdtemp(join(tmpdir(), 'english-learning-settings-corpus-'))
  writeCorpusDirectory(corpusDirectory, [firstArticle, secondArticle])
})

test.afterAll(async () => {
  await rm(corpusDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

test.describe('设置与密钥', () => {
  test('多套模型配置：校验通过才落库，被拒保留原样，切换、编辑、删除都生效', async ({
    launch
  }) => {
    const accepted = await createStub({ kind: 'status', status: 200 })
    const denied = await createStub({ kind: 'status', status: 401 })
    const { page } = await launch({ env: noEnvironmentConfig })
    await openSettings(page)

    // 空状态与五个分区。
    await expect(
      settingsNav(page).getByRole('button', { name: '模型服务' })
    ).toBeVisible()
    await expect(
      settingsNav(page).getByRole('button', { name: '阅读' })
    ).toBeVisible()
    await expect(
      settingsNav(page).getByRole('button', { name: '外观' })
    ).toBeVisible()
    await expect(
      settingsNav(page).getByRole('button', { name: '数据' })
    ).toBeVisible()
    await expect(
      settingsNav(page).getByRole('button', { name: '关于' })
    ).toBeVisible()
    await expect(page.getByText('还没有配置。新增一套之后就能开始对话。')).toBeVisible()

    await addProfile(page, {
      name: 'DeepSeek 官方',
      baseUrl: accepted.baseUrl,
      model: 'deepseek-flash',
      apiKey: 'sk-e2e-0001'
    })

    const firstCard = page.locator('.profile-card').filter({ hasText: 'DeepSeek 官方' })
    await expect(firstCard).toContainText('使用中')
    await expect(firstCard).toContainText('已验证')
    await expect(firstCard).toContainText('sk-·············0001')
    await expect(firstCard).not.toContainText('sk-e2e-0001')
    await expect(firstCard.locator('.profile-check')).toContainText('通过')

    // 校验请求带上了这套配置的地址、模型与密钥，且是一次最小请求。
    expect(accepted.requests[0]?.body).toMatchObject({
      model: 'deepseek-flash',
      stream: false,
      max_tokens: 1
    })
    expect(accepted.requests[0]?.headers.authorization).toBe('Bearer sk-e2e-0001')

    // 密钥被服务端拒绝：错误显示在表单里，库里那份配置原样保留。
    await addProfile(page, {
      name: '坏密钥',
      baseUrl: denied.baseUrl,
      model: 'deepseek-flash',
      apiKey: 'sk-wrong-key'
    })
    await expect(page.getByRole('alert')).toContainText('密钥无效，没有保存。')
    await expect(page.locator('.profile-card')).toHaveCount(1)
    await expect(firstCard).toContainText('DeepSeek 官方')
    expect(denied.requests[0]?.headers.authorization).toBe('Bearer sk-wrong-key')
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByLabel('名称')).toHaveCount(0)

    // 第二套保存成功，但不抢走使用中的位置。
    await addProfile(page, {
      name: '备用',
      baseUrl: accepted.baseUrl,
      model: 'deepseek-v4-pro',
      apiKey: 'sk-e2e-0002'
    })
    const backupCard = page.locator('.profile-card').filter({ hasText: '备用' })
    await expect(page.locator('.profile-card')).toHaveCount(2)
    await expect(backupCard).not.toContainText('使用中')
    await expect(firstCard).toContainText('使用中')

    await page.getByRole('button', { name: '切换到 备用' }).click()
    await expect(page.getByRole('status')).toContainText('已切换，下一次调用起生效')
    await expect(backupCard).toContainText('使用中')
    await expect(firstCard).not.toContainText('使用中')

    // 编辑已有配置：密钥只显示掩码，不点「重新输入」就没有密钥输入框。
    await page.getByRole('button', { name: '编辑 备用' }).click()
    await expect(page.getByLabel('API 密钥')).toHaveCount(0)
    await expect(page.locator('.key-mask-row code')).toHaveText('sk-·············0002')
    await page.getByLabel('名称').fill('备用配置')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('已保存')
    const renamedCard = page.locator('.profile-card').filter({ hasText: '备用配置' })
    await expect(renamedCard).toContainText('已验证')
    await expect(renamedCard).toContainText('使用中')

    // 删除当前使用中的那套后没有别的配置顶上来；要接着用就显式切回去。
    await page.getByRole('button', { name: '删除 备用配置' }).click()
    await expect(page.getByRole('alert')).toContainText('删除「备用配置」？')
    await page.getByRole('button', { name: '确认删除' }).click()
    await expect(page.locator('.profile-card')).toHaveCount(1)
    await expect(firstCard).not.toContainText('使用中')
    await page.getByRole('button', { name: '切换到 DeepSeek 官方' }).click()
    await expect(firstCard).toContainText('使用中')
  })

  test('断网时存成未验证，下一次成功调用后自动转已验证', async ({ launch }) => {
    const stream = await createStub({ kind: 'stream', text: ['答'] })
    const offlineBaseUrl = await unusedBaseUrl()
    const { page } = await launch({ env: noEnvironmentConfig })
    await openSettings(page)

    await addProfile(page, {
      name: '离线配置',
      baseUrl: offlineBaseUrl,
      model: 'deepseek-flash',
      apiKey: 'sk-offline-0003'
    })

    const card = page.locator('.profile-card').filter({ hasText: '离线配置' })
    await expect(page.getByRole('status')).toContainText('已保存')
    await expect(card).toContainText('未验证')
    await expect(card.locator('.profile-check')).toContainText('未能完成')

    // 改成能连上的地址；不重输密钥就不重新校验，状态仍是未验证。
    await page.getByRole('button', { name: '编辑 离线配置' }).click()
    await page.getByLabel('接口地址').fill(stream.baseUrl)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(card).toContainText('未验证')

    // 真发一次调用，成功后主进程自动把配置标成已验证。
    await page
      .getByRole('navigation', { name: '全局导航' })
      .getByRole('button', { name: '对话' })
      .click()
    await expect(page.getByRole('heading', { name: '新的学习' })).toBeVisible()
    await page.getByRole('textbox', { name: '输入问题' }).fill('给我一个例句')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('答', { exact: true })).toBeVisible()

    await openSettings(page)
    await expect(
      page.locator('.profile-card').filter({ hasText: '离线配置' })
    ).toContainText('已验证')
    await expect(
      page.locator('.profile-card').filter({ hasText: '离线配置' }).locator('.profile-check')
    ).toContainText('通过')
  })

  test('主题浅色 / 深色 / 跟随系统立即生效，刷新后仍是选过的那档', async ({ launch }) => {
    const { page } = await launch({ env: noEnvironmentConfig })
    await openSettings(page)
    await settingsNav(page).getByRole('button', { name: '外观' }).click()

    const theme = page.getByRole('group', { name: '主题' })
    await expect(theme.getByRole('button', { name: '浅色' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await theme.getByRole('button', { name: '深色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('status')).toContainText('已切换到深色')

    // 刷新后 bootstrap 从本机库读回深色。
    await page.reload()
    await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await settingsNav(page).getByRole('button', { name: '外观' }).click()
    await theme.getByRole('button', { name: '跟随系统' }).click()
    await expect(theme.getByRole('button', { name: '跟随系统' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const systemTheme = await page.evaluate(() =>
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    )
    await expect(page.locator('html')).toHaveAttribute('data-theme', systemTheme)

    await theme.getByRole('button', { name: '浅色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('设置页改的是全局默认，单篇覆盖不被覆盖', async ({ launch }) => {
    const { page } = await launch({
      env: { ...noEnvironmentConfig, CORPUS_DIRECTORY: corpusDirectory }
    })

    async function openArticle(index: number): Promise<void> {
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

    async function leaveReading(): Promise<void> {
      // 阅读设置面板开着时，第一次 Esc 只关面板；没开时按一次就退回文章库。
      const panel = page.getByRole('region', { name: '阅读设置' })
      if (await panel.isVisible()) {
        await page.keyboard.press('Escape')
        await expect(panel).toBeHidden()
      }
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { name: '文章库', level: 1 })).toBeVisible()
    }

    // 第一篇：在阅读页面板里改成本篇覆盖值 22。
    await openArticle(0)
    await page.getByRole('button', { name: '阅读设置' }).click()
    await page.getByRole('group', { name: '字号' }).getByRole('button', { name: '22' }).click()
    await expect(page.locator('.reading-paragraph').first()).toHaveCSS('font-size', '22px')
    await leaveReading()

    // 设置页把全局默认改成 16。
    await openSettings(page)
    await settingsNav(page).getByRole('button', { name: '阅读' }).click()
    await page.getByRole('group', { name: '默认字号' }).getByRole('button', { name: '16' }).click()
    await expect(page.getByRole('status')).toContainText('已保存为全局默认')
    await expect(page.locator('.settings-summary')).toHaveText(
      '当前全局默认 · 字号 16 · 行距 1.8 · 注释显示 · 弱高亮开'
    )

    // 有本篇覆盖的第一篇仍是 22。
    await openArticle(0)
    await expect(page.locator('.reading-paragraph').first()).toHaveCSS('font-size', '22px')
    await leaveReading()

    // 没单独调过的第二篇跟着全局默认走 16。
    await openArticle(1)
    await expect(page.locator('.reading-paragraph').first()).toHaveCSS('font-size', '16px')
  })
})
