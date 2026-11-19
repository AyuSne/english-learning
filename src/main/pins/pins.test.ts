import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CollectSelectionRequest } from '../../shared/entries'
import type { Pin, RestorePinInput } from '../../shared/pins'
import { fixtureArticle, writeCorpusDirectory, type FixtureEntry } from '../../testing/corpus-fixture'
import { askQuestion, createThread, readThreadView, saveAnswer, switchAnswer } from '../chat/threads'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { mergeEntries } from '../entries/curation'
import {
  deleteLearningNote,
  moveLearningNote,
  readLearningNotes
} from '../entries/notes'
import { readEntryList, readEntryPage } from '../entries/page'
import { collectSelection, deleteEntrySentence } from '../entries/queries'
import { readHomeSummary, readLibrary } from '../library/queries'
import {
  createPin,
  deletePin,
  fileAllUnfiled,
  movePin,
  readPinBoard,
  readPinSource,
  restorePins
} from './pins'

const T0 = '2026-11-18T08:00:00.000Z'
const T1 = '2026-11-18T08:05:00.000Z'
const T2 = '2026-11-18T08:10:00.000Z'
const T3 = '2026-11-18T08:15:00.000Z'
const T4 = '2026-11-18T09:00:00.000Z'
const T5 = '2026-11-18T09:05:00.000Z'

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

const ANSWER =
  '第一段：lament 是惋惜，事情已经无法挽回。\n\n第二段：complain 只是抱怨，事情也许还能补救。'

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

function paragraphAt(entry: FixtureEntry, index: number): JsonParagraph {
  return (entry.json.paragraphs as JsonParagraph[])[index] as JsonParagraph
}

function selection(paragraphIndex: number, needle: string): CollectSelectionRequest {
  const paragraph = paragraphAt(article, paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) {
    throw new Error(`第 ${paragraphIndex} 段没有 ${needle}`)
  }
  const sentenceOrdinal = paragraph.sentences.findIndex(
    (candidate) => candidate.start <= start && start < candidate.end
  )
  return {
    articleId: article.id,
    paragraphId: paragraph.id,
    sentenceOrdinal,
    start,
    end: start + needle.length
  }
}

function collect(paragraphIndex: number, needle: string, now: string) {
  const result = collectSelection(database, selection(paragraphIndex, needle), { now })
  if (result.status === 'rejected') {
    throw new Error(`collect ${needle} rejected: ${result.reason}`)
  }
  return result
}

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-pins-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [article])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

type Seeded = {
  approachEntryId: string
  contextEntryId: string
  contextSentenceId: string
  threadId: string
  questionId: string
  answerId: string
}

/** 一条挂 approach 词条的线程，一句话里有 lament / complain 两段。 */
function seedThread(options: { answerModel?: string } = {}): Seeded {
  const approach = collect(0, 'approach', T0)
  const context = collect(1, 'Context', T1)
  const created = createThread(
    database,
    { main: { kind: 'entry', entryId: approach.entry.id } },
    { now: T2 }
  )
  if (created.status !== 'created') throw new Error('线程没建起来')
  const asked = askQuestion(
    database,
    { threadId: created.thread.id, text: 'lament 和 complain 有什么区别？' },
    { now: T3 }
  )
  if (asked.status !== 'asked') throw new Error('问题没写进去')
  const saved = saveAnswer(
    database,
    {
      threadId: created.thread.id,
      questionId: asked.questionId,
      text: ANSWER,
      thinking: '',
      phase: 'done',
      model: options.answerModel
    },
    { now: T4 }
  )
  if (saved.status !== 'saved') throw new Error('回答没写进去')
  return {
    approachEntryId: approach.entry.id,
    contextEntryId: context.entry.id,
    contextSentenceId: context.sentence.id,
    threadId: created.thread.id,
    questionId: asked.questionId,
    answerId: saved.thread.turns[0]?.answer?.id ?? ''
  }
}

