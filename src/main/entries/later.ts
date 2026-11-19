import type { SetEntryLaterRequest, SetEntryLaterResult } from '../../shared/entries'
import type { HomeLaterEntry } from '../../shared/library'
import type { AppDatabase } from '../db/database'
import { entryExists } from './entry-state'

/**
 * 稍后看：按词条一条独立标记，只存标记时间。
 * 它不算进已收集，也不读收集时间、原句数或学习内容；标记一个不存在的词条
 * 只会得到 missing，绝不会为标记新建词条。词条删除时标记随外键级联消失。
 */

export function setEntryLater(
  database: AppDatabase,
  request: SetEntryLaterRequest,
  options: { now?: string } = {}
): SetEntryLaterResult {
  if (!entryExists(database, request.entryId)) {
    return { status: 'missing' }
  }

  if (!request.later) {
    database.prepare('DELETE FROM entry_later WHERE entry_id = ?').run(request.entryId)
    return { status: 'unmarked' }
  }

  const now = options.now ?? new Date().toISOString()
  // 已经标过就不改第一次的时间：状态是「已加入」，不是一次新的收集。
  database
    .prepare('INSERT OR IGNORE INTO entry_later (entry_id, marked_at) VALUES (?, ?)')
    .run(request.entryId, now)
  const stored = database
    .prepare('SELECT marked_at FROM entry_later WHERE entry_id = ?')
    .get(request.entryId) as { marked_at: string }
  return { status: 'marked', markedAt: stored.marked_at }
}

/** 首页单列：按标记时间倒序，只带词条名与标记时间。 */
export function readLaterEntries(database: AppDatabase): HomeLaterEntry[] {
  const rows = database
    .prepare(
      `SELECT el.entry_id, we.main_form, el.marked_at
         FROM entry_later el
         JOIN word_entry we ON we.id = el.entry_id
        ORDER BY el.marked_at DESC, el.entry_id DESC`
    )
    .all() as { entry_id: string; main_form: string; marked_at: string }[]

  return rows.map((row) => ({
    entryId: row.entry_id,
    mainForm: row.main_form,
    markedAt: row.marked_at
  }))
}
