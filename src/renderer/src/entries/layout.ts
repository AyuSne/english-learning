/**
 * 词条页三栏的宽度预算。右栏内联还是改为覆盖抽屉只看真实可用容器宽度：
 * 左列表 240、中栏至少能读 420、右栏 320，再加上两处 24 的栏间距。
 * 全局导航 238 与页面左右 32 已经在「容器宽度」里扣掉了，所以这里不再写窗口断点。
 */
export const ENTRY_LIST_WIDTH = 240
export const ENTRY_MAIN_MIN_WIDTH = 420
export const ENTRY_RAIL_WIDTH = 320
export const ENTRY_COLUMN_GAP = 24

export type EntryLayout = 'inline' | 'drawer'

/** 容器宽到 1028 才够三栏同时张开；差一点都不内联。 */
export const ENTRY_INLINE_MIN_WIDTH =
  ENTRY_LIST_WIDTH + ENTRY_MAIN_MIN_WIDTH + ENTRY_RAIL_WIDTH + ENTRY_COLUMN_GAP * 2

export function entryLayoutForWidth(availableWidth: number): EntryLayout {
  return availableWidth >= ENTRY_INLINE_MIN_WIDTH ? 'inline' : 'drawer'
}