function pinRequest(seeded: Seeded, target: Parameters<typeof createPin>[1]['target']) {
  const start = ANSWER.indexOf('lament')
  return {
    threadId: seeded.threadId,
    answerId: seeded.answerId,
    start,
    end: start + 'lament'.length,
    target
  }
}

function pinAtEntry(seeded: Seeded): Pin {
  const result = createPin(database, pinRequest(seeded, { kind: 'entry', entryId: seeded.approachEntryId }), {
    now: T5,
    model: 'deepseek-flash'
  })
  if (result.status !== 'pinned') throw new Error(`pin rejected: ${result.reason}`)
  return result.pin
}

function pinUnfiled(seeded: Seeded): Pin {
  const result = createPin(database, pinRequest(seeded, { kind: 'unfiled' }), {
    now: T5,
    model: 'deepseek-flash'
  })
  if (result.status !== 'pinned') throw new Error(`pin rejected: ${result.reason}`)
  return result.pin
}

describe('createPin', () => {
  it('把选中片段钉到词条：快照、出处与学习内容都对得上', () => {
    const seeded = seedThread()

    const result = createPin(
      database,
      pinRequest(seeded, { kind: 'entry', entryId: seeded.approachEntryId }),
      { now: T5, model: 'deepseek-flash' }
    )

    expect(result.status).toBe('pinned')
    if (result.status !== 'pinned') return
    expect(result.pin).toMatchObject({
      capturedText: 'lament',
      start: ANSWER.indexOf('lament'),
      end: ANSWER.indexOf('lament') + 'lament'.length,
      target: { kind: 'entry', entryId: seeded.approachEntryId, label: 'approach' },
      defaultTarget: { kind: 'entry', entryId: seeded.approachEntryId, label: 'approach' },
      sourceStatus: 'available',
      createdAt: T5
    })
    expect(result.pin.provenance).toMatchObject({
      threadId: seeded.threadId,
      threadTitle: 'approach',
      answerId: seeded.answerId,
      turnIndex: 1,
      model: 'deepseek-flash',
      sourceSentence: { text: 'Employers approach hiring differently.' }
    })

    const page = readEntryPage(database, seeded.approachEntryId)
    expect(page?.entry.noteCount).toBe(1)
    expect(page?.notes[0]).toMatchObject({
      body: 'lament',
      source: 'pin',
      sourcePinId: result.pin.id,
      sourcePin: {
        id: result.pin.id,
        threadId: seeded.threadId,
        threadTitle: 'approach',
        turnIndex: 1,
        model: 'deepseek-flash',
        sourceStatus: 'available'
      }
    })
  })

  it('未归档不写学习内容，也不改首页、词条与文章库的计数', () => {
    const seeded = seedThread()
    const homeBefore = readHomeSummary(database)
    const entriesBefore = readEntryList(database, {})
    const libraryBefore = readLibrary(database)
    const notesBefore = readEntryPage(database, seeded.approachEntryId)?.entry.noteCount

    const result = createPin(database, pinRequest(seeded, { kind: 'unfiled' }), {
      now: T5,
      model: 'deepseek-flash'
    })

    expect(result.status).toBe('pinned')
    if (result.status !== 'pinned') return
    expect(result.pin.target).toEqual({ kind: 'unfiled' })
    expect(result.pin.defaultTarget).toEqual({
      kind: 'entry',
      entryId: seeded.approachEntryId,
      label: 'approach'
    })

    const board = readPinBoard(database, seeded.threadId)
    expect(board.threadPins).toEqual([])
    expect(board.unfiledPins.map((pin) => pin.id)).toEqual([result.pin.id])
    expect(board.unfiledCount).toBe(1)

    expect(readHomeSummary(database)).toEqual(homeBefore)
    expect(readEntryList(database, {})).toEqual(entriesBefore)
    expect(readLibrary(database)).toEqual(libraryBefore)
    expect(readEntryPage(database, seeded.approachEntryId)?.entry.noteCount).toBe(notesBefore)
  })

  it('片段越界、回答不属于这条线程或落点不存在都拒绝', () => {
    const seeded = seedThread()
    const base = pinRequest(seeded, { kind: 'unfiled' })

    expect(createPin(database, { ...base, start: -1 }, { now: T5 })).toEqual({
      status: 'rejected',
      reason: 'range'
    })
    expect(createPin(database, { ...base, start: 3, end: 3 }, { now: T5 })).toEqual({
      status: 'rejected',
      reason: 'range'
    })
    expect(
      createPin(database, { ...base, end: ANSWER.length + 1 }, { now: T5 })
    ).toEqual({ status: 'rejected', reason: 'range' })
    expect(
      createPin(database, { ...base, answerId: 'nope' }, { now: T5 })
    ).toEqual({ status: 'rejected', reason: 'answer' })
    expect(
      createPin(database, { ...base, target: { kind: 'entry', entryId: 'nope' } }, { now: T5 })
    ).toEqual({ status: 'rejected', reason: 'target' })
    expect(
      createPin(database, { ...base, target: { kind: 'article', articleId: 'nope' } }, { now: T5 })
    ).toEqual({ status: 'rejected', reason: 'target' })
    expect(
      createPin(database, { ...base, threadId: 'nope' }, { now: T5 })
    ).toEqual({ status: 'rejected', reason: 'thread' })
  })

  it('跨段选中的片段按整段快照收下，位置仍是相对整版正文', () => {
    const seeded = seedThread()
    const start = ANSWER.indexOf('lament')
    const end = ANSWER.indexOf('complain') + 'complain'.length

    const result = createPin(
      database,
      { ...pinRequest(seeded, { kind: 'unfiled' }), start, end },
      { now: T5 }
    )

    expect(result.status).toBe('pinned')
    if (result.status !== 'pinned') return
    expect(result.pin.capturedText).toBe(ANSWER.slice(start, end))
  })

  it('出处模型取回答落库时用的那一个，不被当前配置覆盖', () => {
    const seeded = seedThread({ answerModel: 'deepseek-chat' })

    const result = createPin(
      database,
      pinRequest(seeded, { kind: 'unfiled' }),
      { now: T5, model: 'deepseek-flash' }
    )

    expect(result.status).toBe('pinned')
    if (result.status !== 'pinned') return
    expect(result.pin.provenance.model).toBe('deepseek-chat')
  })
})

