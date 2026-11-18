import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CollectSelectionRequest } from '../../shared/entries'
import { fixtureArticle, writeCorpusDirectory, type FixtureEntry } from '../../testing/corpus-fixture'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { createLearningNote, readLearningNotes } from './notes'
import { readEntryList, readEntryPage } from './page'
import { collectSelection, readArticleCollections } from './queries'
import {
  changeEntryMainForm,
  mergeEntries,
  moveEntrySentence,
  reselectEntrySentence
} from './curation'

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
    ['Employers approach hiring differently.', 'Approaching a new desk takes patience.'],
    ['She approached the approachable clerk.', 'Context keeps the skill alive.'],
    ['The counter stays open late.', 'Repeated words stick.']
  ]
})

const otherArticle = fixtureArticle({
  id: 'fixture-2026-06-s2-c2',
  year: 2026,
  month: 6,
  set: 2,
  label: '2026年6月 · 第2套 · 仔细阅读 Passage Two',
  sentences: [['Another passage approaches the same idea.', 'It reaches a different conclusion.']]
})

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

function paragraphAt(entry: FixtureEntry, index: number): JsonParagraph {
  return (entry.json.paragraphs as JsonParagraph[])[index] as JsonParagraph
}

function selection(
  entry: FixtureEntry,
  paragraphIndex: number,
  needle: string,
  options: { offsetStart?: number; offsetEnd?: number } = {}
): CollectSelectionRequest {
  const paragraph = paragraphAt(entry, paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) {
    throw new Error(`fixture ${entry.id}: 第 ${paragraphIndex} 段没有 ${needle}`)
  }
  const sentenceIndex = paragraph.sentences.findIndex(
    (candidate) => candidate.start <= start && start < candidate.end
  )
  if (sentenceIndex < 0) {
    throw new Error(`fixture ${entry.id}: ${needle} 不在句子里`)
  }
  return {
    articleId: entry.id,
    paragraphId: paragraph.id,
    sentenceOrdinal: sentenceIndex,
    start: start + (options.offsetStart ?? 0),
    end: start + needle.length + (options.offsetEnd ?? 0)
  }
}

