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
import { readArticleDetail, markArticleCompleted, readReadingPoint } from '../library/queries'
import { readReadingSettings, saveReadingPoint, saveReadingSettings } from '../reading/queries'
import { readArticleWords } from './article-words'
import { collectSelection, readEntrySentence, readEntrySummary } from './queries'

const T0 = '2026-11-18T08:00:00.000Z'
const T1 = '2026-11-18T08:05:00.000Z'

/**
 * 四段：approach 出现在前三段（三种词形，归同一个词条），第三段另收 Context，
 * 第一段第二句收 Practice。于是「不同词条 3 个 / 原句 5 条」，正好检验去重计数。
 */
const carefulReading = fixtureArticle({
  id: 'fixture-2026-06-s1-c1',
  year: 2026,
  month: 6,
  set: 1,
  sentences: [
    ['Employers approach hiring differently.', 'Practice keeps the skill alive.'],
    ['Approaching a new desk takes patience.'],
    ['She approached the counter quietly.', 'Context still carries meaning.'],
    ['Language learners read every day.']
  ]
})

const longMatch = fixtureArticle({
  id: 'fixture-2026-06-s2-b',
  year: 2026,
  month: 6,
  set: 2,
  kind: 'long_match',
  sentences: [
    ['Employers approach hiring differently.'],
    ['Approaching takes patience.']
  ]
})

const untouched = fixtureArticle({
  id: 'fixture-2026-06-s1-c2',
  year: 2026,
  month: 6,
  set: 1,
  label: '2026年6月 · 第1套 · 仔细阅读 Passage Two',
  sentences: [['Nothing has been collected here yet.']]
})

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

function paragraphAt(entry: FixtureEntry, index: number): JsonParagraph {
  return (entry.json.paragraphs as JsonParagraph[])[index] as JsonParagraph
}

function selection(entry: FixtureEntry, paragraphIndex: number, needle: string): CollectSelectionRequest {
  const paragraph = paragraphAt(entry, paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) {
    throw new Error(`fixture ${entry.id}: 第 ${paragraphIndex} 段没有 ${needle}`)
  }
  const sentenceOrdinal = paragraph.sentences.findIndex(
    (sentence) => sentence.start <= start && start < sentence.end
  )
  if (sentenceOrdinal < 0) {
    throw new Error(`fixture ${entry.id}: ${needle} 不在句子里`)
  }
  return {
    articleId: entry.id,
    paragraphId: paragraph.id,
    sentenceOrdinal,
    start,
    end: start + needle.length
  }
}

