import type { AppDatabase } from '../db/database'
import type { Dictionary } from '../dictionary/dictionary'
import { normalizeQuery } from '../dictionary/dictionary'
import { resolveLemma, type LemmaLexicon } from './lemma'

/**
 * 选词的归一键。装上随包词典后直接用 ECDICT 的 exchange 与 lemma：原形给自己，
 * 词形变化回原形（approached → approach），查不到就退回小写词形比较。
 * 没有传词典时（测试或词典没随包加载）退回原来的词形规则，宁可少并也不并错。
 */

/** 语料全量词形的缓存：文章内容没变就不重复分词。 */
const corpusCache = new WeakMap<AppDatabase, { signature: string; words: Set<string> }>()

function tokenize(text: string): string[] {
  // 词与词之间只按字母数字断；连字符与撇号留在词里（learner's、long-term）。
  return Array.from(
    text.matchAll(/[\p{L}\p{N}]+(?:['’\u2011-][\p{L}\p{N}]+)*/gu),
    (match) => match[0].toLowerCase().replace(/[’‘]/g, "'")
  )
}

/**
 * 本机语料里出现过的全部词形。阅读时圈下的表达一定来自语料，所以这份集合可以
 * 充当“候选原形是否存在”的词库，给没有词典时的规则归并兜底。
 */
function corpusWords(database: AppDatabase): Set<string> {
  const stats = database
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(LENGTH(GROUP_CONCAT(source_sha256, '')), 0) AS hash_length,
              COALESCE(GROUP_CONCAT(source_sha256, ''), '') AS signature
       FROM article`
    )
    .get() as { count: number; hash_length: number; signature: string }
  const signature = `${stats.count}:${stats.hash_length}:${stats.signature}`

  const cached = corpusCache.get(database)
  if (cached?.signature === signature) {
    return cached.words
  }

  const rows = database.prepare('SELECT body_text FROM article').all() as {
    body_text: string
  }[]
  const words = new Set<string>()
  for (const row of rows) {
    for (const word of tokenize(row.body_text)) {
      words.add(word)
    }
  }
  corpusCache.set(database, { signature, words })
  return words
}

/** 规则归并用的词库：本机语料 + 已有词条的键。 */
function lemmaLexicon(database: AppDatabase): LemmaLexicon {
  const words = new Set(corpusWords(database))
  const keys = database
    .prepare('SELECT normalized_key FROM word_entry')
    .all() as { normalized_key: string }[]
  for (const key of keys) {
    words.add(key.normalized_key)
  }
  return { has: (word) => words.has(word) }
}

/**
 * 一个词形落到哪个词条键；选词与「拆到新词条」共用同一套归并。
 * 传了词典就完全按 ECDICT 的 lemma 走，查不到退回小写词形；没传才用规则兜底。
 */
export function resolveEntryKey(
  database: AppDatabase,
  surface: string,
  dictionary?: Dictionary
): string {
  if (dictionary !== undefined) {
    return dictionary.lemmaOf(surface) ?? normalizeQuery(surface)
  }
  return resolveLemma(surface, lemmaLexicon(database))
}
