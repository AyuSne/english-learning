import { describe, expect, it } from 'vitest'
import {
  ENTRY_COLUMN_GAP,
  ENTRY_INLINE_MIN_WIDTH,
  ENTRY_LIST_WIDTH,
  ENTRY_MAIN_MIN_WIDTH,
  ENTRY_RAIL_WIDTH,
  entryLayoutForWidth
} from './layout'

describe('entryLayoutForWidth', () => {
  it('栏宽预算把全局栏与页面留白之外的容器宽度算全', () => {
    expect(ENTRY_INLINE_MIN_WIDTH).toBe(
      ENTRY_LIST_WIDTH + ENTRY_MAIN_MIN_WIDTH + ENTRY_RAIL_WIDTH + ENTRY_COLUMN_GAP * 2
    )
    expect(ENTRY_INLINE_MIN_WIDTH).toBe(1028)
  })

  it('差 1px 不够三栏就不内联，正好够才内联', () => {
    expect(entryLayoutForWidth(ENTRY_INLINE_MIN_WIDTH - 1)).toBe('drawer')
    expect(entryLayoutForWidth(ENTRY_INLINE_MIN_WIDTH)).toBe('inline')
  })

  it('1101 / 1200 / 1280 窗口扣掉全局栏与页面留白后仍是抽屉，1440 才内联', () => {
    const available = (windowWidth: number): number => windowWidth - 238 - 64
    expect(entryLayoutForWidth(available(1101))).toBe('drawer')
    expect(entryLayoutForWidth(available(1200))).toBe('drawer')
    expect(entryLayoutForWidth(available(1280))).toBe('drawer')
    expect(entryLayoutForWidth(available(1440))).toBe('inline')
  })
})