function collect(
  database: AppDatabase,
  entry: FixtureEntry,
  paragraphIndex: number,
  needle: string,
  now = T0
) {
  const result = collectSelection(database, selection(entry, paragraphIndex, needle), { now })
  if (result.status === 'rejected') {
    throw new Error(`圈 ${needle} 被拒绝：${result.reason}`)
  }
  return result
}

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-article-words-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [carefulReading, longMatch, untouched])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('readArticleWords', () => {
  it('按段落列出本篇收的词条与原句，不同词条数不等于原句数', () => {
    collect(database, carefulReading, 0, 'approach')
    collect(database, carefulReading, 1, 'Approaching', T1)
    collect(database, carefulReading, 0, 'Practice', T1)
    collect(database, carefulReading, 2, 'approached', T1)
    collect(database, carefulReading, 2, 'Context', T1)

    const words = readArticleWords(database, carefulReading.id)

    expect(words).not.toBeNull()
    if (words === null) return
    expect(words.article).toMatchObject({
      id: carefulReading.id,
      wordEntryCount: 3,
      collectedSentenceCount: 5
    })
    expect(words.paragraphs.map((paragraph) => paragraph.ordinal)).toEqual([1, 2, 3])
    expect(
      words.paragraphs.map((paragraph) => paragraph.entries.map((entry) => entry.entry.mainForm))
    ).toEqual([['approach', 'Practice'], ['approach'], ['approach', 'Context']])

    const firstParagraph = words.paragraphs[0]
    expect(firstParagraph?.letter).toBeNull()
    expect(firstParagraph?.entries[0]?.sentences.map((sentence) => sentence.sentenceText)).toEqual([
      'Employers approach hiring differently.'
    ])
    expect(firstParagraph?.entries[1]?.sentences.map((sentence) => sentence.sentenceText)).toEqual([
      'Practice keeps the skill alive.'
    ])
    expect(words.paragraphs[1]?.entries[0]?.sentences.map((sentence) => sentence.surface)).toEqual([
      'Approaching'
    ])
    expect(words.paragraphs[2]?.entries[0]?.sentences.map((sentence) => sentence.surface)).toEqual([
      'approached'
    ])

    // 和词条页读的是同一份模型：同一个词条、同一条原句不能拼出另一套字段。
    const approachId = firstParagraph?.entries[0]?.entry.id
    expect(approachId).toBeDefined()
    if (approachId === undefined) return
    expect(firstParagraph?.entries[0]?.entry).toEqual(readEntrySummary(database, approachId))
    const sentenceId = firstParagraph?.entries[0]?.sentences[0]?.id
    expect(sentenceId).toBeDefined()
    if (sentenceId === undefined) return
    expect(firstParagraph?.entries[0]?.sentences[0]).toEqual(
      readEntrySentence(database, sentenceId)
    )
  })

  it('长篇匹配带上原卷段落字母；同一个词条跨篇时只算本篇的原句', () => {
    collect(database, carefulReading, 0, 'approach')
    collect(database, longMatch, 0, 'approach', T1)
    collect(database, longMatch, 1, 'Approaching', T1)

    const words = readArticleWords(database, longMatch.id)

    expect(words).not.toBeNull()
    if (words === null) return
    expect(words.paragraphs.map((paragraph) => paragraph.letter)).toEqual(['A', 'B'])
    expect(words.article.wordEntryCount).toBe(1)
    expect(words.article.collectedSentenceCount).toBe(2)
    expect(words.paragraphs[0]?.entries[0]?.sentences).toHaveLength(1)
    // 词条本身仍保留全库计数：它同时来自两篇。
    expect(words.paragraphs[0]?.entries[0]?.entry).toMatchObject({
      mainForm: 'approach',
      sentenceCount: 3,
      articleCount: 2
    })
  })

  it('本篇选词是只读查询：不写完成时间，也不改阅读位置、最近打开与本篇阅读设置', () => {
    collect(database, carefulReading, 0, 'approach')
    const secondParagraph = paragraphAt(carefulReading, 1)
    saveReadingPoint(
      database,
      { articleId: carefulReading.id, paragraphId: secondParagraph.id, sentenceOrdinal: 0 },
      { now: T1 }
    )
    saveReadingSettings(database, {
      articleId: carefulReading.id,
      preferences: {
        fontSize: 22,
        lineHeight: 2,
        annotationsVisible: false,
        weakHighlight: false
      }
    })
    const articleBefore = database
      .prepare(
        `SELECT completed_at, last_paragraph_id, last_sentence_index, last_opened_at
           FROM article WHERE id = ?`
      )
      .get(carefulReading.id)
    const pointBefore = readReadingPoint(database, carefulReading.id)
    const settingsBefore = readReadingSettings(database, carefulReading.id)

    const words = readArticleWords(database, carefulReading.id)

    expect(words).not.toBeNull()
    if (words === null) return
    // 查询只返回库里已有的进度，读没读完仍由显式命令决定。
    expect(words.article.progress.state).not.toBe('completed')
    expect(readArticleDetail(database, carefulReading.id)?.progress.state).not.toBe('completed')
    expect(
      database
        .prepare(
          `SELECT completed_at, last_paragraph_id, last_sentence_index, last_opened_at
             FROM article WHERE id = ?`
        )
        .get(carefulReading.id)
    ).toEqual(articleBefore)
    expect(readReadingPoint(database, carefulReading.id)).toEqual(pointBefore)
    expect(readReadingSettings(database, carefulReading.id)).toEqual(settingsBefore)
  })

  it('读完只由显式命令写：查询不写，命令只写一次，之后的查询读到同一份状态', () => {
    collect(database, carefulReading, 0, 'approach')

    // 反复打开子视图也不会偷偷写完成时间。
    readArticleWords(database, carefulReading.id)
    readArticleWords(database, carefulReading.id)
    expect(
      database
        .prepare('SELECT completed_at FROM article WHERE id = ?')
        .get(carefulReading.id)
    ).toEqual({ completed_at: null })

    const first = markArticleCompleted(database, carefulReading.id, { now: T0 })
    expect(first).toMatchObject({ status: 'completed', changed: true, completedAt: T0 })
    const second = markArticleCompleted(database, carefulReading.id, { now: T1 })
    expect(second).toMatchObject({ status: 'completed', changed: false, completedAt: T0 })

    const words = readArticleWords(database, carefulReading.id)
    expect(words?.article.progress).toEqual({ state: 'completed', percent: 100 })
    expect(
      database
        .prepare('SELECT completed_at FROM article WHERE id = ?')
        .get(carefulReading.id)
    ).toEqual({ completed_at: T0 })
  })

  it('本篇还没收词时给空段落列表', () => {
    const words = readArticleWords(database, untouched.id)

    expect(words).not.toBeNull()
    if (words === null) return
    expect(words.article).toMatchObject({ id: untouched.id, wordEntryCount: 0, collectedSentenceCount: 0 })
    expect(words.paragraphs).toEqual([])
  })

  it('文章不存在时返回 null', () => {
    expect(readArticleWords(database, 'nope')).toBeNull()
  })
})
