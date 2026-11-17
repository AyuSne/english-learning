import Database from 'better-sqlite3'
import { join } from 'node:path'

/**
 * 应用把本机资料库写进 userData 目录，文件名与主进程里的常量一致。
 */
export function databasePath(userDataDirectory: string): string {
  return join(userDataDirectory, 'english-learning.db')
}

export function readSchemaVersion(databaseFile: string): number {
  const database = new Database(databaseFile, { readonly: true, fileMustExist: true })
  try {
    return database.pragma('user_version', { simple: true }) as number
  } finally {
    database.close()
  }
}

/**
 * 直接写一条 setting，用于在两次启动之间留下可以观察的状态。
 */
export function writeSetting(databaseFile: string, key: string, value: string): void {
  const database = new Database(databaseFile)
  try {
    database
      .prepare(
        `INSERT INTO setting (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
      )
      .run(key, value)
  } finally {
    database.close()
  }
}
