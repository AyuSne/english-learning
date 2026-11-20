import type { EntrySearchHit } from './entries'
import type { LibraryArticle } from './library'
import type { SearchSnippet } from './search'

/**
 * 全局搜索（#55）的跨层契约：同一个查询同时搜词条与文章，结果按「词条 / 文章」两组返回。
 *
 * 命中片段与关键词区间复用 `shared/search.ts` 的 `SearchSnippet`，界面只按区间切 `<mark>`，
 * 不再各写一套高亮规则；词条命中复用词条页的 `EntrySearchHit`，文章命中另行带上
 * 段落与句序，阅读页据此滚到真实句子并高亮。
 */

/** 一条词条命中：词条本身 + 为什么命中（类型、片段、定位 id）。 */
export type GlobalEntryResult = {
  entryId: string
  mainForm: string
  hit: EntrySearchHit
}

/**
 * 一条文章命中。篇名命中时没有正文位置；正文命中带回真实段落与段内句序（0 起），
 * 按句定位不到（查询跨句）时 `sentenceOrdinal` 为 null，只落到段落。
 */
export type GlobalArticleResult = {
  article: LibraryArticle
  match: 'title' | 'body'
  snippet: SearchSnippet
  /** 命中处所在段落 id；篇名命中或正文里找不到段落时为 null。 */
  paragraphId: string | null
  /** 命中处所在句的段内句序，0 起；只落到段落时为 null。 */
  sentenceOrdinal: number | null
}

/** 一次全局搜索的结果；`query` 是去掉首尾空白后的查询。 */
export type GlobalSearchResults = {
  query: string
  entries: GlobalEntryResult[]
  articles: GlobalArticleResult[]
}
