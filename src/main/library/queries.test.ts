import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixtureArticle, writeCorpusDirectory } from '../../testing/corpus-fixture'
import { importCorpus } from '../corpus/import'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import {
  openArticle,
  readArticleDetail,
  readHomeSummary,
  readLibrary,
  searchLibrary
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
  sentences: [['Employers approach hiring differently.', 'Skills matter more than degrees.']]
})

const olderReading = fixtureArticle({
  id: 'fixture-2023-12-s1-c1',
  year: 2023,
  month: 12,
  set: 1,
  sentences: [['Old passages still repay a visit.', 'Review begins with the sentence.']]
})

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-library-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  writeCorpusDirectory(directory, [carefulReading, longMatch, olderReading])
  importCorpus(database, { directory })
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('readLibrary', () => {
  it('按场次从新到旧分组，未读的按库内顺序排', () => {
    const listing = readLibrary(database)

    expect(listing.articleCount).toBe(3)
    expect(listing.sessionCount).toBe(2)
    expect(listing.sessions.map((session) => session.label)).toEqual(['2024年6月', '2023年12月'])
    expect(listing.sessions[0]?.articles.map((article) => article.title)).toEqual([
      '2024年6月 · 第1套 · 仔细阅读 Passage One',
      '2024年6月 · 第2套 · 长篇匹配'
    ])
    expect(listing.sessions[0]?.articles[0]).toMatchObject({
      kind: 'careful_reading',
      kindLabel: '仔细阅读 Passage One',
      setLabel: '第1套',
      wordCount: 19,
      progress: { state: 'unread', percent: 0 },
      lastOpenedAt: null
    })
  })

  it('打开过的文章排到本场次前面并带上进度', () => {
    openArticle(database, olderReading.id, { now: '2026-11-18T08:00:00.000Z' })
    openArticle(database, longMatch.id, { now: '2026-11-18T09:00:00.000Z' })

    const listing = readLibrary(database)

    expect(listing.sessions.map((session) => session.label)).toEqual(['2024年6月', '2023年12月'])
    expect(listing.sessions[0]?.articles.map((article) => article.id)).toEqual([
      longMatch.id,
      carefulReading.id
    ])
    expect(listing.sessions[0]?.articles[0]?.progress).toEqual({ state: 'reading', percent: 50 })
    expect(listing.sessions[1]?.articles[0]?.progress).toEqual({ state: 'reading', percent: 50 })
  })
})

describe('openArticle', () => {
  it('首次打开停到第一句，再次打开不把位置重置回开头', () => {
    expect(openArticle(database, carefulReading.id, { now: '2026-11-18T08:00:00.000Z' })).toEqual({
      opened: true
    })
    expect(readHomeSummary(database).continueReading?.lastReadPoint).toMatchObject({
      paragraphId: '1',
      paragraphOrdinal: 1,
      sentenceOrdinal: 1,
      sentenceText: 'Reading widely makes hard sentences easier.'
    })

    database
      .prepare('UPDATE article SET last_paragraph_id = ?, last_sentence_index = ? WHERE id = ?')
      .run('2', 0, carefulReading.id)
    openArticle(database, carefulReading.id, { now: '2026-11-18T09:00:00.000Z' })

    expect(readHomeSummary(database).continueReading?.lastReadPoint).toMatchObject({
      paragraphId: '2',
      paragraphOrdinal: 2,
      sentenceOrdinal: 1
    })
    expect(readHomeSummary(database).continueReading?.article.lastOpenedAt).toBe(
      '2026-11-18T09:00:00.000Z'
    )
  })

  it('文章不存在时不动库', () => {
    expect(openArticle(database, 'nope')).toEqual({ opened: false })
    expect(readHomeSummary(database).continueReading).toBeNull()
  })
})

describe('readArticleDetail', () => {
  it('给出字数、页与段落句数', () => {
    const detail = readArticleDetail(database, carefulReading.id)

    expect(detail).toMatchObject({
      id: carefulReading.id,
      paragraphCount: 2,
      sentenceCount: 3,
      pages: '第 1–2 页'
    })
  })

  it('查不到时返回 null', () => {
    expect(readArticleDetail(database, 'nope')).toBeNull()
  })
})

describe('searchLibrary', () => {
  it('命中篇名时按篇名返回', () => {
    const results = searchLibrary(database, '长篇匹配')

    expect(results.query).toBe('长篇匹配')
    expect(results.results).toHaveLength(1)
    expect(results.results[0]).toMatchObject({
      matched: 'title',
      snippet: '2024年6月 · 第2套 · 长篇匹配',
      article: { id: longMatch.id }
    })
  })

  it('命中正文时截出前后文，大小写不敏感', () => {
    const results = searchLibrary(database, 'context')

    expect(results.results).toHaveLength(1)
    expect(results.results[0]).toMatchObject({ matched: 'body', article: { id: carefulReading.id } })
    expect(results.results[0]?.snippet).toContain('Context carries most of the meaning.')
  })

  it('空查询与没命中都返回空结果，通配符按字面处理', () => {
    expect(searchLibrary(database, '   ').results).toEqual([])
    expect(searchLibrary(database, 'zebra crossing').results).toEqual([])
    expect(searchLibrary(database, '%').results).toEqual([])
  })
})

describe('readHomeSummary', () => {
  it('还没有读过任何一篇时没有继续阅读，但给出文章库规模', () => {
    expect(readHomeSummary(database)).toEqual({
      library: { articleCount: 3, sessionCount: 2 },
      continueReading: null,
      recentEntries: [],
      laterEntries: []
    })
  })

  it('继续阅读指向最近打开的一篇', () => {
    openArticle(database, olderReading.id, { now: '2026-11-18T08:00:00.000Z' })
    openArticle(database, carefulReading.id, { now: '2026-11-18T09:00:00.000Z' })

    const summary = readHomeSummary(database)

    expect(summary.continueReading?.article.id).toBe(carefulReading.id)
    expect(summary.continueReading?.article.progress).toEqual({ state: 'reading', percent: 33 })
    expect(summary.continueReading?.lastReadPoint?.sentenceText).toBe(
      'Reading widely makes hard sentences easier.'
    )
  })
})
