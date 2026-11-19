import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { PinTarget } from '../../shared/pins'
import { fixtureArticle, writeCorpusDirectory } from '../../testing/corpus-fixture'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { readLearningNotes, updateLearningNote } from '../entries/notes'
import { collectSelection } from '../entries/queries'
import { createPin, readPinBoard, readPinSource, restorePins } from '../pins/pins'
import { askQuestion, createThread, deleteThread, findRecentThreadForMain, listThreads, readThreadView, saveAnswer } from './threads'

const sourceSentence = 'Employers approach hiring differently.'
const article = fixtureArticle({ id: 'thread-deletion-article', year: 2026, month: 6, set: 1, sentences: [[sourceSentence]] })
const answerText = 'approach 表示方法。'
const now = '2026-11-18T08:00:00.000Z'
let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-thread-deletion-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [article])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

function seed() {
  const [paragraph] = article.json.paragraphs as { id: string }[]
  const collected = collectSelection(database, {
    articleId: article.id, paragraphId: paragraph!.id, sentenceOrdinal: 0, start: 10, end: 18
  })
  if (collected.status === 'rejected') throw new Error('没有收下原句')
  const entryId = collected.entry.id
  const main = { kind: 'entry', entryId } as const
  const created = createThread(database, { main })
  if (created.status !== 'created') throw new Error('没有创建线程')
  const threadId = created.thread.id
  const asked = askQuestion(database, { threadId, text: '怎么用？' })
  if (asked.status !== 'asked') throw new Error('没有写入问题')
  const saved = saveAnswer(database, {
    threadId, questionId: asked.questionId, text: answerText, thinking: '推理', phase: 'done', model: 'fixture-model'
  })
  if (saved.status !== 'saved') throw new Error('没有写入回答')
  const answerId = saved.thread.turns[0]?.answer?.id
  if (!answerId) throw new Error('没有回答 id')
  return { entryId, main, threadId, questionId: asked.questionId, answerId }
}

it('删除线程及所有分支条目，同一主对象不再复用它；各落点保留钉住快照和已编辑的学习内容', () => {
  const { entryId, main, threadId, questionId, answerId } = seed()
  const targets = [{ kind: 'unfiled' }, { kind: 'entry', entryId }, { kind: 'article', articleId: article.id }] as const
  const pins = targets.map((target) => {
    const result = createPin(database, { threadId, answerId, start: 0, end: answerText.length, target }, { now })
    if (result.status !== 'pinned') throw new Error('没有钉住')
    return result.pin
  })
  const [note] = readLearningNotes(database, entryId)
  updateLearningNote(database, { noteId: note!.id, body: '改过的学习内容' })
  const alternate = saveAnswer(database, { threadId, questionId, text: '另一个版本', thinking: '', phase: 'done' })
  expect(alternate.status).toBe('saved')
  const unrelated = createThread(database, { main: { kind: 'none' } })
  if (unrelated.status !== 'created') throw new Error('没有创建其他线程')

  expect(deleteThread(database, { threadId })).toEqual({ status: 'deleted' })
  expect(deleteThread(database, { threadId })).toEqual({ status: 'missing' })
  expect(listThreads(database).threads.map((thread) => thread.id)).toEqual([unrelated.thread.id])
  expect(readThreadView(database, threadId)).toBeNull()
  expect(findRecentThreadForMain(database, main)).toBeNull()
  // ADR 的删除承诺是物理移除条目，而非只把线程隐藏；用数据库边界检查无残留。
  expect(database.prepare('SELECT id FROM thread_entry WHERE thread_id = ?').all(threadId)).toEqual([])

  database.close()
  database = openDatabase(join(directory, 'test.db'))
  expect(readPinBoard(database, null).unfiledPins).toMatchObject([{ id: pins[0]!.id, capturedText: answerText, threadAlive: false }])
  for (const pin of pins) {
    expect(readPinSource(database, pin.id)).toMatchObject({
      thread: null, onBranch: false, questionId: null,
      pin: { capturedText: answerText, createdAt: now, target: pin.target, threadAlive: false,
        provenance: { threadId, threadTitle: 'approach', answerId, turnIndex: 1, model: 'fixture-model', sourceSentence: { text: sourceSentence } } }
    })
  }
  expect(readLearningNotes(database, entryId)).toMatchObject([{
    id: note!.id, body: '改过的学习内容', sourcePin: { id: pins[1]!.id, threadId, threadTitle: 'approach', threadAlive: false }
  }])
})

it('超过 SQLite 级联深度的长分支也能完整删除', () => {
  const { threadId, answerId } = seed()
  // 以已有长日志为输入，绕开写作服务反复构建全量视图的成本。
  const insert = database.prepare(
    `INSERT INTO thread_entry (id, thread_id, parent_id, kind, payload, created_at)
     VALUES (?, ?, ?, ?, '{}', ?)`
  )
  database.transaction(() => {
    let parentId = answerId
    for (let i = 0; i < 1_100; i++) {
      const id = `long-branch-${i}`
      insert.run(id, threadId, parentId, i % 2 === 0 ? 'question' : 'answer', now)
      parentId = id
    }
    database.prepare('UPDATE thread SET leaf_entry_id = ? WHERE id = ?').run(parentId, threadId)
  })()
  expect(deleteThread(database, { threadId })).toEqual({ status: 'deleted' })
  expect(listThreads(database).threads).toEqual([])
  expect(database.prepare('SELECT id FROM thread_entry WHERE thread_id = ?').all(threadId)).toEqual([])
})

it('如果线程删除失败，已处理的条目一并回滚', () => {
  const { threadId, answerId } = seed()
  database.exec(`CREATE TEMP TRIGGER reject_thread_deletion BEFORE DELETE ON thread
    BEGIN SELECT RAISE(ABORT, 'test deletion failure'); END`)
  expect(() => deleteThread(database, { threadId })).toThrow('test deletion failure')
  expect(readThreadView(database, threadId)?.turns[0]?.answer).toMatchObject({ id: answerId, text: answerText })
})

it('旧快照的线程仍在但回答已不在时，不给钉板和学习内容一个打不开的来源', () => {
  const { entryId, threadId } = seed()
  const provenance = {
    threadId, answerId: 'missing-answer', threadTitle: '旧线程名', turnIndex: 1,
    model: 'fixture-model', sourceSentence: null
  }
  const snapshots: { id: string; target: PinTarget }[] = [
    { id: 'unfiled-snapshot', target: { kind: 'unfiled' } },
    { id: 'entry-snapshot', target: { kind: 'entry', entryId } }
  ]
  const restored = restorePins(database, {
    pins: snapshots.map(({ id, target }) => ({
      id, target, provenance, capturedText: answerText, start: 0, end: answerText.length, createdAt: now
    }))
  })
  expect(restored.status).toBe('restored')
  expect(readThreadView(database, threadId)).not.toBeNull()
  expect(readPinBoard(database, null).unfiledPins).toMatchObject([{ id: 'unfiled-snapshot', threadAlive: false }])
  expect(readPinSource(database, 'entry-snapshot')).toMatchObject({
    thread: null, onBranch: false, questionId: null, pin: { threadAlive: false, provenance }
  })
  expect(readLearningNotes(database, entryId)).toMatchObject([{
    body: answerText, sourcePin: { id: 'entry-snapshot', threadTitle: '旧线程名', threadAlive: false }
  }])
})
