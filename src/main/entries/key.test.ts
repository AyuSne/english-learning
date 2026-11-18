import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeDictionaryFixture } from '../../testing/dictionary-fixture'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { openDictionary, type Dictionary } from '../dictionary/dictionary'
import { resolveEntryKey } from './key'

/**
 * 选词归并：装了随包词典就完全按 ECDICT 的 lemma 走，不再用 -ed / -ing 之类的规则；
 * 查不到时退回小写词形。没有词典时才用旧规则兜底。
 */

let directory: string
let dictionary: Dictionary
let database: AppDatabase

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'english-learning-entry-key-'))
  const file = join(directory, 'ecdict.db')
  writeDictionaryFixture(file, {
    entries: [
      {
        word: 'drink',
        phonetic: 'drɪŋk',
        translation: 'v. 喝\\nn. 饮料',
        exchange: 'p:drank/d:drunk/i:drinking/3:drinks'
      },
      { word: 'approach', phonetic: "ә'prәutʃ", translation: 'n. 方法' },
      { word: 'approachable', translation: 'adj. 可接近的' },
      { word: 'studied', phonetic: "'stʌdid", translation: 'adj. 有计划的' }
    ],
    lemmas: [
      { form: 'drank', lemma: 'drink' },
      { form: 'drunk', lemma: 'drink' },
      { form: 'approached', lemma: 'approach' },
      { form: 'approaching', lemma: 'approach' }
    ]
  })
  const opened = openDictionary(file)
  if (opened === null) throw new Error('词典 fixture 打不开')
  dictionary = opened

  database = openDatabase(':memory:')
  migrate(database)
})

afterAll(async () => {
  dictionary.close()
  database.close()
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('resolveEntryKey', () => {
  it('装了词典时按 ECDICT 的 lemma 归并，查不到退回小写词形', () => {
    expect(resolveEntryKey(database, 'drank', dictionary)).toBe('drink')
    expect(resolveEntryKey(database, 'Approaching', dictionary)).toBe('approach')
    // 派生词有自己的词条，不并给 approach。
    expect(resolveEntryKey(database, 'approachable', dictionary)).toBe('approachable')
    // 有独立形容词义的 studied 也不并给 study。
    expect(resolveEntryKey(database, 'studied', dictionary)).toBe('studied')
    // 词典没有这个词时只做小写归一，不按词尾硬拆。
    expect(resolveEntryKey(database, '  Never Seen, ', dictionary)).toBe('never seen')
    expect(resolveEntryKey(database, 'take part', dictionary)).toBe('take part')
  })

  it('没装词典时退回原来的词形规则', () => {
    expect(resolveEntryKey(database, 'approached')).toBe('approach')
    expect(resolveEntryKey(database, 'zyzzyva')).toBe('zyzzyva')
  })
})
