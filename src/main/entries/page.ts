import type {
  EntryListItem,
  EntryListRequest,
  EntryListResult,
  EntryPage,
  EntrySentenceGroup
} from '../../shared/entries'
import type { AppDatabase } from '../db/database'
import { readLearningNotes } from './notes'
import {
  ENTRY_SENTENCE_COLUMNS,
  ENTRY_SENTENCE_JOINS,
  readEntrySummary,
  toEntrySentence,
  type EntrySentenceRow
} from './queries'

/**
 * 词条页的读模型：左栏列表与中/右栏的一整页。
 * 列表只给计数，打开某个词条时再取按文章分组的原句与学习内容。
 */

type EntryListRow = {
  id: string
  main_form: string
  last_collected_at: string
  sentence_count: number
  article_count: number
  note_count: number
}

/**
 * 左栏列表。搜索匹配主词形与已收原句正文；`total` 始终是库里的词条总数，
 * 搜索与筛选只改 `entries`。
 */
export function readEntryList(
  database: AppDatabase,
  request: EntryListRequest = {}
): EntryListResult {
  const query = (request.query ?? '').trim().toLowerCase()
  const sort = request.sort === 'alpha' ? 'alpha' : 'recent'
  const filter = request.filter ?? 'all'

  const rows = database
    .prepare(
      `SELECT we.id, we.main_form, we.last_collected_at,
              (SELECT COUNT(*) FROM entry_sentence es WHERE es.entry_id = we.id) AS sentence_count,
              (SELECT COUNT(DISTINCT es.article_id) FROM entry_sentence es
                WHERE es.entry_id = we.id) AS article_count,
              (SELECT COUNT(*) FROM learning_note ln WHERE ln.entry_id = we.id) AS note_count
         FROM word_entry we
        WHERE ? = ''
           OR instr(lower(we.main_form), ?) > 0
           OR EXISTS (
                SELECT 1 FROM entry_sentence es
                  JOIN sentence s
                    ON s.article_id = es.article_id
                   AND s.paragraph_id = es.paragraph_id
                   AND s.ordinal = es.sentence_ordinal
                 WHERE es.entry_id = we.id AND instr(lower(s.text), ?) > 0
              )
        ORDER BY ${
          sort === 'alpha'
            ? 'lower(we.main_form) ASC, we.id ASC'
            : 'we.last_collected_at DESC, we.id DESC'
        }`
    )
    .all(query, query, query) as EntryListRow[]

  const total = (database.prepare('SELECT COUNT(*) AS count FROM word_entry').get() as {
    count: number
  }).count

  const entries: EntryListItem[] = rows
    .filter((row) => {
      if (filter === 'has-notes') return row.note_count > 0
      if (filter === 'no-notes') return row.note_count === 0
      return true
    })
    .map((row) => ({
      id: row.id,
      mainForm: row.main_form,
      sentenceCount: row.sentence_count,
      articleCount: row.article_count,
      noteCount: row.note_count,
      lastCollectedAt: row.last_collected_at
    }))

  return { total, entries }
}

/** 组内按段序、句序排；组与组之间按这一组最新收集的时间倒序。 */
function groupSentences(rows: readonly EntrySentenceRow[]): EntrySentenceGroup[] {
  const groups = new Map<string, EntrySentenceGroup>()
  for (const row of rows) {
    let group = groups.get(row.article_id)
    if (!group) {
      group = {
        articleId: row.article_id,
        articleTitle: row.article_title,
        sessionLabel: row.session_label,
        setLabel: row.set_label,
        latestCollectedAt: row.collected_at,
        sentences: []
      }
      groups.set(row.article_id, group)
    }
    group.sentences.push(toEntrySentence(row))
  }

  const ordered = [...groups.values()]
  for (const group of ordered) {
    group.sentences.sort(
      (left, right) =>
        left.paragraphOrdinal - right.paragraphOrdinal ||
        left.sentenceOrdinal - right.sentenceOrdinal ||
        left.start - right.start ||
        left.id.localeCompare(right.id)
    )
  }
  return ordered
}

/** 词条页的一整页；词条不存在时返回 null。 */
export function readEntryPage(database: AppDatabase, entryId: string): EntryPage | null {
  const entry = readEntrySummary(database, entryId)
  if (!entry) {
    return null
  }

  const rows = database
    .prepare(
      `SELECT ${ENTRY_SENTENCE_COLUMNS}
         FROM entry_sentence es
         ${ENTRY_SENTENCE_JOINS}
        WHERE es.entry_id = ?
        ORDER BY es.collected_at DESC, es.id DESC`
    )
    .all(entryId) as EntrySentenceRow[]

  return { entry, groups: groupSentences(rows), notes: readLearningNotes(database, entryId) }
}
