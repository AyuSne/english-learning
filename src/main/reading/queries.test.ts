import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtureArticle, writeCorpusDirectory } from '../../testing/corpus-fixture'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { writeSetting } from '../db/settings'
import { readHomeSummary } from '../library/queries'
import {
  openReadingView,
  readReadingPreferences,
  readReadingSettings,
  readReadingView,
  saveReadingPoint,
  saveReadingSettings
} from './queries'

let directory: string
let database: AppDatabase

const carefulReading = fixtureArticle({
  id: 'fixture-2024-06-s1-c1',
  year: 2024,
  month: 6,
  set: 1,
  sentences: [
    ['Reading widely makes hard sentences easier.', 'Context carries most of the meaning.'],
    ['A steady habit keeps the reading going.']
  ],
  annotations: [{ surface: 'Context', gloss: '语境', paragraph: 0, sentence: 1 }]
})

const longMatch = fixtureArticle({
  id: 'fixture-2024-06-s2-b',
  year: 2024,
  month: 6,
  set: 2,
  kind: 'long_match',
  sentences: [
    ['Employers approach hiring differently.', 'Skills matter more than degrees.'],
    ['Practice interviews keep nerves steady.']
  ]
})

const olderReading = fixtureArticle({
  id: 'fixture-2023-12-s1-c1',
  year: 2023,
  month: 12,
  set: 1,
  sentences: [['Old passages still repay a visit.', 'Review begins with the sentence.']]
})

// 段落 id 不是字母的长篇匹配：段首字母按段序补，超过 P 的段不编号。
const numericLongMatch = fixtureArticle({
  id: 'fixture-2024-06-s3-b',
  year: 2024,
  month: 6,
  set: 3,
  kind: 'long_match',
  sentences: Array.from({ length: 17 }, (_value, index) => [
    `Numeric paragraph ${index + 1} keeps its place in the passage.`
  ])
})
numericLongMatch.json.paragraphs = (
  numericLongMatch.json.paragraphs as { id: string }[]
).map((paragraph, index) => ({ ...paragraph, id: String(index + 1) }))

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-reading-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [carefulReading, longMatch, olderReading, numericLongMatch])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('readReadingPreferences', () => {
  it('没设置过时用产品说明里的默认值', () => {
    expect(readReadingPreferences(database)).toEqual({
      fontSize: 20,
      lineHeight: 1.8,
      annotationsVisible: true
    })
  })

  it('读全局设置，无法识别的值逐项回落到默认', () => {
    writeSetting(database, 'reading.fontSize', '22')
    writeSetting(database, 'reading.lineHeight', '2')
    writeSetting(database, 'reading.annotationsVisible', '0')

    expect(readReadingPreferences(database)).toEqual({
      fontSize: 22,
      lineHeight: 2,
      annotationsVisible: false
    })

    writeSetting(database, 'reading.fontSize', '17')
    writeSetting(database, 'reading.lineHeight', '1.7')
    writeSetting(database, 'reading.annotationsVisible', '或许')

    expect(readReadingPreferences(database)).toEqual({
      fontSize: 20,
      lineHeight: 1.8,
      annotationsVisible: true
    })
  })
})

describe('readReadingSettings', () => {
  it('没单独设过时整份来自全局', () => {
    expect(readReadingSettings(database, carefulReading.id)).toEqual({
      fontSize: 20,
      lineHeight: 1.8,
      annotationsVisible: true,
      source: 'global'
    })
  })

  it('文章不存在时返回 null', () => {
    expect(readReadingSettings(database, 'nope')).toBeNull()
  })
})

describe('saveReadingSettings', () => {
  it('只改这一篇，下一篇文章仍用全局默认，全局本身不动', () => {
    const result = saveReadingSettings(database, {
      articleId: carefulReading.id,
      preferences: { fontSize: 16, lineHeight: 2, annotationsVisible: false }
    })

    expect(result).toEqual({
      saved: true,
      settings: {
        fontSize: 16,
        lineHeight: 2,
        annotationsVisible: false,
        source: 'article'
      }
    })
    expect(readReadingSettings(database, carefulReading.id)).toMatchObject({
      fontSize: 16,
      lineHeight: 2,
      annotationsVisible: false,
      source: 'article'
    })
    expect(readReadingSettings(database, olderReading.id)).toMatchObject({
      fontSize: 20,
      lineHeight: 1.8,
      annotationsVisible: true,
      source: 'global'
    })
    expect(readReadingPreferences(database)).toMatchObject({
      fontSize: 20,
      lineHeight: 1.8,
      annotationsVisible: true
    })
  })

  it('再次保存覆盖本篇的值', () => {
    saveReadingSettings(database, {
      articleId: carefulReading.id,
      preferences: { fontSize: 16, lineHeight: 1.6, annotationsVisible: false }
    })

    expect(
      saveReadingSettings(database, {
        articleId: carefulReading.id,
        preferences: { fontSize: 22, lineHeight: 2, annotationsVisible: true }
      })
    ).toMatchObject({
      saved: true,
      settings: { fontSize: 22, lineHeight: 2, annotationsVisible: true, source: 'article' }
    })
  })

  it('不认识的字号或行距不写入，返回当前生效值', () => {
    const result = saveReadingSettings(database, {
      articleId: carefulReading.id,
      preferences: {
        fontSize: 17 as never,
        lineHeight: 1.9 as never,
        annotationsVisible: false
      }
    })

    expect(result).toMatchObject({
      saved: false,
      settings: { fontSize: 20, lineHeight: 1.8, annotationsVisible: true, source: 'global' }
    })
    expect(readReadingSettings(database, carefulReading.id)).toMatchObject({ source: 'global' })
  })

  it('文章不存在时不写入', () => {
    expect(
      saveReadingSettings(database, {
        articleId: 'nope',
        preferences: { fontSize: 22, lineHeight: 2, annotationsVisible: false }
      })
    ).toBeNull()
  })
})

