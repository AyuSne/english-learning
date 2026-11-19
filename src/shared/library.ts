/**
 * 文章库与首页「继续阅读」的跨层类型。渲染层只读这些结构，不自己拼 SQL。
 */

export type ArticleKind = 'long_match' | 'careful_reading'

/**
 * 阅读进度：没打开过是 unread；打开过就按已到的句子算百分比。
 * 「已读完」要等阅读页把「进入本篇选词」写进库才算数，这里先只有两态。
 */
export type ReadingProgress = {
  state: 'unread' | 'reading'
  /** 0–99；unread 时为 0。 */
  percent: number
}

export type LibraryArticle = {
  id: string
  /** 完整篇名，形如「2024年6月 · 第1套 · 仔细阅读 Passage One」。 */
  title: string
  kind: ArticleKind
  /** 题型文字：长篇匹配 / 仔细阅读 Passage One / 仔细阅读 Passage Two。 */
  kindLabel: string
  sessionLabel: string
  setLabel: string
  wordCount: number
  progress: ReadingProgress
  /** ISO 8601 UTC，形如 2026-11-18T08:00:00.000Z。 */
  lastOpenedAt: string | null
}

export type LibrarySession = {
  /** 场次键，形如 2024-06。 */
  id: string
  label: string
  articles: LibraryArticle[]
}

export type LibrarySize = {
  articleCount: number
  sessionCount: number
}

export type LibraryListing = LibrarySize & {
  sessions: LibrarySession[]
}

export type LibrarySearchResult = {
  article: LibraryArticle
  matched: 'title' | 'body'
  /** 命中处前后一小段正文；命中篇名时就是篇名。 */
  snippet: string
}

export type LibrarySearchResults = {
  query: string
  results: LibrarySearchResult[]
}

export type ArticleDetail = LibraryArticle & {
  paragraphCount: number
  sentenceCount: number
  /** 这一篇收下的不同词条数（不是原句条数）。 */
  wordEntryCount: number
  /** 这一篇收下的原句条数。 */
  collectedSentenceCount: number
  /** 形如「第 7–8 页」；没有页码时为空串。 */
  pages: string
}

/** 上次停下的那一句：段与句都从 1 数，方便直接写进界面。 */
export type ReadingPoint = {
  paragraphId: string
  paragraphOrdinal: number
  sentenceOrdinal: number
  sentenceText: string
}

export type ContinueReading = {
  article: LibraryArticle
  lastReadPoint: ReadingPoint | null
}

export type HomeSummary = {
  library: LibrarySize
  continueReading: ContinueReading | null
}

export type ImportFailure = {
  id: string
  reason: string
}

/**
 * 一次语料导入的结果。失败项逐条带原因，界面据此提示，不静默跳过。
 */
export type ImportReport = {
  total: number
  imported: number
  updated: number
  skipped: number
  failed: readonly ImportFailure[]
}
