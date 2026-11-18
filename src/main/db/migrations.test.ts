import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from './database'
import {
  LATEST_SCHEMA_VERSION,
  SchemaTooNewError,
  migrate,
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
})
