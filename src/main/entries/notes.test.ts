import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtureArticle, writeCorpusDirectory, type FixtureEntry } from '../../testing/corpus-fixture'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { readEntryList, readEntryPage } from './page'
import {
  createLearningNote,
  deleteLearningNote,
  moveLearningNote,
  pinLearningNote,
  updateLearningNote
} from './notes'
import { collectSelection } from './queries'

const T0 = '2026-11-18T08:00:00.000Z'
const T1 = '2026-11-18T08:05:00.000Z'
const T2 = '2026-11-18T08:10:00.000Z'

const article = fixtureArticle({
  id: 'fixture-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  sentences: [
    ['Employers approach hiring differently.', 'Approaching a new desk takes patience.'],
    ['Context keeps the skill alive.', 'Repeated words stick.']
  ]
})

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

function paragraphAt(entry: FixtureEntry, index: number): JsonParagraph {
  return (entry.json.paragraphs as JsonParagraph[])[index] as JsonParagraph
}

function collect(
  database: AppDatabase,
  paragraphIndex: number,
  needle: string,
  now: string = T0
) {
  const paragraph = paragraphAt(article, paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) {
    throw new Error(`第 ${paragraphIndex} 段没有 ${needle}`)
  }
  const sentenceIndex = paragraph.sentences.findIndex(
    (candidate) => candidate.start <= start && start < candidate.end
  )
  const result = collectSelection(
    database,
    {
      articleId: article.id,
      paragraphId: paragraph.id,
      sentenceOrdinal: sentenceIndex,
      start,
      end: start + needle.length
    },
    { now }
  )
  if (result.status === 'rejected') {
    throw new Error(`collect ${needle} rejected: ${result.reason}`)
  }
  return result
}

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-notes-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [article])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

function entryIds() {
  const approach = collect(database, 0, 'approach', T0)
  const context = collect(database, 1, 'Context', T1)
  return { approachId: approach.entry.id, contextId: context.entry.id }
}

describe('createLearningNote', () => {
  it('写一条学习内容，词条计数与词条页马上看得到', () => {
    const { approachId } = entryIds()

    const result = createLearningNote(database, { entryId: approachId, body: '  记：approach 是「做法」。  ' }, { now: T2 })

    expect(result.status).toBe('saved')
    if (result.status !== 'saved') return
    expect(result.note).toMatchObject({
      entryId: approachId,
      body: '记：approach 是「做法」。',
      pinned: false,
      source: 'manual',
      sourcePinId: null,
      createdAt: T2,
      updatedAt: T2
    })

    const page = readEntryPage(database, approachId)
    expect(page?.notes.map((note) => note.body)).toEqual(['记：approach 是「做法」。'])
    expect(page?.entry.noteCount).toBe(1)
  })

  it('空白内容不保存，词条不存在时说清楚', () => {
    const { approachId } = entryIds()

    expect(createLearningNote(database, { entryId: approachId, body: ' \n ' })).toEqual({
      status: 'rejected',
      reason: 'empty'
    })
    expect(createLearningNote(database, { entryId: 'nope', body: 'x' })).toEqual({
      status: 'rejected',
      reason: 'entry'
    })
  })
})

describe('updateLearningNote', () => {
  it('改正文只留最终稿，创建时间不动', () => {
    const { approachId } = entryIds()
    const created = createLearningNote(database, { entryId: approachId, body: '旧稿' }, { now: T0 })
    if (created.status !== 'saved') throw new Error('没写进去')

    const updated = updateLearningNote(
      database,
      { noteId: created.note.id, body: '新稿' },
      { now: T2 }
    )

    expect(updated.status).toBe('saved')
    if (updated.status !== 'saved') return
    expect(updated.note).toMatchObject({ body: '新稿', createdAt: T0, updatedAt: T2 })
    const page = readEntryPage(database, approachId)
    expect(page?.notes.map((note) => note.body)).toEqual(['新稿'])
    expect(page?.entry.noteCount).toBe(1)
  })

  it('空白内容、找不到的学习内容都拒绝', () => {
    const { approachId } = entryIds()
    const created = createLearningNote(database, { entryId: approachId, body: '旧稿' })
    if (created.status !== 'saved') throw new Error('没写进去')

    expect(
      updateLearningNote(database, { noteId: created.note.id, body: '   ' })
    ).toEqual({ status: 'rejected', reason: 'empty' })
    expect(updateLearningNote(database, { noteId: 'nope', body: 'x' })).toEqual({
      status: 'missing'
    })
  })
})

