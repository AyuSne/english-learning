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
    // 否则后面的迁移会在已经升级过的 schema 上再跑一次。
    migrate(database, {
      migrations: migrations.filter((migration) => migration.version <= 8)
    })
    // 还原早期构建留下的库：列名是 position，但 user_version 已经走到 8。
    database.exec('ALTER TABLE article RENAME COLUMN ordinal TO position')
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

    expect(outcome.from).toBe(8)
    // 后缀按实际排在 position→ordinal 之后的迁移逐条写出来，不靠「迁到最新」一句带过：
    // 10 是稍后看表，11 是完成时间列，12 是学习指令表。
    expect(outcome.applied).toEqual([9, 10, 11, 12])
    const columns = (database.pragma('table_info(article)') as { name: string }[]).map(
      (column) => column.name
    )
    expect(columns).toContain('ordinal')
    expect(columns).not.toContain('position')
    expect(columns).toContain('completed_at')
    // 旧记录原样保留，新列默认 NULL 而不是随便补一个「已读完」。
    expect(database.prepare('SELECT id, ordinal, completed_at FROM article').get()).toEqual({
      id: 'cet6-2023-06-s1-b',
      ordinal: 7,
      completed_at: null
    })
    // 已经迁到最新的库不会再跑一遍；不重置 user_version 去看迁移副作用。
    expect(migrate(database).applied).toEqual([])
    expect(readSchemaVersion(database)).toBe(LATEST_SCHEMA_VERSION)
  })

  it('完成时间只增列：旧库已有的阅读位置与设置原样保留', () => {
    // 先迁到 v9（既没有稍后看表、也没有完成时间列的一版），写入一篇读过的文章。
    migrate(database, { migrations: migrations.filter((migration) => migration.version <= 9) })
    database
      .prepare(
        `INSERT INTO article (
           id, title, kind, kind_label, session_key, session_label, set_label,
           exam_year, exam_month, exam_set, word_count, body_text, source_pdf,
           source_sha256, ordinal
         ) VALUES ('a', 'A', 'careful_reading', '仔细阅读', '2026-06', '2026年6月', '第1套',
           2026, 6, 1, 3, 'Body.', 'a.pdf', 'sha', 1)`
      )
      .run()
    database
      .prepare(
        `UPDATE article
            SET last_opened_at = '2026-11-18T08:00:00.000Z',
                last_paragraph_id = '1',
                last_sentence_index = 0
          WHERE id = 'a'`
      )
      .run()
    database
      .prepare(
        `INSERT INTO article_reading_setting
           (article_id, font_size, line_height_tenths, annotations_visible, weak_highlight)
         VALUES ('a', 22, 20, 0, 0)`
      )
      .run()

    const outcome = migrate(database)

    expect(outcome.from).toBe(9)
    // 10 先建稍后看表，11 再给文章补完成时间，12 最后建学习指令表；三笔都只增不改。
    expect(outcome.applied).toEqual([10, 11, 12])
    // 稍后看表跟着建起来，已有的词条数据不受影响。
    expect(
      database
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entry_later'")
        .get()
    ).toBeDefined()
    expect(
      database
        .prepare(
          `SELECT last_opened_at, last_paragraph_id, last_sentence_index, completed_at
             FROM article WHERE id = 'a'`
        )
        .get()
    ).toEqual({
      last_opened_at: '2026-11-18T08:00:00.000Z',
      last_paragraph_id: '1',
      last_sentence_index: 0,
      completed_at: null
    })
    expect(
      database
        .prepare(
          `SELECT font_size, line_height_tenths, annotations_visible, weak_highlight
             FROM article_reading_setting WHERE article_id = 'a'`
        )
        .get()
    ).toEqual({ font_size: 22, line_height_tenths: 20, annotations_visible: 0, weak_highlight: 0 })
  })

  it('把停在 9 版的旧库升到最新：新建稍后看表并补完成时间列，原有词条照常可读', () => {
    // 版本 10 加一张独立的「稍后看」表，版本 11 给文章补可空的完成时间；
    // 老库升级后标记从空开始、完成时间全为 NULL，旧数据不动。
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

    expect(outcome.applied).toEqual([10, 11, 12])
    expect(readSchemaVersion(database)).toBe(LATEST_SCHEMA_VERSION)
    expect(
      (database.pragma('table_info(article)') as { name: string }[]).map((column) => column.name)
    ).toContain('completed_at')
    // 新表默认是空的；旧的词条一条不丢。
    expect(database.prepare('SELECT COUNT(*) AS count FROM entry_later').get()).toEqual({
      count: 0
    })
    expect(database.prepare('SELECT id, main_form FROM word_entry').get()).toEqual({
      id: 'entry-old',
      main_form: 'approach'
    })
  })

  it('12 版只追加学习指令表：停在 11 的旧库升级后旧数据原样保留，表从空开始', () => {
    // 学习指令是独立表，不借 setting、也不动文章 / 词条 / 线程；示例只在前端常量里。
    migrate(database, {
      migrations: migrations.filter((migration) => migration.version <= 11)
    })
    database
      .prepare(
        `INSERT INTO setting (key, value) VALUES ('reading.font-size', '22')`
      )
      .run()
    database
      .prepare(
        `INSERT INTO word_entry (id, main_form, normalized_key, created_at, last_collected_at)
         VALUES ('entry-old', 'approach', 'approach', '2026-11-18T08:00:00.000Z', '2026-11-18T08:00:00.000Z')`
      )
      .run()
    database
      .prepare(
        `INSERT INTO article (
           id, title, kind, kind_label, session_key, session_label, set_label,
           exam_year, exam_month, exam_set, word_count, body_text, source_pdf,
           source_sha256, ordinal
         ) VALUES ('a', 'A', 'careful_reading', '仔细阅读', '2026-06', '2026年6月', '第1套',
           2026, 6, 1, 3, 'Body.', 'a.pdf', 'sha', 1)`
      )
      .run()
    expect(readSchemaVersion(database)).toBe(11)
    expect(
      database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'learning_instruction'"
        )
        .get()
    ).toBeUndefined()

    const outcome = migrate(database)

    expect(outcome.from).toBe(11)
    expect(outcome.applied).toEqual([12])
    expect(readSchemaVersion(database)).toBe(12)
    expect(
      database
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'learning_instruction_updated'"
        )
        .get()
    ).toBeDefined()
    // 新表默认是空的，内置示例没有被写成用户记录。
    expect(database.prepare('SELECT COUNT(*) AS count FROM learning_instruction').get()).toEqual({
      count: 0
    })
    // 旧数据一条不丢。
    expect(database.prepare("SELECT value FROM setting WHERE key = 'reading.font-size'").get()).toEqual({
      value: '22'
    })
    expect(database.prepare('SELECT id, main_form FROM word_entry').get()).toEqual({
      id: 'entry-old',
      main_form: 'approach'
    })
    expect(database.prepare('SELECT id, ordinal FROM article').get()).toEqual({ id: 'a', ordinal: 1 })
    expect(migrate(database).applied).toEqual([])
  })
})
