import type { AppDatabase } from '../db/database'

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
