import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

/**
 * 测试与 E2E 用的小词典库。形状与随包产物一致：entry 按小写词形查，
 * lemma 只负责把词形变化指回词头。条目与词形映射都由调用方显式给出，
 * 免得测试预期跟着构建规则一起变。
 */

export type DictionaryFixtureEntry = {
  word: string
  phonetic?: string
  translation: string
  exchange?: string
}

export type DictionaryFixtureLemma = {
  form: string
  lemma: string
}

export type DictionaryFixture = {
  entries: DictionaryFixtureEntry[]
  lemmas?: DictionaryFixtureLemma[]
}

/** 按随包词典的表结构写一份 SQLite，供查询模块与 E2E 使用。 */
export function writeDictionaryFixture(file: string, fixture: DictionaryFixture): void {
  mkdirSync(dirname(file), { recursive: true })
  const database = new Database(file)
  database.pragma('journal_mode = OFF')
  database.exec(`
    CREATE TABLE entry (
      key TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      phonetic TEXT NOT NULL,
      translation TEXT NOT NULL,
      exchange TEXT NOT NULL
    );
    CREATE TABLE lemma (
      form TEXT PRIMARY KEY,
      lemma TEXT NOT NULL
    );
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const insertEntry = database.prepare(
    'INSERT INTO entry (key, word, phonetic, translation, exchange) VALUES (?, ?, ?, ?, ?)'
  )
  for (const entry of fixture.entries) {
    insertEntry.run(
      entry.word.toLowerCase(),
      entry.word,
      entry.phonetic ?? '',
      entry.translation,
      entry.exchange ?? ''
    )
  }

  const insertLemma = database.prepare('INSERT OR REPLACE INTO lemma (form, lemma) VALUES (?, ?)')
  for (const lemma of fixture.lemmas ?? []) {
    insertLemma.run(lemma.form.toLowerCase(), lemma.lemma.toLowerCase())
  }

  database
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
    .run('schema_version', '1')

  database.close()
}
