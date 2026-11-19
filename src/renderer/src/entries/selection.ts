import { GROUP_WORD_LIMIT } from '../../../shared/threads'

/**
 * 词条列表的多选只活在这一页:选择按稳定的词条 id 记，不写进浏览状态仓。
 * 取消选择、离开页面（组件卸载）即清空；筛选与排序不会改动已选 id。
 */
export type EntrySelectionToggle = {
  ids: readonly string[]
  /** 已选满时第 21 个不能进入选择，界面据此给一句明确提示。 */
  blocked: boolean
}

export function toggleEntrySelection(
  ids: readonly string[],
  entryId: string,
  limit: number = GROUP_WORD_LIMIT
): EntrySelectionToggle {
  if (ids.includes(entryId)) {
    return { ids: ids.filter((id) => id !== entryId), blocked: false }
  }
  if (ids.length >= limit) {
    return { ids, blocked: true }
  }
  return { ids: [...ids, entryId], blocked: false }
}

/** 「已选 3 个词」；选满时明说已满，避免以为是界面没反应。 */
export function selectionCountText(
  count: number,
  limit: number = GROUP_WORD_LIMIT
): string {
  return count >= limit ? `已选 ${count} 个词 · 已满` : `已选 ${count} 个词`
}

/** 第 21 个被拦下时的提示；与上限共用同一个数。 */
export function selectionBlockedText(limit: number = GROUP_WORD_LIMIT): string {
  return `最多选 ${limit} 个词，先取消一个再选。`
}
