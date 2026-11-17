import { expect, test } from '../fixtures/app'
import { readBootstrap } from '../fixtures/bridge'
import { databasePath, readSchemaVersion } from '../fixtures/database'

const NAV_LABELS = ['首页', '阅读', '词条', '对话', '文章库', '设置']

test('打包产物能启动并显示首页', async ({ launch }) => {
  const { page, userDataDirectory, close } = await launch({ packaged: true })

  const navigation = page.getByRole('navigation', { name: '全局导航' })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('button')).toHaveText(NAV_LABELS)
  await expect(page.getByRole('heading', { name: '先读一篇' })).toBeVisible()

  const bootstrap = await readBootstrap(page)
  expect(bootstrap.isPackaged).toBe(true)
  expect(bootstrap.schemaVersion).toBe(1)

  const contentSecurityPolicy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  expect(contentSecurityPolicy ?? '').toContain("script-src 'self';")

  await close()
  expect(readSchemaVersion(databasePath(userDataDirectory))).toBe(1)
})
