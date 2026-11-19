import type { EntrySentence, EntrySummary } from './entries'
import type { ArticleDetail } from './library'

/**
 * 「本篇选词」的跨层类型：一篇文章作为子视图，按段落列出这篇实际收下的词条与原句。
 * 词条与原句沿用词条页的 EntrySummary / EntrySentence，界面不另拼一套字段。
 *
 * 视图本身是只读查询；「进入即已读完」由单独的完成命令写，界面先发命令再读视图。
 */

/** 一段里收下的一个词条，以及它在本段里的原句（按句序、段内位置排）。 */
export type ArticleWordsEntry = {
  entry: EntrySummary
  sentences: EntrySentence[]
}

export type ArticleWordsParagraph = {
  id: string
  /** 段序，1 起，直接可写进界面。 */
  ordinal: number
  /** 长篇匹配的原卷段落字母；仔细阅读为 null。 */
  letter: string | null
  entries: ArticleWordsEntry[]
}

/** 打开一篇原文的本篇选词时渲染层需要的全部内容；没有收过词的段落不出现。 */
export type ArticleWordsView = {
  /**
   * 这一篇的文章信息，含 `wordEntryCount`（不同词条数）与
   * `collectedSentenceCount`（原句条数），与文章库详情读同一份模型。
   */
  article: ArticleDetail
  paragraphs: ArticleWordsParagraph[]
}
