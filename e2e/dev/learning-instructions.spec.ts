import Database from 'better-sqlite3'
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/app'
import { databasePath } from '../fixtures/database'
import { LEARNING_INSTRUCTION_EXAMPLES } from '../../src/shared/learning-instructions'

async function openChat(page: Page): Promise<void> {
  // 重启后会恢复上次的地址，所以不假定一定从首页开始。
  await page
    .getByRole('navigation', { name: '全局导航' })
    .getByRole('button', { name: '对话' })
    .click()
  await expect(page.getByRole('heading', { name: '新的学习' })).toBeVisible()
}

async function openInstructions(page: Page) {
  const region = page.getByRole('region', { name: '学习指令' })
  await region.getByRole('button', { name: '选用指令' }).click()
  await expect(region.getByRole('group', { name: '内置示例（只读）' })).toBeVisible()
  return region
}

test('六条内置示例可一键追加、只读，草稿切页后仍在', async ({ launch }) => {
  const { page } = await launch()
  await openChat(page)
  const region = await openInstructions(page)
  const input = page.getByRole('textbox', { name: '输入问题' })

  for (const example of LEARNING_INSTRUCTION_EXAMPLES) {
    await expect(
      region.getByRole('button', { name: `示例：${example.name}`, exact: true })
    ).toBeVisible()
  }

  // 草稿里已经有字时，选用示例只能追加，不能覆盖。
  await input.fill('先解释这个词')
  await region.getByRole('button', { name: '示例：例句' }).click()
  await expect(input).toHaveValue('先解释这个词\n\n' + LEARNING_INSTRUCTION_EXAMPLES[1].body)

  // 连续选用第二条示例，前两条内容都还在。
  await region.getByRole('button', { name: '示例：助记' }).click()
  await expect(input).toHaveValue(
    '先解释这个词\n\n' +
      LEARNING_INSTRUCTION_EXAMPLES[1].body +
      '\n\n' +
      LEARNING_INSTRUCTION_EXAMPLES[3].body
  )

  // 示例本身不可改：没有编辑 / 删除示例的动作，也没有把示例存成用户记录的列表项。
  await expect(region.locator('[data-instruction-id]')).toHaveCount(0)
  await expect(region.getByRole('button', { name: /^编辑指令：/ })).toHaveCount(0)
  await expect(region.getByRole('button', { name: /^删除指令：/ })).toHaveCount(0)

  // 追加后还能接着手改，也没有被自动发出去（仍停在空白学习）。
  await input.fill('先解释这个词\n\n继续手改')
  await expect(input).toHaveValue('先解释这个词\n\n继续手改')
  await expect(page.getByRole('heading', { name: '新的学习' })).toBeVisible()

  // 切页保留不接受破坏：草稿与追加的内容都还在。
  await input.fill('切页保留的草稿')
  await region.getByRole('button', { name: '示例：多义词' }).click()
  const nav = page.getByRole('navigation', { name: '全局导航' })
  await nav.getByRole('button', { name: '词条' }).click()
  await nav.getByRole('button', { name: '对话' }).click()
  await expect(page.getByRole('textbox', { name: '输入问题' })).toHaveValue(
    '切页保留的草稿\n\n' + LEARNING_INSTRUCTION_EXAMPLES[4].body
  )
})

