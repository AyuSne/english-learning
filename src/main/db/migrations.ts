import type { AppDatabase } from './database'

export type Migration = {
  version: number
  up: (database: AppDatabase) => void
}

/**
 * 显式版本号迁移：版本只增不减，启动时只在落后时执行，不在加载旧数据时原地改写。
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    up: (database) => {
      database.exec(`
        CREATE TABLE setting (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
    }
  }
]

function latestVersion(plan: readonly Migration[]): number {
  return plan.reduce((latest, migration) => Math.max(latest, migration.version), 0)
}

export const LATEST_SCHEMA_VERSION = latestVersion(migrations)

export type MigrationOutcome = {
  from: number
  to: number
  applied: readonly number[]
}

export class SchemaTooNewError extends Error {
  readonly databaseVersion: number
  readonly supportedVersion: number

  constructor(databaseVersion: number, supportedVersion: number) {
    super(
      `本机资料库的 schema 版本是 ${databaseVersion}，高于本程序支持的 ${supportedVersion}`
    )
    this.name = 'SchemaTooNewError'
    this.databaseVersion = databaseVersion
    this.supportedVersion = supportedVersion
  }
}

export function readSchemaVersion(database: AppDatabase): number {
  return database.pragma('user_version', { simple: true }) as number
}

/**
 * 把所有待应用的迁移放在一笔事务里：任何一步失败都整体回滚，版本不前进。
 */
export function migrate(
  database: AppDatabase,
  options: { migrations?: readonly Migration[] } = {}
): MigrationOutcome {
  const plan = options.migrations ?? migrations
  const from = readSchemaVersion(database)
  const supportedVersion = latestVersion(plan)

  if (from > supportedVersion) {
    throw new SchemaTooNewError(from, supportedVersion)
  }

  const pending = plan.filter((migration) => migration.version > from)
  if (pending.length === 0) {
    return { from, to: from, applied: [] }
  }

  const applyPending = database.transaction(() => {
    for (const migration of pending) {
      migration.up(database)
      database.pragma(`user_version = ${migration.version}`)
    }
  })
  applyPending()

  return {
    from,
    to: pending[pending.length - 1].version,
    applied: pending.map((migration) => migration.version)
  }
}
