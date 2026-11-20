import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtureArticle, writeCorpusDirectory, type FixtureEntry } from '../../testing/corpus-fixture'
import {
  askQuestion,
  createGroupThread,
  createThread,
  deleteThread,
  saveAnswer
} from '../chat/threads'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { setEntryLater } from '../entries/later'
import { collectSelection, deleteEntrySentence } from '../entries/queries'
import { readEntryList } from '../entries/page'
import { deleteArticle, readArticleDeletionPreview } from '../library/articles'
import { saveGeneratedArticle } from '../library/generated-articles'
import { readLibrary } from '../library/queries'
import { createPin, deletePin, fileAllUnfiled, movePin, readPinBoard, restorePins } from '../pins/pins'
import { readNavCounts } from './counts'

/**
 * 全局栏计数：词条数、文章数与未归档数。这里的断言从两个方向压：
 * 绝对值按语料与操作推算，同时与词条页 total / 文章库 articleCount / 钉板 unfiledCount
 * 对照，保证左栏数字和各个页面读的是同一本账，而不是各写一套 SQL。
 */

const articleA = fixtureArticle({
  id: 'fixture-counts-a',
  sentences: [
    ['Employers approach hiring differently.', 'Approaching a new desk takes patience.'],
    ['Context keeps the skill alive.', 'Repeated words stick.']
  ]
})

const articleB = fixtureArticle({
  id: 'fixture-counts-b',
  label: '2024年6月 · 第1套 · 仔细阅读 Passage Two',
  sentences: [['Another article offers a different perspective.']]
})

const ANSWER =
  '第一段：approach 是接近，也可以指处理问题的方法。\n\n第二段：complain 只是抱怨，事情也许还能补救。'

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-counts-'))
  writeCorpusDirectory(directory, [articleA, articleB])
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

function paragraphOf(entry: FixtureEntry, index: number): JsonParagraph {
  const paragraph = (entry.json.paragraphs as JsonParagraph[])[index]
  if (!paragraph) throw new Error(`${entry.id} 没有第 ${index} 段`)
  return paragraph
}

/** 收下一个词，返回词条 id 与那条原句关联 id。 */
function collect(
  entry: FixtureEntry,
  paragraphIndex: number,
  needle: string
): { entryId: string; sentenceId: string } {
  const paragraph = paragraphOf(entry, paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) throw new Error(`第 ${paragraphIndex} 段没有 ${needle}`)
  const sentenceOrdinal = paragraph.sentences.findIndex(
    (sentence) => sentence.start <= start && start < sentence.end
  )
  const result = collectSelection(
    database,
    {
      articleId: entry.id,
      paragraphId: paragraph.id,
      sentenceOrdinal,
      start,
      end: start + needle.length
    },
    { now: '2026-11-18T08:00:00.000Z' }
  )
  if (result.status === 'rejected') throw new Error(`收 ${needle} 被拒绝：${result.reason}`)
  return { entryId: result.entry.id, sentenceId: result.sentence.id }
}

function seedThread(main: Parameters<typeof createThread>[1]['main'], answer = ANSWER) {
  const created = createThread(database, { main })
  if (created.status !== 'created') throw new Error('线程没建起来')
  const asked = askQuestion(database, { threadId: created.thread.id, text: '这句怎么理解？' })
  if (asked.status !== 'asked') throw new Error('问题没写进去')
  const saved = saveAnswer(database, {
    threadId: created.thread.id,
    questionId: asked.questionId,
    text: answer,
    thinking: '',
    phase: 'done'
  })
  if (saved.status !== 'saved') throw new Error('回答没写进去')
  const answerId = saved.thread.turns[0]?.answer?.id
  if (!answerId) throw new Error('没有回答')
  return { threadId: created.thread.id, answerId }
}

function pinTo(
  seeded: { threadId: string; answerId: string },
  target: { kind: 'entry'; entryId: string } | { kind: 'article'; articleId: string } | { kind: 'unfiled' }
) {
  const start = ANSWER.indexOf('approach')
  const result = createPin(database, {
    threadId: seeded.threadId,
    answerId: seeded.answerId,
    start,
    end: start + 'approach'.length,
    target
  })
  if (result.status !== 'pinned') throw new Error('没钉上')
  return result.pin
}

/** 计数与各页面的口径一致，是这一票的核心不变量。 */
function expectConsistent(counts: ReturnType<typeof readNavCounts>): void {
  expect(counts.entries).toBe(readEntryList(database).total)
  expect(counts.articles).toBe(readLibrary(database).articleCount)
  expect(counts.unfiled).toBe(readPinBoard(database, null).unfiledCount)
}

