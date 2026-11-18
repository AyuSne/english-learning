import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { QuestionResult } from '../../shared/threads'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import {
  askQuestion,
  createThread,
  editQuestion,
  readThreadView,
  saveAnswer,
  switchQuestion
} from './threads'
import { threadExportFileName, threadJsonl, writeThreadJsonl } from './export'

let directory: string
let database: AppDatabase

const askedAt = '2026-11-18T10:00:00.000Z'
const answeredAt = '2026-11-18T10:00:05.000Z'

function startThread(): string {
  const created = createThread(database, { main: { kind: 'none' } }, { now: askedAt })
  if (created.status !== 'created') {
    throw new Error('线程没有建起来')
  }
  return created.thread.id
}

function ask(threadId: string, text: string, now = askedAt): QuestionResult {
  return askQuestion(database, { threadId, text }, { now })
}

function answer(
  threadId: string,
  questionId: string,
  input: { text: string; thinking?: string; model?: string; now?: string }
): string {
  const saved = saveAnswer(
    database,
    {
      threadId,
      questionId,
      text: input.text,
      thinking: input.thinking ?? '',
      thinkingMs: input.thinking ? 1200 : 0,
      phase: 'done',
      model: input.model ?? 'deepseek-flash'
    },
    { now: input.now ?? answeredAt }
  )
  if (saved.status !== 'saved') {
    throw new Error('回答没有落库')
  }
  return questionId
}

function view(threadId: string) {
  const thread = readThreadView(database, threadId)
  if (thread === null) {
    throw new Error('线程读不出来')
  }
  return thread
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-export-'))
  database = openDatabase(join(directory, 'library.db'))
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('threadJsonl', () => {
  it('一行一条：线程头、提问、回答，正文与思维链都能读出来', () => {
    const threadId = startThread()
    const asked = ask(threadId, '什么是 lament？')
    if (asked.status !== 'asked') {
      throw new Error('提问没有落库')
    }
    answer(threadId, asked.questionId, {
      text: 'lament 是哀悼。',
      thinking: '先解释词义。'
    })
    const thread = view(threadId)

    const records = threadJsonl(thread)
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(records).toHaveLength(3)
    expect(records[0]).toEqual({
      type: 'thread',
      version: 1,
      id: threadId,
      title: '什么是 lament？',
      main: { kind: 'none' },
      context: [],
      createdAt: askedAt,
      updatedAt: thread.updatedAt
    })
    expect(records[1]).toEqual({
      type: 'question',
      id: asked.questionId,
      parentId: null,
      createdAt: askedAt,
      text: '什么是 lament？'
    })
    expect(records[2]).toEqual({
      type: 'answer',
      id: thread.turns[0]?.answer?.id,
      parentId: asked.questionId,
      createdAt: answeredAt,
      model: 'deepseek-flash',
      phase: 'done',
      thinking: '先解释词义。',
      thinkingMs: 1200,
      text: 'lament 是哀悼。'
    })
  })

  it('每行都以换行结尾，整份按行解析不会粘在一起', () => {
    const threadId = startThread()
    ask(threadId, '这是什么？')

    const content = threadJsonl(view(threadId))

    expect(content.endsWith('\n')).toBe(true)
    expect(content.startsWith('\uFEFF')).toBe(false)
    expect(content.split('\n')).toHaveLength(3)
  })

  it('还没回答的提问也照样导出，不编造空回答', () => {
    const threadId = startThread()
    ask(threadId, '还在等回答的问题')

    const records = threadJsonl(view(threadId))
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(records.map((record) => record.type)).toEqual(['thread', 'question'])
  })

  it('多轮按顺序排列，后一问挂在前一条回答下', () => {
    const threadId = startThread()
    const first = ask(threadId, '第一问', '2026-11-18T10:00:00.000Z')
    if (first.status !== 'asked') throw new Error('提问没有落库')
    answer(threadId, first.questionId, {
      text: '第一答',
      now: '2026-11-18T10:00:01.000Z'
    })
    const second = ask(threadId, '第二问', '2026-11-18T10:00:02.000Z')
    if (second.status !== 'asked') throw new Error('提问没有落库')

    const records = threadJsonl(view(threadId))
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(records.map((record) => record.type)).toEqual([
      'thread',
      'question',
      'answer',
      'question'
    ])
    expect(records[3]?.parentId).toBe(records[2]?.id)
  })

  it('只导当前这一支：切回旧提后导出的是旧的那一问', () => {
    const threadId = startThread()
    const original = ask(threadId, '原来的问题')
    if (original.status !== 'asked') throw new Error('提问没有落库')
    answer(threadId, original.questionId, { text: '原来的回答' })
    const edited = editQuestion(database, {
      threadId,
      questionId: original.questionId,
      text: '改口的问题'
    })
    if (edited.status !== 'asked') throw new Error('改口没有落库')
    answer(threadId, edited.questionId, {
      text: '改口后的回答',
      now: '2026-11-18T10:01:00.000Z'
    })

    switchQuestion(database, { threadId, questionId: original.questionId })
    const records = threadJsonl(view(threadId))
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)

    expect(records[1]?.text).toBe('原来的问题')
    expect(records[2]?.text).toBe('原来的回答')
    expect(records).toHaveLength(3)
  })
})

describe('threadExportFileName', () => {
  it('把标题里 Windows 不认的字符换掉，带上时间戳', () => {
    expect(threadExportFileName('a/b:c*d?e"f<g>h|i', new Date(2026, 10, 18, 11, 30))).toBe(
      'thread-a-b-c-d-e-f-g-h-i-20261118-1130.jsonl'
    )
  })

  it('标题为空时只留时间戳', () => {
    expect(threadExportFileName('   ', new Date(2026, 10, 18, 11, 30))).toBe(
      'thread-20261118-1130.jsonl'
    )
  })

  it('标题过长时截短，文件名不会撑爆', () => {
    const name = threadExportFileName('很'.repeat(100), new Date(2026, 10, 18, 11, 30))

    expect(name.startsWith('thread-')).toBe(true)
    expect(Array.from(name).length).toBeLessThan(80)
    expect(name.endsWith('-20261118-1130.jsonl')).toBe(true)
  })
})

describe('writeThreadJsonl', () => {
  it('把线程写成不带 BOM 的 UTF-8 文件，内容与导出文本一致', () => {
    const threadId = startThread()
    ask(threadId, '这是什么？')
    const file = join(directory, '导出', 'thread.jsonl')

    const result = writeThreadJsonl(view(threadId), { file })

    expect(result).toEqual({ status: 'saved', file })
    expect(readFileSync(file, 'utf8')).toBe(threadJsonl(view(threadId)))
    const raw = readFileSync(file)
    expect(raw.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
  })

  it('写不进去时只回 failed，不把异常抛给界面', () => {
    const threadId = startThread()
    // 目标是目录，Windows 与 POSIX 都不会把它当文件写。
    const result = writeThreadJsonl(view(threadId), { file: directory })

    expect(result).toEqual({ status: 'failed' })
  })
})
