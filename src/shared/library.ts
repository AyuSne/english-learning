/**
 * 文章库与首页「继续阅读」的跨层类型。渲染层只读这些结构，不自己拼 SQL。
 */

export type ArticleKind = 'long_match' | 'careful_reading'

/**
 * 阅读进度：没打开过是 unread；打开过就按已到的句子算百分比；进入「本篇选词」
 * 就算读完，给 completed 与 100%。读到末句也只停在 99%——「读完」只由那一个入口写。
 */
export type ReadingProgress = {
  state: 'unread' | 'reading' | 'completed'
  /** 0–100；unread 时为 0，reading 为 1–99，completed 为 100。 */
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

/**
 * 删除一篇文章前的影响面。原句数指该篇的 entry_sentence 关联条数；
 * 受影响词条按去重后的词条计，并区分删完仍有其他原句的与真正会消失的。
 * 只有会消失的词条才连带删除学习内容；挂在本篇的钉住全部保留为未归档。
 */
export type ArticleDeletionPreview = {
  articleId: string
  /** 该篇的已收集原句关联条数。 */
  sentenceAssociationCount: number
  /** 这些原句涉及的、去重后的词条总数（含存活与消失）。 */
  affectedEntryCount: number
  /** 删除后一条原句都不剩、词条连同学习内容一起消失的数量。 */
  disappearingEntryCount: number
  /** 删除后仍有其他文章原句、继续保留的数量。 */
  survivingEntryCount: number
  /** 随消失词条一起删除的学习内容条数。 */
  disappearingLearningNoteCount: number
  /** 落点正是这篇文章的钉住数；删除后保留快照并转为未归档。 */
  articlePinCount: number
}

export type RenameArticleRequest = {
  articleId: string
  title: string
}

export type RenameArticleResult =
  | { status: 'renamed'; articleId: string; title: string }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'empty' | 'too-long' }

export type DeleteArticleRequest = {
  articleId: string
}

export type DeleteArticleResult =
  | {
      status: 'deleted'
      articleId: string
      /** 删除前算的影响面，与确认弹层看到的是同一份。 */
      preview: ArticleDeletionPreview
    }
  | { status: 'missing' }

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

/** 首页「最近收集」的一个词条 chip：只带点开词条与说明规模所需的最少字段。 */
export type HomeEntryChip = {
  id: string
  /** 词条当前的主词形。 */
  mainForm: string
  sentenceCount: number
  articleCount: number
  /** 这个词条最近一次收词的时间，ISO 8601 UTC。 */
  lastCollectedAt: string
}

/**
 * 首页「稍后看」的一行。只带词条与标记时间：不算进最近收集，
 * 也不显示原句数、笔记数这些收集侧的规模。
 */
export type HomeLaterEntry = {
  entryId: string
  /** 词条当前的主词形。 */
  mainForm: string
  /** 标记「稍后看」的时间，ISO 8601 UTC；列表按它倒序。 */
  markedAt: string
}

export type HomeSummary = {
  library: LibrarySize
  continueReading: ContinueReading | null
  /**
   * 已读完的篇数。没有未读完的篇目时，首页靠它区分「第一次来」与「都读完了」，
   * 只数真正标过完成的篇目，不拿文章库总数冒充已读。
   */
  completedArticleCount: number
  /** 真实的词条按最近收集时间倒序；没有词条时为空数组。 */
  recentEntries: HomeEntryChip[]
  /** 标了「稍后看」的词条，按标记时间倒序；没有时为空数组。 */
  laterEntries: HomeLaterEntry[]
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
