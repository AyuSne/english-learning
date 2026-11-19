import type {
  ArticleWordsEntry,
  ArticleWordsParagraph,
  ArticleWordsView
} from '../../shared/article-words'
import type { EntrySummary } from '../../shared/entries'
import type { AppDatabase } from '../db/database'
import { paragraphLetter } from '../corpus/letter'
import { readArticleDetail } from '../library/queries'
import {
  ENTRY_SENTENCE_COLUMNS,
  ENTRY_SENTENCE_JOINS,
  readEntrySummary,
  toEntrySentence,
  type EntrySentenceRow
} from './queries'

/**
 * 本篇选词：一篇文章里实际收下的词条与原句，按段落与文章顺序分组。
 *
 * 这是纯查询：只读文章信息与原句关联，不写完成时间、阅读位置、最近打开或阅读设置。
 * 「读完了」由单独的显式命令（`reading:complete`）写，界面在进入子视图时先发那条命令、
 * 再读这份视图，所以这里返回的进度就是库里的真实状态，不存在乐观更新。
 * 计数按不同词条算（同一个词条在一篇里出现多段仍是一个），与词条页、文章库详情一致。
 */

type ArticleWordRow = EntrySentenceRow & {
  entry_id: string
}

export function readArticleWords(
  database: AppDatabase,
  articleId: string
): ArticleWordsView | null {
  const article = readArticleDetail(database, articleId)
  if (article === null) {
    return null
  }

  const rows = database
    .prepare(
      `SELECT es.entry_id, ${ENTRY_SENTENCE_COLUMNS}
         FROM entry_sentence es
         ${ENTRY_SENTENCE_JOINS}
        WHERE es.article_id = ?
        ORDER BY p.ordinal, es.sentence_ordinal, es.char_start, es.id`
    )
    .all(articleId) as ArticleWordRow[]

  const summaries = new Map<string, EntrySummary>()
  const paragraphs: ArticleWordsParagraph[] = []
  let paragraph: ArticleWordsParagraph | null = null
  let entriesInParagraph = new Map<string, ArticleWordsEntry>()

  for (const row of rows) {
    const summary = summaries.get(row.entry_id) ?? readEntrySummary(database, row.entry_id)
    if (summary === null) {
      // 词条刚被删掉、文章里的原句关联还没来得及清，就当作没这一条。
      continue
    }
    summaries.set(row.entry_id, summary)

    if (paragraph === null || paragraph.id !== row.paragraph_id) {
      paragraph = {
        id: row.paragraph_id,
        ordinal: row.paragraph_ordinal + 1,
        letter: paragraphLetter(row.article_kind, row.paragraph_id, row.paragraph_ordinal),
        entries: []
      }
      paragraphs.push(paragraph)
      entriesInParagraph = new Map()
    }

    let group = entriesInParagraph.get(row.entry_id)
    if (group === undefined) {
      group = { entry: summary, sentences: [] }
      entriesInParagraph.set(row.entry_id, group)
      paragraph.entries.push(group)
    }
    group.sentences.push(toEntrySentence(row))
  }

  return { article, paragraphs }
}
