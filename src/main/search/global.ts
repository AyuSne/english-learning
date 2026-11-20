import type {
  GlobalArticleResult,
  GlobalEntryResult,
  GlobalSearchResults
} from '../../shared/global-search'
import { buildSearchSnippet } from '../../shared/search'
import type { AppDatabase } from '../db/database'
import { readEntryList } from '../entries/page'
import { readLibraryArticle } from '../library/queries'

/**
 * 全局搜索：一次查询同时给出「词条 / 文章」两组结果。
 *
 * - 词条直接复用词条页的读模型：主词形 > 已收原句 > 学习内容，命中类型、片段、定位 id
 *   与词条页左栏完全一致，不另写一套匹配规则。
 * - 文章篇名与正文都参与；正文命中再落到真实段落与段内句序，阅读页据此滚到命中句
 *   并高亮，未收集过的普通句也一样。生成文章与真题共用 article / paragraph / sentence
 *   表，因此同样参与，不需要单独分支。
 */

type ArticleHitRow = {
  id: string
  title: string
  body_text: string
}

type ParagraphHitRow = {
  id: string
  text: string
}

type SentenceHitRow = {
  text: string
  ordinal: number
}

/** 正文命中落到段落与句：先找第一段含查询，再找该段里第一句含查询。 */
function locateBodyHit(
  database: AppDatabase,
  articleId: string,
  pattern: string
): { paragraphId: string | null; sentenceOrdinal: number | null; snippetText: string | null } {
  const paragraph = database
    .prepare(
      `SELECT id, text FROM paragraph
        WHERE article_id = ? AND instr(lower(text), ?) > 0
        ORDER BY ordinal
        LIMIT 1`
    )
    .get(articleId, pattern) as ParagraphHitRow | undefined
  if (!paragraph) {
    return { paragraphId: null, sentenceOrdinal: null, snippetText: null }
  }

  const sentence = database
    .prepare(
      `SELECT text, ordinal FROM sentence
        WHERE article_id = ? AND paragraph_id = ? AND instr(lower(text), ?) > 0
        ORDER BY ordinal
        LIMIT 1`
    )
    .get(articleId, paragraph.id, pattern) as SentenceHitRow | undefined

  return {
    paragraphId: paragraph.id,
    sentenceOrdinal: sentence?.ordinal ?? null,
    snippetText: sentence?.text ?? paragraph.text
  }
}

export function searchEverything(
  database: AppDatabase,
  rawQuery: string
): GlobalSearchResults {
  const query = rawQuery.trim()
  if (query === '') {
    return { query: '', entries: [], articles: [] }
  }
  const pattern = query.toLowerCase()

  const entries: GlobalEntryResult[] = []
  for (const entry of readEntryList(database, { query }).entries) {
    if (entry.hit === undefined) continue
    entries.push({ entryId: entry.id, mainForm: entry.mainForm, hit: entry.hit })
  }

  const rows = database
    .prepare(
      `SELECT id, title, body_text FROM article
        WHERE instr(lower(title), ?) > 0 OR instr(lower(body_text), ?) > 0
        ORDER BY session_key DESC, ordinal ASC`
    )
    .all(pattern, pattern) as ArticleHitRow[]

  const articles: GlobalArticleResult[] = []
  for (const row of rows) {
    const article = readLibraryArticle(database, row.id)
    if (article === null) continue
    if (row.title.toLowerCase().includes(pattern)) {
      articles.push({
        article,
        match: 'title',
        snippet: buildSearchSnippet(row.title, query),
        paragraphId: null,
        sentenceOrdinal: null
      })
      continue
    }
    const located = locateBodyHit(database, row.id, pattern)
    articles.push({
      article,
      match: 'body',
      snippet: buildSearchSnippet(located.snippetText ?? row.body_text, query),
      paragraphId: located.paragraphId,
      sentenceOrdinal: located.sentenceOrdinal
    })
  }

  return { query, entries, articles }
}
