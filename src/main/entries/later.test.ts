import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CollectSelectionRequest } from '../../shared/entries'
import {
  fixtureArticle,
  writeCorpusDirectory,
  type FixtureEntry
} from '../../testing/corpus-fixture'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { readHomeSummary } from '../library/queries'
import { readLaterEntries, setEntryLater } from './later'
import { collectSelection, deleteEntrySentence, readEntrySummary } from './queries'

/**
 * 「稍后看」是按词条的一条独立标记：只记标记时间，不进已收集、不看原句数、
 * 学习内容或收集时间；标记一个不存在的词条不会顺手建词条，词条被删时标记级联消失。
 */

const T0 = '2026-11-18T08:00:00.000Z'
const T1 = '2026-11-18T08:05:00.000Z'
const T2 = '2026-11-18T08:10:00.000Z'
const T3 = '2026-11-18T08:15:00.000Z'
const T4 = '2026-11-18T08:20:00.000Z'

const article = fixtureArticle({
  id: 'fixture-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  sentences: [
    ['Employers approach hiring differently.', 'Context keeps the skill alive.'],
    ['A steady habit keeps the reading going.']
  ]
})

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

function paragraphAt(entry: FixtureEntry, index: number): JsonParagraph {
  const paragraph = (entry.json.paragraphs as JsonParagraph[])[index]
  if (!paragraph) {
    throw new Error(`语料 ${entry.id} 没有第 ${index} 段`)
  }
  return paragraph
}

function selection(
  entry: FixtureEntry,
  paragraphIndex: number,
  needle: string
): CollectSelectionRequest {
  const paragraph = paragraphAt(entry, paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) {
    throw new Error(`语料 ${entry.id} 第 ${paragraphIndex} 段没有 ${needle}`)
  }
  const sentenceOrdinal = paragraph.sentences.findIndex(
    (candidate) => candidate.start <= start && start < candidate.end
  )
  return {
    articleId: entry.id,
    paragraphId: paragraph.id,
    sentenceOrdinal,
    start,
    end: start + needle.length
  }
}

function collect(paragraphIndex: number, needle: string, now: string): string {
  const result = collectSelection(database, selection(article, paragraphIndex, needle), { now })
  if (result.status === 'rejected') {
    throw new Error(`收 ${needle} 被拒绝：${result.reason}`)
  }
  return result.entry.id
}

function insertBareEntry(id: string, mainForm: string): void {
  database
    .prepare(
      `INSERT INTO word_entry (id, main_form, normalized_key, created_at, last_collected_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, mainForm, mainForm.toLowerCase(), T0, T0)
}

function laterRows(): number {
  return (database.prepare('SELECT COUNT(*) AS count FROM entry_later').get() as {
    count: number
  }).count
}

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-later-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [article])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('setEntryLater', () => {
  it('标记已有词条：只写一条带标记时间的记录，词条页与首页都能读到', () => {
    const approachId = collect(0, 'approach', T0)
    const contextId = collect(0, 'Context', T1)

    expect(setEntryLater(database, { entryId: approachId, later: true }, { now: T2 })).toEqual({
      status: 'marked',
      markedAt: T2
    })

    expect(readEntrySummary(database, approachId)?.laterMarkedAt).toBe(T2)
    expect(readEntrySummary(database, contextId)?.laterMarkedAt).toBeNull()
    expect(readLaterEntries(database)).toEqual([
      { entryId: approachId, mainForm: 'approach', markedAt: T2 }
    ])
    expect(readHomeSummary(database).laterEntries).toEqual([
      { entryId: approachId, mainForm: 'approach', markedAt: T2 }
    ])

    // 不进「最近收集」：排序与收集时间都不受标记影响。
    expect(readHomeSummary(database).recentEntries.map((entry) => entry.mainForm)).toEqual([
      'Context',
      'approach'
    ])
    expect(readEntrySummary(database, approachId)?.lastCollectedAt).toBe(T0)
  })

  it('取消标记后状态回到未标记，首页也不再显示', () => {
    const approachId = collect(0, 'approach', T0)
    setEntryLater(database, { entryId: approachId, later: true }, { now: T2 })

    expect(setEntryLater(database, { entryId: approachId, later: false })).toEqual({
      status: 'unmarked'
    })

    expect(readEntrySummary(database, approachId)?.laterMarkedAt).toBeNull()
    expect(readLaterEntries(database)).toEqual([])
    expect(readHomeSummary(database).laterEntries).toEqual([])
  })

  it('词条不存在时只报 missing，不会为标记新建词条', () => {
    expect(
      setEntryLater(database, { entryId: 'missing-entry', later: true }, { now: T2 })
    ).toEqual({ status: 'missing' })

    expect(database.prepare('SELECT COUNT(*) AS count FROM word_entry').get()).toEqual({
      count: 0
    })
    expect(laterRows()).toBe(0)
  })

  it('重复标记同一个词条只留一条，标记时间保持第一次', () => {
    const approachId = collect(0, 'approach', T0)
    setEntryLater(database, { entryId: approachId, later: true }, { now: T2 })

    expect(
      setEntryLater(database, { entryId: approachId, later: true }, { now: T3 })
    ).toEqual({ status: 'marked', markedAt: T2 })
    expect(laterRows()).toBe(1)
    expect(readLaterEntries(database).map((entry) => entry.markedAt)).toEqual([T2])
  })

  it('没有原句的词条也能标记：稍后看不看收集时间、原句数与学习内容', () => {
    insertBareEntry('entry-bare', 'lament')

    expect(
      setEntryLater(database, { entryId: 'entry-bare', later: true }, { now: T2 })
    ).toEqual({ status: 'marked', markedAt: T2 })

    const summary = readHomeSummary(database)
    expect(summary.laterEntries).toEqual([
      { entryId: 'entry-bare', mainForm: 'lament', markedAt: T2 }
    ])
    // 没有收集过原句，就不会出现在「最近收集」里。
    expect(summary.recentEntries).toEqual([])
  })

  it('按标记时间倒序返回，最近标的排前面', () => {
    const approachId = collect(0, 'approach', T0)
    const contextId = collect(0, 'Context', T1)
    insertBareEntry('entry-bare', 'lament')

    setEntryLater(database, { entryId: approachId, later: true }, { now: T2 })
    setEntryLater(database, { entryId: contextId, later: true }, { now: T3 })
    setEntryLater(database, { entryId: 'entry-bare', later: true }, { now: T4 })

    expect(readLaterEntries(database).map((entry) => entry.mainForm)).toEqual([
      'lament',
      'Context',
      'approach'
    ])
  })

  it('删掉词条时标记随外键级联消失', () => {
    insertBareEntry('entry-bare', 'lament')
    setEntryLater(database, { entryId: 'entry-bare', later: true }, { now: T2 })

    database.prepare('DELETE FROM word_entry WHERE id = ?').run('entry-bare')

    expect(laterRows()).toBe(0)
    expect(readLaterEntries(database)).toEqual([])
  })

  it('删掉最后一条原句时词条与稍后看标记一起消失', () => {
    const approachId = collect(0, 'approach', T0)
    setEntryLater(database, { entryId: approachId, later: true }, { now: T2 })
    const stored = database
      .prepare('SELECT id FROM entry_sentence WHERE entry_id = ?')
      .get(approachId) as { id: string }

    const result = deleteEntrySentence(database, stored.id)

    expect(result).toMatchObject({ status: 'deleted', entryDeleted: true })
    expect(laterRows()).toBe(0)
    expect(readLaterEntries(database)).toEqual([])
  })
})