describe('readNavCounts', () => {
  it('空库时文章数来自语料，词条与未归档都是 0', () => {
    const counts = readNavCounts(database)
    expect(counts).toEqual({ entries: 0, articles: 2, unfiled: 0 })
    expectConsistent(counts)
  })

  it('新增词条只加词条数；标记稍后看不改变任何计数', () => {
    const collected = collect(articleA, 0, 'approach')
    expect(readNavCounts(database).entries).toBe(1)

    const marked = setEntryLater(database, { entryId: collected.entryId, later: true })
    expect(marked.status).toBe('marked')
    const counts = readNavCounts(database)
    expect(counts).toEqual({ entries: 1, articles: 2, unfiled: 0 })
    expectConsistent(counts)
  })

  it('未归档的钉住、归位、移回、丢弃与撤销都让未归档数跟着走', () => {
    const collected = collect(articleA, 0, 'approach')
    const thread = seedThread({ kind: 'none' })

    const first = pinTo(thread, { kind: 'unfiled' })
    expect(readNavCounts(database).unfiled).toBe(1)

    // 归位到词条：未归档归零，词条数不变。
    expect(
      movePin(database, { pinId: first.id, target: { kind: 'entry', entryId: collected.entryId } })
        .status
    ).toBe('saved')
    expect(readNavCounts(database)).toEqual({ entries: 1, articles: 2, unfiled: 0 })

    // 再移回未归档。
    expect(movePin(database, { pinId: first.id, target: { kind: 'unfiled' } }).status).toBe('saved')
    expect(readNavCounts(database).unfiled).toBe(1)

    // 丢弃 → 撤销（按快照放回）。
    const snapshot = readPinBoard(database, null).unfiledPins[0]
    if (!snapshot) throw new Error('没有未归档卡片')
    const restoreInput = {
      id: snapshot.id,
      capturedText: snapshot.capturedText,
      start: snapshot.start,
      end: snapshot.end,
      target: { kind: 'unfiled' as const },
      provenance: snapshot.provenance,
      createdAt: snapshot.createdAt
    }
    expect(deletePin(database, { pinId: snapshot.id }).status).toBe('deleted')
    expect(readNavCounts(database).unfiled).toBe(0)
    expect(restorePins(database, { pins: [restoreInput] }).status).toBe('restored')
    expect(readNavCounts(database).unfiled).toBe(1)

    // 再钉一条，全部归位后归零。
    pinTo(thread, { kind: 'unfiled' })
    expect(readNavCounts(database).unfiled).toBe(2)
    const filed = fileAllUnfiled(database, {
      target: { kind: 'entry', entryId: collected.entryId }
    })
    expect(filed.status).toBe('filed')
    expect(readNavCounts(database).unfiled).toBe(0)
    expectConsistent(readNavCounts(database))
  })

  it('删除最后一条原句会删掉词条，挂在该词条上的钉住退回未归档', () => {
    const collected = collect(articleA, 0, 'approach')
    const thread = seedThread({ kind: 'entry', entryId: collected.entryId })
    pinTo(thread, { kind: 'entry', entryId: collected.entryId })

    const deleted = deleteEntrySentence(database, collected.sentenceId)
    expect(deleted.status).toBe('deleted')

    const counts = readNavCounts(database)
    expect(counts).toEqual({ entries: 0, articles: 2, unfiled: 1 })
    expectConsistent(counts)
  })

  it('删除文章同时减少文章数、消失词条数，并把挂在本篇的钉住算成未归档', () => {
    collect(articleA, 0, 'approach')
    const thread = seedThread({ kind: 'article', articleId: articleA.id })
    pinTo(thread, { kind: 'article', articleId: articleA.id })
    expect(readNavCounts(database)).toEqual({ entries: 1, articles: 2, unfiled: 0 })

    const preview = readArticleDeletionPreview(database, articleA.id)
    if (preview === null) throw new Error('没有删除影响面')
    expect(deleteArticle(database, { articleId: articleA.id, confirmed: preview }).status).toBe(
      'deleted'
    )

    const counts = readNavCounts(database)
    expect(counts).toEqual({ entries: 0, articles: 1, unfiled: 1 })
    expectConsistent(counts)
  })

  it('删除线程不减少未归档数：钉住按快照保留', () => {
    const collected = collect(articleA, 0, 'approach')
    const thread = seedThread({ kind: 'entry', entryId: collected.entryId })
    pinTo(thread, { kind: 'unfiled' })
    expect(readNavCounts(database).unfiled).toBe(1)

    expect(deleteThread(database, { threadId: thread.threadId }).status).toBe('deleted')

    const counts = readNavCounts(database)
    expect(counts).toEqual({ entries: 1, articles: 2, unfiled: 1 })
    expectConsistent(counts)
  })

  it('存为 AI 文章只增加文章数', () => {
    const collected = collect(articleA, 0, 'approach')
    const created = createGroupThread(database, { entryIds: [collected.entryId] })
    if (created.status !== 'created') throw new Error('组词线程没建起来')
    const asked = askQuestion(database, {
      threadId: created.thread.id,
      text: '用这些词写一段英文阅读材料。'
    })
    if (asked.status !== 'asked') throw new Error('提问没写进去')
    const saved = saveAnswer(database, {
      threadId: created.thread.id,
      questionId: asked.questionId,
      text: 'Approach the desk with patience.',
      thinking: '',
      phase: 'done'
    })
    if (saved.status !== 'saved') throw new Error('回答没写进去')
    const answerId = saved.thread.turns[0]?.answer?.id
    if (!answerId) throw new Error('没有回答')

    const article = saveGeneratedArticle(database, {
      threadId: created.thread.id,
      answerId
    })
    expect(article.status).toBe('saved')

    const counts = readNavCounts(database)
    expect(counts).toEqual({ entries: 1, articles: 3, unfiled: 0 })
    expectConsistent(counts)
  })

  it('落点目标已经不存在时按未归档计，与钉板读到的未归档一致', () => {
    const thread = seedThread({ kind: 'none' })
    pinTo(thread, { kind: 'article', articleId: articleB.id })
    expect(readNavCounts(database).unfiled).toBe(0)

    // 绕过删除流程直接删文章：钉住的 target_kind 仍是 article，但目标已不在。
    database.prepare('DELETE FROM article WHERE id = ?').run(articleB.id)

    const counts = readNavCounts(database)
    expect(counts).toEqual({ entries: 0, articles: 1, unfiled: 1 })
    expectConsistent(counts)
  })
})
