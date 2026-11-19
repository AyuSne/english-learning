import { describe, expect, it } from 'vitest'
import {
  selectionBlockedText,
  selectionCountText,
  toggleEntrySelection
} from './selection'

describe('词条多选', () => {
  it('按稳定的词条 id 记录选择顺序，再点一次取消', () => {
    const first = toggleEntrySelection([], 'entry-b')
    expect(first.blocked).toBe(false)
    expect(first.ids).toEqual(['entry-b'])

    const second = toggleEntrySelection(first.ids, 'entry-a')
    expect(second.ids).toEqual(['entry-b', 'entry-a'])

    // 列表重新排序、筛选都不会改变已选 id；这里只按 id 取消，与可见顺序无关。
    const removed = toggleEntrySelection(second.ids, 'entry-b')
    expect(removed.ids).toEqual(['entry-a'])
    expect(removed.blocked).toBe(false)
  })

  it('最多 20 个不同的词条：第 21 个不进入选择，并给出明确提示', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => `entry-${index}`)
    let selected: readonly string[] = []
    for (const id of twenty) {
      selected = toggleEntrySelection(selected, id).ids
    }
    expect(selected).toHaveLength(20)

    const blocked = toggleEntrySelection(selected, 'entry-21')
    expect(blocked.blocked).toBe(true)
    expect(blocked.ids).toEqual(twenty)
    expect(blocked.ids).toHaveLength(20)
    expect(selectionBlockedText()).toBe('最多选 20 个词，先取消一个再选。')

    // 同一个词再点一次是取消，不算第 21 个；取消后又能加新的。
    expect(toggleEntrySelection(selected, 'entry-0').blocked).toBe(false)
    const afterRemove = toggleEntrySelection(selected, 'entry-0').ids
    expect(toggleEntrySelection(afterRemove, 'entry-21')).toEqual({
      ids: [...twenty.slice(1), 'entry-21'],
      blocked: false
    })
  })

  it('选择数量文案如实说已选几个，满 20 时点明已满', () => {
    expect(selectionCountText(0)).toBe('已选 0 个词')
    expect(selectionCountText(1)).toBe('已选 1 个词')
    expect(selectionCountText(19)).toBe('已选 19 个词')
    expect(selectionCountText(20)).toBe('已选 20 个词 · 已满')
  })
})
