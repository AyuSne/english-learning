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
  },
  {
    version: 2,
    up: (database) => {
      // 文章、段落、句子与原文注释是阅读、选词与出处的共同底座：
      // 句子持久化段内字符区间，原文注释按词挂在段落内的字符区间上。
      database.exec(`
        CREATE TABLE article (
          id                TEXT PRIMARY KEY,
          title             TEXT NOT NULL,
          kind              TEXT NOT NULL,
          kind_label        TEXT NOT NULL,
          session_key       TEXT NOT NULL,
          session_label     TEXT NOT NULL,
          set_label         TEXT NOT NULL,
          exam_year         INTEGER NOT NULL,
          exam_month        INTEGER NOT NULL,
          exam_set          INTEGER NOT NULL,
          word_count        INTEGER NOT NULL,
          body_text         TEXT NOT NULL,
          source_pdf        TEXT NOT NULL,
          source_sha256     TEXT NOT NULL,
          page_start        INTEGER,
          page_end          INTEGER,
          ordinal           INTEGER NOT NULL,
          last_opened_at    TEXT,
          last_paragraph_id TEXT,
          last_sentence_index INTEGER,
          created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX article_session ON article (session_key, ordinal);

        CREATE TABLE paragraph (
          article_id TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
          id         TEXT NOT NULL,
          ordinal    INTEGER NOT NULL,
          text       TEXT NOT NULL,
          page_start INTEGER,
          page_end   INTEGER,
          PRIMARY KEY (article_id, id)
        );

        CREATE TABLE sentence (
          article_id   TEXT NOT NULL,
          paragraph_id TEXT NOT NULL,
          ordinal      INTEGER NOT NULL,
          text         TEXT NOT NULL,
          char_start   INTEGER NOT NULL,
          char_end     INTEGER NOT NULL,
          page         INTEGER,
          PRIMARY KEY (article_id, paragraph_id, ordinal),
          FOREIGN KEY (article_id, paragraph_id)
            REFERENCES paragraph(article_id, id) ON DELETE CASCADE
        );

        CREATE TABLE annotation (
          article_id       TEXT NOT NULL,
          paragraph_id     TEXT NOT NULL,
          sentence_ordinal INTEGER NOT NULL,
          ordinal          INTEGER NOT NULL,
          surface          TEXT NOT NULL,
          gloss            TEXT NOT NULL,
          char_start       INTEGER NOT NULL,
          char_end         INTEGER NOT NULL,
          PRIMARY KEY (article_id, paragraph_id, char_start),
          FOREIGN KEY (article_id, paragraph_id)
            REFERENCES paragraph(article_id, id) ON DELETE CASCADE
        );
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