describe('pinLearningNote', () => {
  it('一个词条只置顶一条，置顶的排在最前', () => {
    const { approachId } = entryIds()
    const first = createLearningNote(database, { entryId: approachId, body: '第一条' }, { now: T0 })
    const second = createLearningNote(database, { entryId: approachId, body: '第二条' }, { now: T1 })
    if (first.status !== 'saved' || second.status !== 'saved') throw new Error('没写进去')

    const pinned = pinLearningNote(
      database,
      { noteId: first.note.id, pinned: true },
      { now: T2 }
    )

    expect(pinned.status).toBe('saved')
    if (pinned.status !== 'saved') return
    expect(pinned.note.pinned).toBe(true)
    expect(readEntryPage(database, approachId)?.notes.map((note) => note.body)).toEqual([
      '第一条',
      '第二条'
    ])

    pinLearningNote(database, { noteId: second.note.id, pinned: true }, { now: T2 })
    const page = readEntryPage(database, approachId)
    expect(page?.notes.map((note) => [note.body, note.pinned])).toEqual([
      ['第二条', true],
      ['第一条', false]
    ])

    pinLearningNote(database, { noteId: second.note.id, pinned: false })
    expect(readEntryPage(database, approachId)?.notes.map((note) => note.pinned)).toEqual([
      false,
      false
    ])
  })

  it('置顶不存在的内容返回 missing', () => {
    expect(pinLearningNote(database, { noteId: 'nope', pinned: true })).toEqual({
      status: 'missing'
    })
  })
})

describe('deleteLearningNote', () => {
  it('删掉后计数与列表都更新', () => {
    const { approachId } = entryIds()
    const created = createLearningNote(database, { entryId: approachId, body: '要删的' })
    if (created.status !== 'saved') throw new Error('没写进去')

    expect(deleteLearningNote(database, { noteId: created.note.id })).toEqual({
      status: 'deleted'
    })
    expect(readEntryPage(database, approachId)).toMatchObject({
      entry: { noteCount: 0 },
      notes: []
    })
    expect(deleteLearningNote(database, { noteId: created.note.id })).toEqual({
      status: 'missing'
    })
  })
})

describe('moveLearningNote', () => {
  it('把学习内容移到另一个词条，两边计数都对', () => {
    const { approachId, contextId } = entryIds()
    const created = createLearningNote(database, { entryId: approachId, body: '跟着走' }, { now: T0 })
    if (created.status !== 'saved') throw new Error('没写进去')

    const moved = moveLearningNote(
      database,
      { noteId: created.note.id, entryId: contextId },
      { now: T2 }
    )

    expect(moved.status).toBe('saved')
    if (moved.status !== 'saved') return
    expect(moved.note).toMatchObject({ entryId: contextId, createdAt: T0, updatedAt: T2 })
    expect(readEntryPage(database, approachId)).toMatchObject({
      entry: { noteCount: 0 },
      notes: []
    })
    expect(readEntryPage(database, contextId)).toMatchObject({
      entry: { noteCount: 1 },
      notes: [{ body: '跟着走' }]
    })
  })

  it('置顶的移到已有置顶内容的词条时改为不置顶', () => {
    const { approachId, contextId } = entryIds()
    const moveable = createLearningNote(database, { entryId: approachId, body: '带置顶走' }, { now: T0 })
    if (moveable.status !== 'saved') throw new Error('没写进去')
    pinLearningNote(database, { noteId: moveable.note.id, pinned: true })
    const resident = createLearningNote(database, { entryId: contextId, body: '本来置顶' }, { now: T1 })
    if (resident.status !== 'saved') throw new Error('没写进去')
    pinLearningNote(database, { noteId: resident.note.id, pinned: true })

    const moved = moveLearningNote(database, {
      noteId: moveable.note.id,
      entryId: contextId
    })

    expect(moved.status).toBe('saved')
    if (moved.status !== 'saved') return
    expect(moved.note.pinned).toBe(false)
    expect(readEntryPage(database, contextId)?.notes.map((note) => [note.body, note.pinned])).toEqual([
      ['本来置顶', true],
      ['带置顶走', false]
    ])
  })

  it('移到同一个词条、目标不存在或学习内容不存在都拒绝', () => {
    const { approachId } = entryIds()
    const created = createLearningNote(database, { entryId: approachId, body: 'x' })
    if (created.status !== 'saved') throw new Error('没写进去')

    expect(
      moveLearningNote(database, { noteId: created.note.id, entryId: approachId })
    ).toEqual({ status: 'rejected', reason: 'same-entry' })
    expect(
      moveLearningNote(database, { noteId: created.note.id, entryId: 'nope' })
    ).toEqual({ status: 'rejected', reason: 'entry' })
    expect(moveLearningNote(database, { noteId: 'nope', entryId: approachId })).toEqual({
      status: 'missing'
    })
  })
})

describe('列表里的学习内容', () => {
  it('筛选按有/无学习内容分开，总数不受筛选影响', () => {
    const { approachId } = entryIds()
    createLearningNote(database, { entryId: approachId, body: '近义词辨析：method' })

    expect(readEntryList(database, { filter: 'has-notes' }).entries.map((e) => e.mainForm)).toEqual([
      'approach'
    ])
    expect(readEntryList(database, { filter: 'no-notes' }).entries.map((e) => e.mainForm)).toEqual([
      'Context'
    ])
    expect(readEntryList(database, { filter: 'has-notes' }).total).toBe(2)
  })
})