describe('readReadingView', () => {
  it('给出文章、按序段落与句子，长篇匹配带原卷字母，仔细阅读没有字母', () => {
    const longView = readReadingView(database, longMatch.id)
    expect(longView?.article).toMatchObject({ id: longMatch.id, kind: 'long_match' })
    expect(longView?.paragraphs.map((paragraph) => paragraph.ordinal)).toEqual([0, 1])
    expect(longView?.paragraphs.map((paragraph) => paragraph.letter)).toEqual(['A', 'B'])
    expect(longView?.paragraphs[0]?.sentences.map((sentence) => sentence.text)).toEqual([
      'Employers approach hiring differently.',
      'Skills matter more than degrees.'
    ])

    const carefulView = readReadingView(database, carefulReading.id)
    expect(carefulView?.paragraphs.map((paragraph) => paragraph.letter)).toEqual([null, null])
  })

  it('长篇匹配只编 A–P：非字母 id 按段序补，超过 P 的段不再加字母', () => {
    const view = readReadingView(database, numericLongMatch.id)

    expect(view?.paragraphs.map((paragraph) => paragraph.letter)).toEqual([
      ...'ABCDEFGHIJKLMNOP',
      null
    ])
  })

  it('原文注释挂在所属段落，正文本身不含注释文字', () => {
    const view = readReadingView(database, carefulReading.id)

    expect(view?.paragraphs[0]?.annotations).toEqual([
      { surface: 'Context', gloss: '语境', start: 44, end: 51, sentenceOrdinal: 1 }
    ])
    expect(view?.paragraphs[0]?.text).toContain('Context')
    expect(view?.paragraphs[0]?.text).not.toContain('语境')
    expect(view?.paragraphs[0]?.sentences[1]?.text).toBe('Context carries most of the meaning.')
  })

  it('带上本篇生效的阅读设置与上次读到的位置', () => {
    saveReadingSettings(database, {
      articleId: carefulReading.id,
      preferences: { fontSize: 18, lineHeight: 1.6, annotationsVisible: false }
    })

    const view = readReadingView(database, carefulReading.id)

    expect(view?.settings).toMatchObject({
      fontSize: 18,
      lineHeight: 1.6,
      annotationsVisible: false,
      source: 'article'
    })
    expect(view?.readingPoint).toBeNull()
  })

  it('文章不存在时返回 null', () => {
    expect(readReadingView(database, 'nope')).toBeNull()
  })
})

describe('openReadingView', () => {
  it('首次打开停到第一句并记下最近打开', () => {
    const view = openReadingView(database, carefulReading.id, {
      now: '2026-11-18T08:00:00.000Z'
    })

    expect(view?.readingPoint).toMatchObject({
      paragraphId: '1',
      paragraphOrdinal: 1,
      sentenceOrdinal: 1,
      sentenceText: 'Reading widely makes hard sentences easier.'
    })
    expect(view?.article.lastOpenedAt).toBe('2026-11-18T08:00:00.000Z')
  })
})

describe('saveReadingPoint', () => {
  it('记住所在段落与句子，再次打开从那里继续', () => {
    openReadingView(database, carefulReading.id, { now: '2026-11-18T08:00:00.000Z' })

    expect(
      saveReadingPoint(
        database,
        { articleId: carefulReading.id, paragraphId: '2', sentenceOrdinal: 0 },
        { now: '2026-11-18T09:00:00.000Z' }
      )
    ).toEqual({ saved: true })

    const reopened = openReadingView(database, carefulReading.id, {
      now: '2026-11-18T10:00:00.000Z'
    })
    expect(reopened?.readingPoint).toMatchObject({
      paragraphId: '2',
      paragraphOrdinal: 2,
      sentenceOrdinal: 1,
      sentenceText: 'A steady habit keeps the reading going.'
    })
    expect(reopened?.article.lastOpenedAt).toBe('2026-11-18T10:00:00.000Z')
  })

  it('保存后首页的继续阅读跟着更新', () => {
    openReadingView(database, carefulReading.id, { now: '2026-11-18T08:00:00.000Z' })
    saveReadingPoint(
      database,
      { articleId: carefulReading.id, paragraphId: '1', sentenceOrdinal: 1 },
      { now: '2026-11-18T08:05:00.000Z' }
    )

    const summary = readHomeSummary(database)
    expect(summary.continueReading?.lastReadPoint).toMatchObject({
      paragraphOrdinal: 1,
      sentenceOrdinal: 2,
      sentenceText: 'Context carries most of the meaning.'
    })
    expect(summary.continueReading?.article.progress).toEqual({ state: 'reading', percent: 67 })
  })

  it('段落或句子不属于这篇时不写入', () => {
    openReadingView(database, carefulReading.id, { now: '2026-11-18T08:00:00.000Z' })

    expect(
      saveReadingPoint(database, {
        articleId: carefulReading.id,
        paragraphId: 'A',
        sentenceOrdinal: 0
      })
    ).toEqual({ saved: false })
    expect(
      saveReadingPoint(database, {
        articleId: carefulReading.id,
        paragraphId: '1',
        sentenceOrdinal: 9
      })
    ).toEqual({ saved: false })
    expect(
      saveReadingPoint(database, {
        articleId: 'nope',
        paragraphId: '1',
        sentenceOrdinal: 0
      })
    ).toEqual({ saved: false })
    expect(
      saveReadingPoint(database, {
        articleId: carefulReading.id,
        paragraphId: '1',
        sentenceOrdinal: -1
      })
    ).toEqual({ saved: false })
  })
})
