import { randomUUID } from 'node:crypto'
import type {
  CollectSelectionRequest,
  CollectSelectionResult,
  DeleteEntrySentenceResult,
  EntrySentence,
  EntrySummary,
  ReadingCollectionMark,
  WordEntryCard
} from '../../shared/entries'
import type { AppDatabase } from '../db/database'
import { resolveLemma, type LemmaLexicon } from './lemma'

/**
 * 选词的落点与词条卡。这一层只认本机库：选区由渲染层给“段 + 句 + 段内字符区间”，
 * 词形归并交给 resolveLemma，重复圈选按“词条 + 篇 + 段 + 句”去重。
 */

type ArticleRow = { id: string }
type ParagraphRow = { text: string }
type SentenceRangeRow = { char_start: number; char_end: number }
type EntryRow = { id: string }
type StoredSentenceRow = { id: string; entry_id: string; article_id: string }

type EntrySummaryRow = {
  id: string
  main_form: string
  last_collected_at: string
  sentence_count: number
  article_count: number
}

type EntrySentenceRow = {
  id: string
  surface: string
  article_id: string
  article_title: string
  paragraph_id: string
  paragraph_ordinal: number
  sentence_ordinal: number
  sentence_text: string
  char_start: number
  char_end: number
  collected_at: string
}

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
 * 充当“候选原形是否存在”的词库；词典接入后这层仍然有用（语料优先）。
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

/** 归并用的词库：本机语料 + 已有词条的键。 */
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

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character)
}

function readEntrySummary(database: AppDatabase, entryId: string): EntrySummary | null {
  const row = database
    .prepare(
      `SELECT we.id, we.main_form, we.last_collected_at,
              (SELECT COUNT(*) FROM entry_sentence es WHERE es.entry_id = we.id) AS sentence_count,
              (SELECT COUNT(DISTINCT es.article_id) FROM entry_sentence es
                WHERE es.entry_id = we.id) AS article_count
         FROM word_entry we
        WHERE we.id = ?`
    )
    .get(entryId) as EntrySummaryRow | undefined
  if (!row) {
    return null
  }

  const variants = database
    .prepare(
      `SELECT surface FROM entry_sentence
        WHERE entry_id = ?
        GROUP BY surface
        ORDER BY MIN(collected_at), MIN(rowid)`
    )
    .all(entryId) as { surface: string }[]

  return {
    id: row.id,
    mainForm: row.main_form,
    variants: variants
      .map((variant) => variant.surface)
      .filter((surface) => surface !== row.main_form),
    sentenceCount: row.sentence_count,
    articleCount: row.article_count,
    lastCollectedAt: row.last_collected_at
  }
}

function toEntrySentence(row: EntrySentenceRow): EntrySentence {
  return {
    id: row.id,
    surface: row.surface,
    articleId: row.article_id,
    articleTitle: row.article_title,
    paragraphId: row.paragraph_id,
    paragraphOrdinal: row.paragraph_ordinal + 1,
    sentenceOrdinal: row.sentence_ordinal,
    sentenceText: row.sentence_text,
    start: row.char_start,
    end: row.char_end,
    collectedAt: row.collected_at
  }
}

function readEntrySentence(database: AppDatabase, id: string): EntrySentence | null {
  const row = database
    .prepare(
      `SELECT es.id, es.surface, es.article_id, a.title AS article_title, es.paragraph_id,
              p.ordinal AS paragraph_ordinal, es.sentence_ordinal, s.text AS sentence_text,
              es.char_start, es.char_end, es.collected_at
         FROM entry_sentence es
         JOIN article a ON a.id = es.article_id
         JOIN paragraph p
           ON p.article_id = es.article_id AND p.id = es.paragraph_id
         JOIN sentence s
           ON s.article_id = es.article_id
          AND s.paragraph_id = es.paragraph_id
          AND s.ordinal = es.sentence_ordinal
        WHERE es.id = ?`
    )
    .get(id) as EntrySentenceRow | undefined
  return row ? toEntrySentence(row) : null
}

