import type { AppDatabase } from '../db/database'

export function entryExists(database: AppDatabase, entryId: string): boolean {
  return database.prepare('SELECT 1 FROM word_entry WHERE id = ?').get(entryId) !== undefined
}

export function hasPinnedNote(database: AppDatabase, entryId: string): boolean {
  return (
    database
      .prepare('SELECT 1 FROM learning_note WHERE entry_id = ? AND pinned = 1')
      .get(entryId) !== undefined
  )
}

/** 按还剩下的原句重算「最近收集」；一条不剩时保持原值，等词条被删。 */
export function refreshLastCollected(database: AppDatabase, entryId: string): void {
  const latest = database
    .prepare('SELECT MAX(collected_at) AS latest FROM entry_sentence WHERE entry_id = ?')
    .get(entryId) as { latest: string | null }
  if (latest.latest !== null) {
    database
      .prepare('UPDATE word_entry SET last_collected_at = ? WHERE id = ?')
      .run(latest.latest, entryId)
  }
}
