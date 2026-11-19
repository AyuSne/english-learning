import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from './database'
import {
  LATEST_SCHEMA_VERSION,
  SchemaTooNewError,
  migrate,
  migrations,
  readSchemaVersion,
  type Migration
} from './migrations'

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-db-'))
  database = openDatabase(join(directory, 'test.db'))
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('migrate', () => {
  it('空库首启迁移到最新 schema 版本', () => {
    const outcome = migrate(database)

    expect(outcome.from).toBe(0)
    expect(outcome.to).toBe(LATEST_SCHEMA_VERSION)
    expect(readSchemaVersion(database)).toBe(LATEST_SCHEMA_VERSION)
  })

  it('已是最新版本时不再执行迁移', () => {
    let runs = 0
    const plan: readonly Migration[] = [
      {
        version: 1,
        up: () => {
          runs += 1
        }
      }
    ]

    const first = migrate(database, { migrations: plan })
    const second = migrate(database, { migrations: plan })

    expect(first.applied).toEqual([1])
    expect(second.applied).toEqual([])
    expect(runs).toBe(1)
  })

  it('按版本顺序执行待应用的迁移', () => {
    const executed: number[] = []
    const plan: readonly Migration[] = [
      { version: 1, up: () => executed.push(1) },
      { version: 2, up: () => executed.push(2) }
    ]

    const outcome = migrate(database, { migrations: plan })

    expect(executed).toEqual([1, 2])
    expect(outcome.applied).toEqual([1, 2])
    expect(readSchemaVersion(database)).toBe(2)
  })

  it('迁移失败时整体回滚，版本不前进', () => {
    const plan: readonly Migration[] = [
      {
        version: 1,
        up: (target) => target.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY)')
      },
      {
        version: 2,
        up: () => {
          throw new Error('boom')
        }
      }
    ]

    expect(() => migrate(database, { migrations: plan })).toThrow('boom')
    expect(readSchemaVersion(database)).toBe(0)
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'probe'").get()
    ).toBeUndefined()
  })

  it('拒绝版本高于本程序的数据库', () => {
    database.pragma('user_version = 99')

    expect(() => migrate(database)).toThrow(SchemaTooNewError)
    expect(readSchemaVersion(database)).toBe(99)
  })

  it('迁移出学习内容表：同一个词条只能置顶一条', () => {
    migrate(database)

    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'learning_note'")
      .get()
    expect(table).toBeDefined()

    const insert = database.prepare(
      `INSERT INTO word_entry (id, main_form, normalized_key, created_at, last_collected_at)
       VALUES ('entry-1', 'approach', 'approach', '2026-11-18T08:00:00.000Z', '2026-11-18T08:00:00.000Z')`
    )
    insert.run()
    const insertNote = database.prepare(
      `INSERT INTO learning_note (id, entry_id, body, pinned, created_at, updated_at)
       VALUES (?, 'entry-1', '写法', ?, '2026-11-18T08:00:00.000Z', '2026-11-18T08:00:00.000Z')`
    )
    insertNote.run('note-1', 1)

    expect(() => insertNote.run('note-2', 1)).toThrow(/UNIQUE/)
    expect(() => insertNote.run('note-3', 0)).not.toThrow()
  })

  it('把旧库的 article.position 换成 ordinal，已导入的文章一条不丢', () => {
    // 先造一份真正停在 8 版的旧库：只跑 1–8 的迁移，不能先升到最新再倒回版本号，
    // 否则 9 / 10 的建表与改列会在已经升级过的 schema 上再跑一次。
    migrate(database, {
      migrations: migrations.filter((migration) => migration.version <= 8)
    })
    // 还原早期构建留下的库：列名是 position，但 user_version 已经走到 8。
    database.exec('ALTER TABLE article RENAME COLUMN ordinal TO position')
    database.pragma('user_version = 8')
    database
      .prepare(
        `INSERT INTO article (
           id, title, kind, kind_label, session_key, session_label, set_label,
           exam_year, exam_month, exam_set, word_count, body_text, source_pdf,
           source_sha256, page_start, page_end, position
         ) VALUES (
           'cet6-2023-06-s1-b', '2023年6月 · 第1套 · 长篇匹配', 'long_match', '长篇匹配',
           '2023-06', '2023年6月', '第1套', 2023, 6, 1, 3, 'Body text.', 'a.pdf',
           'sha', 1, 2, 7
         )`
      )
      .run()

    const outcome = migrate(database)

    expect(outcome.applied).toEqual([9, 10])
    const columns = (database.pragma('table_info(article)') as { name: string }[]).map(
      (column) => column.name
    )
    expect(columns).toContain('ordinal')
    expect(columns).not.toContain('position')
    expect(
      database.prepare('SELECT id, ordinal FROM article').get()
    ).toEqual({ id: 'cet6-2023-06-s1-b', ordinal: 7 })
  })

  it('把停在 9 版的旧库升到 10：新建稍后看表，原有词条照常可读', () => {
    // 版本 10 只加一张独立的「稍后看」表；老库升级后标记从空开始，旧数据不动。
    migrate(database, {
      migrations: migrations.filter((migration) => migration.version <= 9)
    })
    database
      .prepare(
        `INSERT INTO word_entry (id, main_form, normalized_key, created_at, last_collected_at)
         VALUES ('entry-old', 'approach', 'approach', '2026-11-18T08:00:00.000Z', '2026-11-18T08:00:00.000Z')`
      )
      .run()
    expect(readSchemaVersion(database)).toBe(9)
    expect(
      database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entry_later'")
        .get()
    ).toBeUndefined()

    const outcome = migrate(database)

    expect(outcome.applied).toEqual([10])
    expect(readSchemaVersion(database)).toBe(10)
    // 新表默认是空的；旧的词条一条不丢。
    expect(database.prepare('SELECT COUNT(*) AS count FROM entry_later').get()).toEqual({
      count: 0
    })
    expect(database.prepare('SELECT id, main_form FROM word_entry').get()).toEqual({
      id: 'entry-old',
      main_form: 'approach'
    })
  })
})