/** 一篇原文里全部已收集标记，按段序、句序、段内位置排。 */
export function readArticleCollections(
  database: AppDatabase,
  articleId: string
): ReadingCollectionMark[] {
  const rows = database
    .prepare(
      `SELECT es.id, es.entry_id, we.main_form, es.surface, es.paragraph_id,
              es.sentence_ordinal, es.char_start, es.char_end
         FROM entry_sentence es
         JOIN word_entry we ON we.id = es.entry_id
         JOIN paragraph p
           ON p.article_id = es.article_id AND p.id = es.paragraph_id
        WHERE es.article_id = ?
        ORDER BY p.ordinal, es.sentence_ordinal, es.char_start, es.id`
    )
    .all(articleId) as {
    id: string
    entry_id: string
    main_form: string
    surface: string
    paragraph_id: string
    sentence_ordinal: number
    char_start: number
    char_end: number
  }[]

  return rows.map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    entryMainForm: row.main_form,
    surface: row.surface,
    paragraphId: row.paragraph_id,
    sentenceOrdinal: row.sentence_ordinal,
    start: row.char_start,
    end: row.char_end
  }))
}

/** 点开一个已收集词时的词条卡；词条不存在时为 null。 */
export function readWordEntryCard(
  database: AppDatabase,
  entryId: string
): WordEntryCard | null {
  const entry = readEntrySummary(database, entryId)
  if (!entry) {
    return null
  }

  const rows = database
    .prepare(
      `SELECT es.id, es.surface, es.article_id, a.title AS article_title, es.paragraph_id,
              p.ordinal AS paragraph_ordinal, es.sentence_ordinal, s.text AS sentence_text,
              es.char_start, es.char_end, es.collected_at
         FROM entry_sentence es
         JOIN article a ON a.id = es.article_id
         JOIN paragraph p
           ON p.article_id = es.article_id AND p.id = es.paragraph_id
         JOIN sentence s
           ON s.article_id = es.article_id
          AND s.paragraph_id = es.paragraph_id
          AND s.ordinal = es.sentence_ordinal
        WHERE es.entry_id = ?
        ORDER BY es.collected_at DESC, es.id DESC`
    )
    .all(entryId) as EntrySentenceRow[]

  return { entry, sentences: rows.map(toEntrySentence) }
}

/**
 * 收下一次选词：找到或建一个词条，再挂上这条原句。同篇同句同一个词条已经收过时
 * 只返回已有的一条，不新增、不累加计数。
 */
