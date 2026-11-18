import Database from 'better-sqlite3'
import type { DictionaryEntry, DictionaryLookup } from '../../shared/dictionary'
import { cleanPhonetic, parseForms, parseSenses } from './entry'

/**
 * 内置离线词典。数据库随包分发、只读打开，查询不联网也不调用模型：
 * 先按词形精确查，再按 ECDICT 的 lemma 表回退到原形，都没有就是「没收录」。
 */

export type Dictionary = {
  lookup(surface: string): DictionaryLookup
  /**
   * 词形归并用的键：原形给自己，词形变化回原形，查不到给 null。
   * 选词时不另写词形还原，直接用 ECDICT 的 exchange 与 lemma。
   */
  lemmaOf(surface: string): string | null
  close(): void
}

type EntryRow = {
  word: string
  phonetic: string
  translation: string
  exchange: string
}

/**
 * 把圈下的原样词形收成查词键：统一小写、弯引号改直引号、压缩空白、去掉首尾标点。
 * 短语保留词间空格，不拆词。
 */
export function normalizeQuery(surface: string): string {
  return surface
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim()
    .toLowerCase()
}

function toEntry(row: EntryRow): DictionaryEntry {
  return {
    word: row.word.toLowerCase(),
    phonetic: cleanPhonetic(row.phonetic),
    senses: parseSenses(row.translation),
    forms: parseForms(row.exchange, row.word)
  }
}

/**
 * 打开随包词典；文件缺失或表结构不对时返回 null，由调用方换成
 * `missingDictionary()`，让界面还能照常运行并明说词典不可用。
 */
export function openDictionary(file: string): Dictionary | null {
  let database: Database.Database
  let entryStatement: Database.Statement<[string], EntryRow>
  let lemmaStatement: Database.Statement<[string], { lemma: string }>

  try {
    database = new Database(file, { readonly: true, fileMustExist: true })
    entryStatement = database.prepare<[string], EntryRow>(
      'SELECT word, phonetic, translation, exchange FROM entry WHERE key = ?'
    )
    lemmaStatement = database.prepare<[string], { lemma: string }>(
      'SELECT lemma FROM lemma WHERE form = ?'
    )
  } catch {
    return null
  }

  return {
    lookup(surface: string): DictionaryLookup {
      const query = normalizeQuery(surface)
      if (query === '') {
        return { status: 'missing', query }
      }

      const exact = entryStatement.get(query)
      if (exact !== undefined) {
        return { status: 'found', query, via: 'exact', entry: toEntry(exact) }
      }

      const lemma = lemmaStatement.get(query)
      if (lemma !== undefined) {
        const base = entryStatement.get(lemma.lemma)
        if (base !== undefined) {
          return { status: 'found', query, via: 'lemma', entry: toEntry(base) }
        }
      }

      return { status: 'missing', query }
    },

    lemmaOf(surface: string): string | null {
      const query = normalizeQuery(surface)
      if (query === '') return null

      const exact = entryStatement.get(query)
      if (exact !== undefined) {
        return exact.word.toLowerCase()
      }

      const lemma = lemmaStatement.get(query)
      if (lemma === undefined || entryStatement.get(lemma.lemma) === undefined) {
        return null
      }
      return lemma.lemma
    },

    close(): void {
      database.close()
    }
  }
}

/** 词典没有随包加载时的替身：照常回答，但明说查不了。 */
export function missingDictionary(): Dictionary {
  return {
    lookup(surface: string): DictionaryLookup {
      return { status: 'unavailable', query: normalizeQuery(surface) }
    },
    lemmaOf(): null {
      return null
    },
    close(): void {
      // 没有打开的库。
    }
  }
}
