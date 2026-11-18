import { existsSync } from 'node:fs'
import { expect, test } from '../fixtures/app'
import { callUnknownChannel, readBootstrap, readBridgeSurface } from '../fixtures/bridge'
import { databasePath, readSchemaVersion, writeSetting } from '../fixtures/database'

const NAV_LABELS = ['首页', '阅读', '词条', '对话', '文章库', '设置']

test.describe('应用骨架', () => {
  test('首次启动显示全局栏六项与「先读一篇」空态', async ({ launch }) => {
    const { page } = await launch()

    const navigation = page.getByRole('navigation', { name: '全局导航' })
    await expect(navigation).toBeVisible()
    await expect(navigation.getByRole('button')).toHaveText(NAV_LABELS)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await expect(page.getByRole('heading', { name: '先读一篇' })).toBeVisible()
    await expect(page.getByRole('button', { name: '从文章库挑一篇' })).toBeVisible()
    await expect(page.getByRole('button', { name: '用一组词生成' })).toBeVisible()
    await expect(
      page.getByText('还没有词条。读的时候圈一个词，它就会出现在这里。')
    ).toBeVisible()
    await expect(
      page.getByText('空着。看到不想现在查的词，标一下会收到这里。')
    ).toBeVisible()
  })

  test('渲染层只经 bridge 访问主进程，未知 channel 立即报错', async ({ launch }) => {
    const { page } = await launch()
    await expect(page.getByRole('heading', { name: '先读一篇' })).toBeVisible()

    expect(await readBridgeSurface(page)).toEqual({
      hasInvoke: true,
      hasRequire: false,
      hasIpcRenderer: false
    })

    const bootstrap = await readBootstrap(page)
    expect(bootstrap.schemaVersion).toBe(2)
    expect(bootstrap.isPackaged).toBe(false)
    expect(bootstrap.theme).toBe('light')
    expect(bootstrap.appVersion).not.toBe('')
    expect(bootstrap.corpusImport).toMatchObject({ total: 63, imported: 63, failed: [] })

    expect(await callUnknownChannel(page)).toContain('Unknown IPC channel')
  })

  test('首启建库写入 schema 版本，二次启动不重复迁移', async ({ launch, userDataDirectory }) => {
    const first = await launch()
    await expect(first.page.getByRole('heading', { name: '先读一篇' })).toBeVisible()
    await first.close()

    const file = databasePath(userDataDirectory)
    expect(existsSync(file)).toBe(true)
    expect(readSchemaVersion(file)).toBe(2)

    // 在两次启动之间改掉主题：若第二次启动重建或重跑迁移，这个值会消失。
    writeSetting(file, 'theme', 'dark')

    const second = await launch()
    await expect(second.page.getByRole('heading', { name: '先读一篇' })).toBeVisible()
    await expect(second.page.locator('html')).toHaveAttribute('data-theme', 'dark')

    const bootstrap = await readBootstrap(second.page)
    expect(bootstrap.theme).toBe('dark')
    expect(bootstrap.schemaVersion).toBe(2)

    await second.close()
    expect(readSchemaVersion(file)).toBe(2)
  })
})