describe('movePin', () => {
  it('未归档归到词条时补上学习内容，再移到文章时把学习内容撤掉', () => {
    const seeded = seedThread()
    const pin = pinUnfiled(seeded)
    expect(readEntryPage(database, seeded.approachEntryId)?.entry.noteCount).toBe(0)

    const toEntry = movePin(
      database,
      { pinId: pin.id, target: { kind: 'entry', entryId: seeded.approachEntryId } },
      { now: T5 }
    )
    expect(toEntry.status).toBe('saved')
    if (toEntry.status !== 'saved') return
    expect(toEntry.pin.target).toMatchObject({ kind: 'entry', label: 'approach' })
    expect(readEntryPage(database, seeded.approachEntryId)?.notes.map((note) => note.body)).toEqual([
      'lament'
    ])

    const toArticle = movePin(
      database,
      { pinId: pin.id, target: { kind: 'article', articleId: article.id } },
      { now: T5 }
    )
    expect(toArticle.status).toBe('saved')
    if (toArticle.status !== 'saved') return
    expect(toArticle.pin.target).toMatchObject({ kind: 'article', label: expect.any(String) })
    expect(readEntryPage(database, seeded.approachEntryId)?.entry.noteCount).toBe(0)
  })

  it('在词条之间移动保留学习内容的正文与置顶状态', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)
    const note = readLearningNotes(database, seeded.approachEntryId)[0]
    if (!note) throw new Error('没写学习内容')
    database
      .prepare('UPDATE learning_note SET body = ?, pinned = 1 WHERE id = ?')
      .run('改过的正文', note.id)

    const moved = movePin(
      database,
      { pinId: pin.id, target: { kind: 'entry', entryId: seeded.contextEntryId } },
      { now: T5 }
    )

    expect(moved.status).toBe('saved')
    expect(readLearningNotes(database, seeded.contextEntryId)).toMatchObject([
      { body: '改过的正文', pinned: true, sourcePinId: pin.id }
    ])
    expect(readLearningNotes(database, seeded.approachEntryId)).toEqual([])
  })

  it('落点不存在、钉住不存在都给出明确结果', () => {
    const seeded = seedThread()
    const pin = pinUnfiled(seeded)

    expect(
      movePin(database, { pinId: pin.id, target: { kind: 'entry', entryId: 'nope' } })
    ).toEqual({ status: 'rejected', reason: 'target' })
    expect(
      movePin(database, { pinId: 'nope', target: { kind: 'unfiled' } })
    ).toEqual({ status: 'missing' })
  })
})

