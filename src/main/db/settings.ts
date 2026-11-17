import type { Theme } from '../../shared/types'
import type { AppDatabase } from './database'

export function readSetting(database: AppDatabase, key: string): string | null {
  const row = database.prepare('SELECT value FROM setting WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function writeSetting(database: AppDatabase, key: string, value: string): void {
  database
    .prepare(
      `INSERT INTO setting (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value)
}

export function readTheme(database: AppDatabase): Theme {
  return readSetting(database, 'theme') === 'dark' ? 'dark' : 'light'
}