function collect(
  database: AppDatabase,
  entry: FixtureEntry,
  paragraphIndex: number,
  needle: string,
  now: string,
  options: { offsetStart?: number; offsetEnd?: number } = {}
) {
  const result = collectSelection(
    database,
    selection(entry, paragraphIndex, needle, options),
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
  directory = mkdtempSync(join(tmpdir(), 'english-learning-curation-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [article, otherArticle])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

function entries() {
  const approach = collect(database, article, 0, 'approach', T0)
  const approaching = collect(database, article, 0, 'Approaching', T1)
  const context = collect(database, article, 1, 'Context', T2)
  const approachable = collect(database, article, 1, 'approachable', T3)
  return {
    approachId: approach.entry.id,
    approachingSentenceId: approaching.sentence.id,
    contextId: context.entry.id,
    contextSentenceId: context.sentence.id,
    approachableId: approachable.entry.id,
    approachableSentenceId: approachable.sentence.id
  }
}

describe('changeEntryMainForm', () => {
  it('从已收集的词形里换主词形，变体跟着换边', () => {
    const { approachId } = entries()

    const result = changeEntryMainForm(database, { entryId: approachId, mainForm: 'Approaching' })

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.entry).toMatchObject({
      mainForm: 'Approaching',
      variants: ['approach'],
      sentenceCount: 2
    })
    expect(readEntryPage(database, approachId)?.entry.mainForm).toBe('Approaching')
  })

  it('没收集过的词形、找不到的词条都拒绝', () => {
    const { approachId } = entries()

    expect(
      changeEntryMainForm(database, { entryId: approachId, mainForm: 'approachable' })
    ).toEqual({ status: 'rejected', reason: 'unknown-form' })
    expect(
      changeEntryMainForm(database, { entryId: 'nope', mainForm: 'approach' })
    ).toEqual({ status: 'missing' })
  })
})

describe('mergeEntries', () => {
  it('把源词条的原句与学习内容并进目标，计数与归属都对', () => {
    const { approachId, contextId } = entries()
    createLearningNote(database, { entryId: approachId, body: '目标的学习内容' })
    createLearningNote(database, { entryId: contextId, body: '并过去的学习内容' })

    const result = mergeEntries(database, {
      sourceEntryId: contextId,
      targetEntryId: approachId
    })

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') return
    expect(result).toMatchObject({
      movedSentences: 1,
      repeatedSentences: 0,
      movedNotes: 1
    })
    expect(result.entry).toMatchObject({
      id: approachId,
      sentenceCount: 3,
      articleCount: 1,
      noteCount: 2
    })

    expect(readEntryPage(database, contextId)).toBeNull()
    expect(readLearningNotes(database, approachId).map((note) => note.body).sort()).toEqual([
      '并过去的学习内容',
      '目标的学习内容'
    ])
    expect(readEntryList(database, {}).entries.map((entry) => entry.mainForm).sort()).toEqual([
      'approach',
      'approachable'
    ])
  })

  it('合并后主词形按用户选的走，最近收集取两边较晚的', () => {
    const { approachId, contextId } = entries()

    const result = mergeEntries(database, {
      sourceEntryId: contextId,
      targetEntryId: approachId,
      mainForm: 'Context'
    })

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') return
    expect(result.entry.mainForm).toBe('Context')
    expect(result.entry.lastCollectedAt).toBe(T2)
  })

  it('两边都有同篇同句时并成一条，不新增关联', () => {
    const approach = entries()
    const employers = collect(database, article, 0, 'Employers', T4)

    const result = mergeEntries(database, {
      sourceEntryId: employers.entry.id,
      targetEntryId: approach.approachId
    })

    expect(result.status).toBe('merged')
    if (result.status !== 'merged') return
    expect(result).toMatchObject({ movedSentences: 0, repeatedSentences: 1 })
    expect(result.entry.sentenceCount).toBe(2)
    expect(readEntryPage(database, employers.entry.id)).toBeNull()
  })

  it('合并进来的置顶内容遇到已有置顶时改为不置顶', () => {
    const { approachId, contextId } = entries()
    const resident = createLearningNote(database, { entryId: approachId, body: '本来置顶' })
    const moved = createLearningNote(database, { entryId: contextId, body: '带置顶来' })
    if (resident.status !== 'saved' || moved.status !== 'saved') throw new Error('没写进去')
    database.prepare('UPDATE learning_note SET pinned = 1 WHERE id = ?').run(resident.note.id)
    database.prepare('UPDATE learning_note SET pinned = 1 WHERE id = ?').run(moved.note.id)

    mergeEntries(database, { sourceEntryId: contextId, targetEntryId: approachId })

    expect(readLearningNotes(database, approachId).map((note) => [note.body, note.pinned])).toEqual([
      ['本来置顶', true],
      ['带置顶来', false]
    ])
  })

  it('并到自己、主词形没收集过、词条不存在都拒绝', () => {
    const { approachId, contextId } = entries()

    expect(
      mergeEntries(database, { sourceEntryId: approachId, targetEntryId: approachId })
    ).toEqual({ status: 'rejected', reason: 'same-entry' })
    expect(
      mergeEntries(database, {
        sourceEntryId: contextId,
        targetEntryId: approachId,
        mainForm: 'zebra'
      })
    ).toEqual({ status: 'rejected', reason: 'main-form' })
    expect(
      mergeEntries(database, { sourceEntryId: 'nope', targetEntryId: approachId })
    ).toEqual({ status: 'missing' })
    expect(
      mergeEntries(database, { sourceEntryId: contextId, targetEntryId: 'nope' })
    ).toEqual({ status: 'missing' })
  })
})

describe('moveEntrySentence', () => {
  it('把一条原句拆到另一个词条，两边的计数与阅读标记都对', () => {
    const { approachId, contextId, contextSentenceId } = entries()

    const result = moveEntrySentence(database, {
      entrySentenceId: contextSentenceId,
      target: { kind: 'entry', entryId: approachId }
    })

    expect(result.status).toBe('moved')
    if (result.status !== 'moved') return
    expect(result.from).toBeNull()
    expect(result.to).toMatchObject({ id: approachId, sentenceCount: 3 })
    expect(readEntryPage(database, contextId)).toBeNull()
    expect(result.marks.find((mark) => mark.id === contextSentenceId)).toMatchObject({
      entryId: approachId,
      entryMainForm: 'approach'
    })
  })

  it('拆到新词条会按原句的词形建一个', () => {
    const { approachId, approachableId, approachableSentenceId } = entries()
    mergeEntries(database, { sourceEntryId: approachableId, targetEntryId: approachId })

    const result = moveEntrySentence(database, {
      entrySentenceId: approachableSentenceId,
      target: { kind: 'new' }
    })

    expect(result.status).toBe('moved')
    if (result.status !== 'moved') return
    expect(result.from).toMatchObject({ id: approachId, sentenceCount: 2 })
    expect(result.to).toMatchObject({
      mainForm: 'approachable',
      sentenceCount: 1,
      articleCount: 1
    })
    expect(result.to.id).not.toBe(approachId)
  })

  it('源词条的最后一条原句被拆走时连词条与学习内容一起删', () => {
    const { approachId, contextId, contextSentenceId } = entries()
    createLearningNote(database, { entryId: contextId, body: '跟着词条走' })

    const result = moveEntrySentence(database, {
      entrySentenceId: contextSentenceId,
      target: { kind: 'entry', entryId: approachId }
    })

    expect(result.status).toBe('moved')
    if (result.status !== 'moved') return
    expect(result.from).toBeNull()
    expect(readEntryPage(database, contextId)).toBeNull()
    expect(readLearningNotes(database, contextId)).toEqual([])
  })

  it('目标已经有同篇同句、拆到自己、原句不存在都拒绝', () => {
    const { approachId, contextId } = entries()
    const employers = collect(database, article, 0, 'Employers', T4)

    expect(
      moveEntrySentence(database, {
        entrySentenceId: employers.sentence.id,
        target: { kind: 'entry', entryId: approachId }
      })
    ).toEqual({ status: 'rejected', reason: 'duplicate' })
    expect(
      moveEntrySentence(database, {
        entrySentenceId: employers.sentence.id,
        target: { kind: 'entry', entryId: employers.entry.id }
      })
    ).toEqual({ status: 'rejected', reason: 'same-entry' })
    expect(
      moveEntrySentence(database, {
        entrySentenceId: 'nope',
        target: { kind: 'entry', entryId: contextId }
      })
    ).toEqual({ status: 'missing' })
    expect(
      moveEntrySentence(database, {
        entrySentenceId: employers.sentence.id,
        target: { kind: 'entry', entryId: 'nope' }
      })
    ).toEqual({ status: 'missing' })
  })
})

describe('reselectEntrySentence', () => {
  it('在原句这一句里换范围，词形与标记跟着改，计数不变', () => {
    const collected = collect(database, article, 0, 'approach hiring', T0)
    const paragraph = paragraphAt(article, 0)
    const start = paragraph.text.indexOf('approach')

    const result = reselectEntrySentence(database, {
      entrySentenceId: collected.sentence.id,
      start,
      end: start + 'approach'.length
    })

    expect(result.status).toBe('resaved')
    if (result.status !== 'resaved') return
    expect(result.sentence).toMatchObject({
      surface: 'approach',
      surfaceOffset: 'Employers '.length,
      sentenceText: 'Employers approach hiring differently.'
    })
    expect(result.entry).toMatchObject({ sentenceCount: 1, mainForm: 'approach hiring' })
    expect(result.marks).toEqual([
      expect.objectContaining({ surface: 'approach', start, end: start + 'approach'.length })
    ])
    expect(readArticleCollections(database, article.id)[0]?.surface).toBe('approach')
  })

  it('范围出句、空白、原句不存在都拒绝', () => {
    const { approachingSentenceId } = entries()
    const paragraph = paragraphAt(article, 0)
    const secondSentence = paragraph.sentences[1]
    if (!secondSentence) throw new Error('fixture 少一句')

    expect(
      reselectEntrySentence(database, {
        entrySentenceId: approachingSentenceId,
        start: 0,
        end: secondSentence.end + 4
      })
    ).toEqual({ status: 'rejected', reason: 'range' })

    const space = paragraph.text.indexOf(' ', secondSentence.start)
    expect(
      reselectEntrySentence(database, {
        entrySentenceId: approachingSentenceId,
        start: space,
        end: space + 1
      })
    ).toEqual({ status: 'rejected', reason: 'empty' })

    expect(
      reselectEntrySentence(database, { entrySentenceId: 'nope', start: 0, end: 1 })
    ).toEqual({ status: 'missing' })
  })
})