describe('deletePin', () => {
  it('删掉钉住时连同那条学习内容一起真删，不留快照入口', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)

    expect(deletePin(database, { pinId: pin.id })).toEqual({ status: 'deleted', pinId: pin.id })
    expect(readEntryPage(database, seeded.approachEntryId)?.entry.noteCount).toBe(0)
    expect(readPinBoard(database, seeded.threadId)).toMatchObject({
      threadPins: [],
      unfiledPins: [],
      unfiledCount: 0
    })
    expect(deletePin(database, { pinId: pin.id })).toEqual({ status: 'missing' })
  })

  it('从词条里删学习内容也会撤掉钉住，对话里的描边随之消失', () => {
    const seeded = seedThread()
    pinAtEntry(seeded)
    const note = readLearningNotes(database, seeded.approachEntryId)[0]
    if (!note) throw new Error('没写学习内容')

    deleteLearningNote(database, { noteId: note.id })

    expect(readPinBoard(database, seeded.threadId).threadPins).toEqual([])
  })

  it('把学习内容移到别的词条，钉住的落点跟着走', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)
    const note = readLearningNotes(database, seeded.approachEntryId)[0]
    if (!note) throw new Error('没写学习内容')

    moveLearningNote(database, { noteId: note.id, entryId: seeded.contextEntryId })

    const board = readPinBoard(database, seeded.threadId)
    expect(board.threadPins[0]?.target).toMatchObject({
      kind: 'entry',
      entryId: seeded.contextEntryId,
      label: 'Context'
    })
    expect(board.threadPins[0]?.id).toBe(pin.id)
  })
})

describe('fileAllUnfiled 与 restorePins', () => {
  it('全部未归档一次归位，逐条移回未归档就是撤销', () => {
    const seeded = seedThread()
    const secondStart = ANSWER.indexOf('complain')
    const first = pinUnfiled(seeded)
    const secondResult = createPin(
      database,
      {
        ...pinRequest(seeded, { kind: 'unfiled' }),
        start: secondStart,
        end: secondStart + 'complain'.length
      },
      { now: T5 }
    )
    if (secondResult.status !== 'pinned') throw new Error('第二条没钉上')

    const filed = fileAllUnfiled(
      database,
      { target: { kind: 'article', articleId: article.id } },
      { now: T5 }
    )

    expect(filed.status).toBe('filed')
    if (filed.status !== 'filed') return
    expect(filed.filed.map((pin) => pin.id)).toEqual([first.id, secondResult.pin.id])
    expect(readPinBoard(database, seeded.threadId).unfiledCount).toBe(0)
    expect(readPinBoard(database, seeded.threadId).threadPins).toHaveLength(2)

    for (const pin of filed.filed) {
      movePin(database, { pinId: pin.id, target: { kind: 'unfiled' } }, { now: T5 })
    }
    const board = readPinBoard(database, seeded.threadId)
    expect(board.unfiledCount).toBe(2)
    expect(board.threadPins).toEqual([])
  })

  it('撤销丢弃时按原 id 和原落点原样放回', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)
    const before = readPinBoard(database, seeded.threadId).threadPins[0]
    if (!before) throw new Error('没有钉住')
    deletePin(database, { pinId: pin.id })

    const input: RestorePinInput = {
      id: before.id,
      capturedText: before.capturedText,
      start: before.start,
      end: before.end,
      target: { kind: 'entry', entryId: seeded.approachEntryId },
      provenance: before.provenance,
      createdAt: before.createdAt
    }
    const restored = restorePins(database, { pins: [input] }, { now: T5 })

    expect(restored.status).toBe('restored')
    if (restored.status !== 'restored') return
    expect(restored.pins[0]?.id).toBe(before.id)
    expect(readLearningNotes(database, seeded.approachEntryId).map((note) => note.body)).toEqual([
      'lament'
    ])
    expect(readPinBoard(database, seeded.threadId).threadPins.map((item) => item.id)).toEqual([
      before.id
    ])
  })
})

