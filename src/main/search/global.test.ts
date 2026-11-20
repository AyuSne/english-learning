import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  askQuestion,
  createGroupThread,
  readThreadView,
  saveAnswer
} from '../chat/threads'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { createLearningNote } from '../entries/notes'
import { collectSelection } from '../entries/queries'
import { saveGeneratedArticle } from '../library/generated-articles'
import { fixtureArticle, writeCorpusDirectory, type FixtureEntry } from '../../testing/corpus-fixture'
import { searchEverything } from './global'

const article = fixtureArticle({
  id: 'fixture-search-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  sentences: [
    ['Employers approach hiring differently.', 'Approaching a new desk takes patience.'],
    ['Context keeps the skill alive.', 'A zebra never appears in the corpus.']
  ]
})

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

let directory: string
let database: AppDatabase
let approachEntryId: string
let contextEntryId: string

function paragraphAt(entry: FixtureEntry, index: number): JsonParagraph {
  const paragraph = (entry.json.paragraphs as JsonParagraph[])[index]
  if (!paragraph) throw new Error(`fixture 没有第 ${index} 段`)
  return paragraph
}

function collect(entry: FixtureEntry, paragraphIndex: number, needle: string): string {
  const paragraph = paragraphAt(entry, paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) throw new Error(`第 ${paragraphIndex} 段没有 ${needle}`)
  const sentenceOrdinal = paragraph.sentences.findIndex(
    (sentence) => sentence.start <= start && start < sentence.end
  )
  const result = collectSelection(database, {
    articleId: entry.id,
    paragraphId: paragraph.id,
    sentenceOrdinal,
    start,
    end: start + needle.length
  })
  if (result.status === 'rejected') throw new Error(`收 ${needle} 被拒绝：${result.reason}`)
  return result.entry.id
}

/** 真实「存为文章」路径：组词线程 → 提问 → 回答落库 → 保存生成文章。 */
function saveAiArticle(body: string): void {
  const created = createGroupThread(database, { entryIds: [approachEntryId, contextEntryId] })
  if (created.status !== 'created') throw new Error('组词线程没建起来')
  const asked = askQuestion(database, {
    threadId: created.thread.id,
    text: '用这些词写一篇短文。'
  })
  if (asked.status !== 'asked') throw new Error('提问没写进去')
  const saved = saveAnswer(database, {
    threadId: created.thread.id,
    questionId: asked.questionId,
    text: body,
    thinking: '',
    phase: 'done'
  })
  if (saved.status !== 'saved') throw new Error('回答没保存')
  const answerId = readThreadView(database, created.thread.id)?.turns[0]?.answer?.id
  if (!answerId) throw new Error('线程里没有回答')
  const result = saveGeneratedArticle(database, { threadId: created.thread.id, answerId })
  if (result.status !== 'saved') throw new Error(`存为文章失败：${result.status}`)
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-global-search-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [article])
  importCorpus(database, { directory })
  approachEntryId = collect(article, 0, 'approach')
  contextEntryId = collect(article, 1, 'Context')
  createLearningNote(database, {
    entryId: approachEntryId,
    body: '记：approach 是「做法、途径」。'
  })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('searchEverything', () => {
  it('空查询没有结果，两个分组都在', () => {
    expect(searchEverything(database, '   ')).toEqual({
      query: '',
      entries: [],
      articles: []
    })
  })

  it('词条按主词形、已收原句、学习内容命中，带回类型、真实片段与定位 id', () => {
    const mainForm = searchEverything(database, 'Context')
    expect(mainForm.entries).toHaveLength(1)
    expect(mainForm.entries[0]).toMatchObject({
      entryId: contextEntryId,
      mainForm: 'Context',
      hit: {
        match: 'main-form',
        entryId: contextEntryId,
        entrySentenceId: null,
        noteId: null
      }
    })
    expect(mainForm.entries[0]?.hit.snippet.ranges).toEqual([{ start: 0, end: 7 }])

    const sentence = searchEverything(database, 'hiring')
    expect(sentence.entries).toHaveLength(1)
    expect(sentence.entries[0]).toMatchObject({
      entryId: approachEntryId,
      mainForm: 'approach',
      hit: { match: 'sentence' }
    })
    expect(sentence.entries[0]?.hit.snippet.text).toContain('Employers approach hiring differently.')
    expect(sentence.entries[0]?.hit.snippet.ranges).toHaveLength(1)
    expect(sentence.entries[0]?.hit.entrySentenceId).not.toBeNull()

    const note = searchEverything(database, '途径')
    expect(note.entries).toHaveLength(1)
    expect(note.entries[0]).toMatchObject({
      entryId: approachEntryId,
      mainForm: 'approach',
      hit: { match: 'learning-note' }
    })
    expect(note.entries[0]?.hit.noteId).not.toBeNull()
    expect(note.entries[0]?.hit.snippet.ranges).toEqual([{ start: 16, end: 18 }])
  })

  it('文章篇名命中给出片段高亮，没有正文定位', () => {
    const result = searchEverything(database, 'Passage')
    expect(result.articles).toHaveLength(1)
    const hit = result.articles[0]
    expect(hit?.match).toBe('title')
    expect(hit?.article.id).toBe(article.id)
    expect(hit?.paragraphId).toBeNull()
    expect(hit?.sentenceOrdinal).toBeNull()
    expect(hit?.snippet.text).toBe('2026年6月 · 第1套 · 仔细阅读 Passage One')
    expect(hit?.snippet.ranges).toEqual([{ start: 21, end: 28 }])
  })

  it('文章正文命中落到真实段落与句序，片段取自那一句并高亮关键词', () => {
    const result = searchEverything(database, 'zebra')
    expect(result.articles).toHaveLength(1)
    const hit = result.articles[0]
    expect(hit?.match).toBe('body')
    expect(hit?.paragraphId).toBe('2')
    expect(hit?.sentenceOrdinal).toBe(1)
    expect(hit?.snippet.text).toContain('A zebra never appears in the corpus.')
    expect(hit?.snippet.ranges).toEqual([{ start: 2, end: 7 }])
    // 未收集过的普通句只有文章组，不是词条命中。
    expect(result.entries).toHaveLength(0)
  })

  it('生成文章正文也参与文章组，命中句定位到生成文章的段与句', () => {
    saveAiArticle(
      'Approach shapes how we read. Context keeps the meaning alive.\n\n' +
        'A second paragraph follows here. The luminous lantern marks this line.'
    )

    const result = searchEverything(database, 'luminous')
    expect(result.articles).toHaveLength(1)
    const hit = result.articles[0]
    expect(hit?.match).toBe('body')
    expect(hit?.article.sourceType).toBe('ai')
    expect(hit?.paragraphId).toBe('g2')
    expect(hit?.sentenceOrdinal).toBe(1)
    expect(hit?.snippet.text).toBe('The luminous lantern marks this line.')
    expect(hit?.snippet.ranges).toEqual([{ start: 4, end: 12 }])
  })

  it('没有命中时两个分组都是空', () => {
    expect(searchEverything(database, 'zzzz-not-there')).toEqual({
      query: 'zzzz-not-there',
      entries: [],
      articles: []
    })
  })
})
