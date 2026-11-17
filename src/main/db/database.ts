import Database from 'better-sqlite3'

export type AppDatabase = Database.Database

/**
 * 打开本机资料库。schema 迁移由 `migrate` 单独执行，打开动作不碰既有数据。
 */
export function openDatabase(file: string): AppDatabase {
  const database = new Database(file)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  return database
}