describe('源对话', () => {
  it('线程还在时按分支给出来源与切换入口', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)

    const source = readPinSource(database, pin.id)
    expect(source).not.toBeNull()
    expect(source?.onBranch).toBe(true)
    expect(source?.questionId).toBeNull()
    expect(source?.thread?.id).toBe(seeded.threadId)

    // 重新生成一版后当前分支落在新回答上，旧钉住不在这一支。
    const regenerated = saveAnswer(
      database,
      {
        threadId: seeded.threadId,
        questionId: seeded.questionId,
        text: '新一版回答。',
        thinking: '',
        phase: 'done'
      },
      { now: T5 }
    )
    if (regenerated.status !== 'saved') throw new Error('新版本没写进去')

    const offBranch = readPinSource(database, pin.id)
    expect(offBranch?.pin.sourceStatus).toBe('available')
    expect(offBranch?.onBranch).toBe(false)
    expect(offBranch?.questionId).toBe(seeded.questionId)

    switchAnswer(
      database,
      { threadId: seeded.threadId, questionId: seeded.questionId, answerId: seeded.answerId },
      { now: T5 }
    )
    expect(readPinSource(database, pin.id)?.onBranch).toBe(true)
  })

  it('源对话被删后钉住仍在，出处照快照显示、入口置灰', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)

    database.prepare('DELETE FROM thread WHERE id = ?').run(seeded.threadId)

    const board = readPinBoard(database, seeded.threadId)
    expect(board.threadPins).toHaveLength(1)
    expect(board.threadPins[0]).toMatchObject({
      id: pin.id,
      sourceStatus: 'thread-deleted',
      defaultTarget: { kind: 'unfiled' },
      provenance: { threadTitle: 'approach' }
    })
    const note = readLearningNotes(database, seeded.approachEntryId)[0]
    expect(note?.sourcePin).toMatchObject({ sourceStatus: 'thread-deleted', threadTitle: 'approach' })
    expect(readPinSource(database, pin.id)).toMatchObject({
      thread: null,
      onBranch: false,
      questionId: null,
      pin: { sourceStatus: 'thread-deleted' }
    })
  })

  it('旧快照的原回答缺失时不把仍存在的线程报告为已删除', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)
    // Simulate a legacy snapshot whose answer is missing but whose thread is intact.
    database.prepare('UPDATE pin SET answer_id = ? WHERE id = ?').run('missing-answer', pin.id)

    expect(readPinBoard(database, seeded.threadId).threadPins).toMatchObject([
      { id: pin.id, capturedText: pin.capturedText, sourceStatus: 'answer-missing' }
    ])
    expect(readLearningNotes(database, seeded.approachEntryId)[0]).toMatchObject({
      body: pin.capturedText, sourcePin: { id: pin.id, sourceStatus: 'answer-missing' }
    })
    expect(readPinSource(database, pin.id)).toMatchObject({
      thread: null, onBranch: false, questionId: null, pin: { sourceStatus: 'answer-missing' }
    })
  })

  it('源码不存在时返回 null', () => {
    expect(readPinSource(database, 'nope')).toBeNull()
  })
})

