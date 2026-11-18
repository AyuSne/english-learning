import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  fixtureArticle,
  fixtureManifest,
  writeCorpusDirectory,
  type FixtureEntry
} from '../../testing/corpus-fixture'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { importCorpus } from './import'

let directory: string
let database: AppDatabase

const corpusDirectory = resolve(process.cwd(), 'docs/corpus')

function count(table: 'article' | 'paragraph' | 'sentence' | 'annotation'): number {
  return (database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-corpus-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('importCorpus', () => {
  it('导入首批 63 篇，段落、句子与注释逐条落库', () => {
    const manifest = JSON.parse(
      readFileSync(join(corpusDirectory, 'manifest.json'), 'utf8')
    ) as {
      articles: { stats: { paragraphs: number; sentences: number }; annotations: number }[]
    }
    const expected = manifest.articles.reduce(
      (total, article) => ({
        paragraphs: total.paragraphs + article.stats.paragraphs,
        sentences: total.sentences + article.stats.sentences,
        annotations: total.annotations + article.annotations
      }),
      { paragraphs: 0, sentences: 0, annotations: 0 }
    )

    const report = importCorpus(database, { directory: corpusDirectory })

    expect(report).toMatchObject({ total: 63, imported: 63, updated: 0, skipped: 0 })
    expect(report.failed).toEqual([])
    expect(count('article')).toBe(63)
    expect(count('paragraph')).toBe(expected.paragraphs)
    expect(count('sentence')).toBe(expected.sentences)
    expect(count('annotation')).toBe(expected.annotations)
  })

  it('重复导入不新增副本', () => {
    importCorpus(database, { directory: corpusDirectory })

    const report = importCorpus(database, { directory: corpusDirectory })

    expect(report).toMatchObject({ total: 63, imported: 0, updated: 0, skipped: 63 })
    expect(report.failed).toEqual([])
    expect(count('article')).toBe(63)
  })
})

function validEntry(id: string, options: { sha256?: string; sentences?: string[][] } = {}): FixtureEntry {
  return fixtureArticle({
    id,
    sentences: options.sentences ?? [
      ['Reading widely makes hard sentences easier.', 'Context carries most of the meaning.'],
      ['A second paragraph keeps the habit going.']
    ],
    sha256: options.sha256
  })
}

function brokenEntry(id: string): FixtureEntry {
  const entry = validEntry(id)
  const paragraphs = entry.json.paragraphs as {
    sentences: { text: string }[]
  }[]
  const first = paragraphs[0]?.sentences[0]
  if (!first) {
    throw new Error('fixture 没有句子')
  }
  first.text = 'This sentence no longer matches the stored range.'
  return entry
}

describe('importCorpus 的失败与更新', () => {
  it('单篇坏掉时其余篇照常入库，失败项带原因', () => {
    const good = validEntry('fixture-2024-06-s1-c1')
    const broken = brokenEntry('fixture-2024-06-s1-c2')
    const missingFile = validEntry('fixture-2024-06-s2-c1')
    const manifest = fixtureManifest([good, broken, missingFile])
    writeCorpusDirectory(directory, [good, broken], { manifest })

    const report = importCorpus(database, { directory })

    expect(report.total).toBe(3)
    expect(report.imported).toBe(1)
    expect(report.failed.map((failure) => failure.id)).toEqual([
      broken.id,
      missingFile.id
    ])
    expect(report.failed[0]?.reason).toContain('与正文对不上')
    expect(report.failed[1]?.reason).toContain('读不出来')
    expect(count('article')).toBe(1)
    expect(
      (database.prepare('SELECT COUNT(*) AS n FROM sentence').get() as { n: number }).n
    ).toBe(3)
  })

  it('文章清单坏掉时一条也不导入，并报清单的原因', () => {
    writeCorpusDirectory(directory, [], { manifest: '{ 不是 JSON' })

    const report = importCorpus(database, { directory })

    expect(report).toMatchObject({ total: 0, imported: 0, updated: 0, skipped: 0 })
    expect(report.failed).toHaveLength(1)
    expect(report.failed[0]?.id).toBe('manifest')
    expect(count('article')).toBe(0)
  })

  it('清单里单项不合法时只丢那一条，其余照常导入', () => {
    const first = validEntry('fixture-2024-06-s1-c1')
    const second = validEntry('fixture-2024-06-s1-c2')
    const manifest = fixtureManifest([first, second]) as {
      articles: { sha256: string }[]
    }
    const secondEntry = manifest.articles[1]
    if (!secondEntry) {
      throw new Error('fixture 清单没有第二项')
    }
    secondEntry.sha256 = 'not-a-hash'
    writeCorpusDirectory(directory, [first, second], { manifest })

    const report = importCorpus(database, { directory })

    expect(report).toMatchObject({ total: 2, imported: 1, updated: 0, skipped: 0 })
    expect(report.failed).toEqual([
      { id: second.id, reason: 'fixture-2024-06-s1-c2 的源文件哈希不是 64 位十六进制' }
    ])
    expect(count('article')).toBe(1)
  })

  it('源文件哈希变了就按新内容重写这篇，阅读位置保留且不产生副本', () => {
    const original = validEntry('fixture-2024-06-s1-c1')
    writeCorpusDirectory(directory, [original])
    importCorpus(database, { directory })
    database
      .prepare(
        `UPDATE article SET last_opened_at = ?, last_paragraph_id = ?, last_sentence_index = ?
         WHERE id = ?`
      )
      .run('2026-11-17T02:00:00.000Z', '2', 0, original.id)

    const replaced = fixtureArticle({
      id: original.id,
      sha256: 'f'.repeat(64),
      sentences: [
        ['The source PDF was replaced.', 'Only one paragraph is left.'],
        ['A third sentence arrives.']
      ]
    })
    writeCorpusDirectory(directory, [replaced])

    const report = importCorpus(database, { directory })

    expect(report).toMatchObject({ total: 1, imported: 0, updated: 1, skipped: 0 })
    expect(count('article')).toBe(1)
    expect(
      (database.prepare('SELECT COUNT(*) AS n FROM sentence').get() as { n: number }).n
    ).toBe(3)
    expect(
      database.prepare('SELECT body_text, last_paragraph_id FROM article WHERE id = ?').get(original.id)
    ).toEqual({
      body_text: 'The source PDF was replaced. Only one paragraph is left.\n\nA third sentence arrives.',
      last_paragraph_id: '2'
    })
  })

  it('重写后原来的段落没了，就清空阅读位置', () => {
    const original = validEntry('fixture-2024-06-s1-c1')
    writeCorpusDirectory(directory, [original])
    importCorpus(database, { directory })
    database
      .prepare(
        `UPDATE article SET last_opened_at = ?, last_paragraph_id = ?, last_sentence_index = ?
         WHERE id = ?`
      )
      .run('2026-11-17T02:00:00.000Z', '2', 0, original.id)

    const replaced = fixtureArticle({
      id: original.id,
      sha256: 'e'.repeat(64),
      sentences: [['The replaced source now has a single paragraph.']]
    })
    writeCorpusDirectory(directory, [replaced])

    importCorpus(database, { directory })

    expect(
      database
        .prepare('SELECT last_paragraph_id, last_sentence_index FROM article WHERE id = ?')
        .get(original.id)
    ).toEqual({ last_paragraph_id: null, last_sentence_index: null })
  })
})