export function collectSelection(
  database: AppDatabase,
  request: CollectSelectionRequest,
  options: { now?: string } = {}
): CollectSelectionResult {
  const article = database
    .prepare('SELECT id FROM article WHERE id = ?')
    .get(request.articleId) as ArticleRow | undefined
  if (!article) {
    return { status: 'rejected', reason: 'article' }
  }

  const paragraph = database
    .prepare('SELECT text FROM paragraph WHERE article_id = ? AND id = ?')
    .get(request.articleId, request.paragraphId) as ParagraphRow | undefined
  if (!paragraph) {
    return { status: 'rejected', reason: 'paragraph' }
  }

  const sentence = database
    .prepare(
      `SELECT char_start, char_end FROM sentence
        WHERE article_id = ? AND paragraph_id = ? AND ordinal = ?`
    )
    .get(request.articleId, request.paragraphId, request.sentenceOrdinal) as
    | SentenceRangeRow
    | undefined
  if (!sentence) {
    return { status: 'rejected', reason: 'sentence' }
  }

  if (!Number.isInteger(request.start) || !Number.isInteger(request.end)) {
    return { status: 'rejected', reason: 'range' }
  }
  if (request.start < sentence.char_start || request.start >= sentence.char_end) {
    return { status: 'rejected', reason: 'range' }
  }
  if (request.end > sentence.char_end) {
    return { status: 'rejected', reason: 'range' }
  }
  if (request.end === request.start) {
    return { status: 'rejected', reason: 'empty' }
  }
  if (request.end < request.start) {
    return { status: 'rejected', reason: 'range' }
  }

  const text = paragraph.text
  let start = request.start
  let end = request.end
  while (start < end && isWhitespace(text[start])) {
    start += 1
  }
  while (end > start && isWhitespace(text[end - 1])) {
    end -= 1
  }
  if (end <= start) {
    return { status: 'rejected', reason: 'empty' }
  }
  const surface = text.slice(start, end)
  // 只圈到标点或空白时不建词条：那不是学习者想收的词或短语。
  if (!/[\p{L}\p{N}]/u.test(surface)) {
    return { status: 'rejected', reason: 'empty' }
  }

  const key = resolveLemma(surface, lemmaLexicon(database))
  const now = options.now ?? new Date().toISOString()

  const stored = database.transaction((): { entryId: string; sentenceId: string; created: boolean } => {
    const existingEntry = database
      .prepare('SELECT id FROM word_entry WHERE normalized_key = ?')
      .get(key) as EntryRow | undefined

    let entryId: string
    if (existingEntry) {
      entryId = existingEntry.id
    } else {
      entryId = randomUUID()
      database
        .prepare(
          `INSERT INTO word_entry (id, main_form, normalized_key, created_at, last_collected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(entryId, surface, key, now, now)
    }

    const duplicate = database
      .prepare(
        `SELECT id FROM entry_sentence
          WHERE entry_id = ? AND article_id = ? AND paragraph_id = ? AND sentence_ordinal = ?`
      )
      .get(entryId, request.articleId, request.paragraphId, request.sentenceOrdinal) as
      | { id: string }
      | undefined
    if (duplicate) {
      return { entryId, sentenceId: duplicate.id, created: false }
    }

    const sentenceId = randomUUID()
    database
      .prepare(
        `INSERT INTO entry_sentence (
           id, entry_id, article_id, paragraph_id, sentence_ordinal,
           surface, char_start, char_end, collected_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        sentenceId,
        entryId,
        request.articleId,
        request.paragraphId,
        request.sentenceOrdinal,
        surface,
        start,
        end,
        now
      )
    database
      .prepare('UPDATE word_entry SET last_collected_at = ? WHERE id = ?')
      .run(now, entryId)
    return { entryId, sentenceId, created: true }
  })()

  const entry = readEntrySummary(database, stored.entryId)
  const entrySentence = readEntrySentence(database, stored.sentenceId)
  if (!entry || !entrySentence) {
    // 事务刚写完就读不到，说明并发删了文章；按拒绝处理，别把半截结果交给界面。
    return { status: 'rejected', reason: 'article' }
  }

  return {
    status: stored.created ? 'collected' : 'duplicate',
    entry,
    sentence: entrySentence,
    marks: readArticleCollections(database, request.articleId)
  }
}

/**
 * 删掉一条原句关联。删的是最后一条时连词条一起删；界面在这之前先提示。
 * 学习内容随词条级联删除的约束等词条页落地时再接。
 */
export function deleteEntrySentence(
  database: AppDatabase,
  entrySentenceId: string
): DeleteEntrySentenceResult {
  const stored = database
    .prepare('SELECT id, entry_id, article_id FROM entry_sentence WHERE id = ?')
    .get(entrySentenceId) as StoredSentenceRow | undefined
  if (!stored) {
    return { status: 'missing' }
  }

  const remaining = database.transaction((): number => {
    database.prepare('DELETE FROM entry_sentence WHERE id = ?').run(entrySentenceId)
    const count = database
      .prepare('SELECT COUNT(*) AS count FROM entry_sentence WHERE entry_id = ?')
      .get(stored.entry_id) as { count: number }
    if (count.count === 0) {
      database.prepare('DELETE FROM word_entry WHERE id = ?').run(stored.entry_id)
    }
    return count.count
  })()

  const entryDeleted = remaining === 0
  return {
    status: 'deleted',
    entryDeleted,
    entry: entryDeleted ? null : readEntrySummary(database, stored.entry_id),
    articleId: stored.article_id,
    marks: readArticleCollections(database, stored.article_id)
  }
}