describe('钉板', () => {
  it('这条线程与未归档分开列，未归档计数不受线程影响', () => {
    const seeded = seedThread()
    pinAtEntry(seeded)
    pinUnfiled(seeded)

    const board = readPinBoard(database, seeded.threadId)
    expect(board.threadPins).toHaveLength(1)
    expect(board.threadPins[0]?.target.kind).toBe('entry')
    expect(board.unfiledPins).toHaveLength(1)
    expect(board.unfiledPins[0]?.target.kind).toBe('unfiled')
    expect(board.unfiledCount).toBe(1)

    const otherThread = readPinBoard(database, null)
    expect(otherThread.threadPins).toEqual([])
    expect(otherThread.unfiledCount).toBe(1)
  })

  it('线程不存在时只给未归档', () => {
    const seeded = seedThread()
    pinUnfiled(seeded)

    expect(readPinBoard(database, 'nope')).toMatchObject({
      threadId: 'nope',
      threadPins: [],
      unfiledCount: 1
    })
  })

  it('目标词条被外部删掉时按未归档列出，列表与计数一致', () => {
    const seeded = seedThread()
    createPin(
      database,
      pinRequest(seeded, { kind: 'entry', entryId: seeded.contextEntryId }),
      { now: T5, model: 'deepseek-flash' }
    )
    database.prepare('DELETE FROM word_entry WHERE id = ?').run(seeded.contextEntryId)

    const board = readPinBoard(database, seeded.threadId)
    expect(board.threadPins).toEqual([])
    expect(board.unfiledPins).toHaveLength(1)
    expect(board.unfiledPins[0]?.target).toEqual({ kind: 'unfiled' })
    expect(board.unfiledCount).toBe(1)
  })
})

describe('词条合并与删除', () => {
  it('合并词条时钉住的落点跟着迁到目标词条', () => {
    const seeded = seedThread()
    const pinned = createPin(
      database,
      pinRequest(seeded, { kind: 'entry', entryId: seeded.contextEntryId }),
      { now: T5, model: 'deepseek-flash' }
    )
    if (pinned.status !== 'pinned') throw new Error('没钉上')

    mergeEntries(database, {
      sourceEntryId: seeded.contextEntryId,
      targetEntryId: seeded.approachEntryId
    })

    expect(readPinBoard(database, seeded.threadId).threadPins[0]?.target).toMatchObject({
      kind: 'entry',
      entryId: seeded.approachEntryId,
      label: 'approach'
    })
    expect(readLearningNotes(database, seeded.approachEntryId).map((note) => note.body)).toEqual([
      'lament'
    ])
  })

  it('词条删掉后钉住退回未归档，等用户重新决定落点', () => {
    const seeded = seedThread()
    const pinned = createPin(
      database,
      pinRequest(seeded, { kind: 'entry', entryId: seeded.contextEntryId }),
      { now: T5, model: 'deepseek-flash' }
    )
    if (pinned.status !== 'pinned') throw new Error('没钉上')

    const deleted = deleteEntrySentence(database, seeded.contextSentenceId)
    expect(deleted.status).toBe('deleted')
    expect(deleted.status === 'deleted' ? deleted.entryDeleted : false).toBe(true)

    const board = readPinBoard(database, seeded.threadId)
    expect(board.threadPins).toEqual([])
    expect(board.unfiledPins[0]?.target).toEqual({ kind: 'unfiled' })
    expect(board.unfiledCount).toBe(1)
  })
})

describe('线程落点', () => {
  it('从词条线程里钉住时来源原句取上下文里的原句快照', () => {
    const seeded = seedThread()
    const pin = pinAtEntry(seeded)

    expect(pin.provenance.sourceSentence).toEqual({
      id: expect.any(String),
      text: 'Employers approach hiring differently.'
    })
    expect(readThreadView(database, seeded.threadId)?.turns).toHaveLength(1)
  })
})