test('保存当前输入、改正文与重命名、复制，删除需要确认', async ({ launch }) => {
  const { page } = await launch()
  await openChat(page)
  const region = await openInstructions(page)
  const input = page.getByRole('textbox', { name: '输入问题' })

  // 输入为空时不能存成指令。
  await expect(region.getByRole('button', { name: '存为指令' })).toBeDisabled()

  await input.fill('先按我的问法解释')
  await region.getByRole('button', { name: '存为指令' }).click()
  const saveForm = region.getByRole('form', { name: '保存学习指令' })
  await saveForm.getByRole('textbox', { name: '指令名称' }).fill('我的语境问法')
  await saveForm.getByRole('button', { name: '保存', exact: true }).click()

  await expect(region.getByRole('status')).toContainText('已保存「我的语境问法」')
  const savedRow = region.locator('.instruction-row').filter({ hasText: '我的语境问法' })
  await expect(savedRow).toBeVisible()
  await expect(savedRow).toContainText(/更新于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  // 保存不清空输入框。
  await expect(input).toHaveValue('先按我的问法解释')

  // 正文可改、名称可改。
  await region.getByRole('button', { name: '编辑指令：我的语境问法' }).click()
  const editForm = region.getByRole('form', { name: '编辑学习指令：我的语境问法' })
  await editForm.getByRole('textbox', { name: '指令名称' }).fill('我的新问法')
  await editForm.getByRole('textbox', { name: '指令正文' }).fill('改过的正文：先解释语境义')
  await editForm.getByRole('button', { name: '保存', exact: true }).click()

  await expect(region.getByRole('status')).toContainText('已更新「我的新问法」')
  await expect(region.locator('.instruction-row').filter({ hasText: '我的新问法' })).toBeVisible()
  await expect(region.locator('.instruction-row').filter({ hasText: '我的语境问法' })).toHaveCount(0)

  // 选用自己保存的指令同样是追加，不覆盖草稿，也不自动发送。
  await region.getByRole('button', { name: '选用指令：我的新问法' }).click()
  await expect(input).toHaveValue('先按我的问法解释\n\n改过的正文：先解释语境义')
  await expect(page.getByRole('heading', { name: '新的学习' })).toBeVisible()

  // 复制出独立的一条，列表里两条都在。
  await region.getByRole('button', { name: '复制指令：我的新问法' }).click()
  await expect(region.getByRole('status')).toContainText('已复制「我的新问法（副本）」')
  await expect(region.locator('.instruction-row')).toHaveCount(2)
  await expect(
    region.getByRole('button', { name: '选用指令：我的新问法（副本）' })
  ).toBeVisible()

  // 删除先确认；取消后不删，确认后才真删。
  await region.getByRole('button', { name: '删除指令：我的新问法（副本）' }).click()
  const dialog = region.getByRole('dialog', { name: '删除学习指令' })
  await expect(dialog).toContainText('确定删除「我的新问法（副本）」？删除后不能恢复。')
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(region.locator('.instruction-row')).toHaveCount(2)

  await region.getByRole('button', { name: '删除指令：我的新问法（副本）' }).click()
  await region.getByRole('dialog', { name: '删除学习指令' })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await expect(region.getByRole('status')).toContainText('已删除「我的新问法（副本）」')
  await expect(region.locator('.instruction-row')).toHaveCount(1)
  await expect(region.getByRole('button', { name: '选用指令：我的新问法' })).toBeVisible()
})

test('重启后自定义指令仍在，内置示例不会写成用户记录', async ({
  launch,
  userDataDirectory
}) => {
  const first = await launch()
  await openChat(first.page)
  const region = await openInstructions(first.page)
  const input = first.page.getByRole('textbox', { name: '输入问题' })

  await input.fill('重启后还要用的正文')
  await region.getByRole('button', { name: '存为指令' }).click()
  await region
    .getByRole('form', { name: '保存学习指令' })
    .getByRole('textbox', { name: '指令名称' })
    .fill('重启检查')
  await region
    .getByRole('form', { name: '保存学习指令' })
    .getByRole('button', { name: '保存', exact: true })
    .click()
  await expect(region.getByRole('status')).toContainText('已保存「重启检查」')
  await expect(region.locator('.instruction-row')).toHaveCount(1)

  await first.close()

  // 库里只有用户保存的这一条，六条示例没有混进用户记录。
  const database = new Database(databasePath(userDataDirectory), {
    readonly: true,
    fileMustExist: true
  })
  try {
    expect(database.prepare('SELECT name FROM learning_instruction').all()).toEqual([
      { name: '重启检查' }
    ])
  } finally {
    database.close()
  }

  const second = await launch({ userDataDirectory })
  await openChat(second.page)
  const reopened = await openInstructions(second.page)
  await expect(reopened.locator('.instruction-row')).toHaveCount(1)
  await expect(
    reopened.getByRole('button', { name: '选用指令：重启检查' })
  ).toBeVisible()

  await second.page.getByRole('textbox', { name: '输入问题' }).fill('重启后的草稿')
  await reopened.getByRole('button', { name: '选用指令：重启检查' }).click()
  await expect(second.page.getByRole('textbox', { name: '输入问题' })).toHaveValue(
    '重启后的草稿\n\n重启后还要用的正文'
  )
})
