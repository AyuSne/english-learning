/**
 * 词条与已收集原句的跨层类型。阅读页只认这些结构：谁被收集了、落在哪一句、
 * 词条现在有几条原句；点开词条卡时再取整条词条的明细。
 */

/**
 * 正文里的一处已收集标记。`start` / `end` 是段内字符区间，和句子的区间同一套坐标，
 * 渲染层据此把琥珀色标回正文。
 */
export type ReadingCollectionMark = {
  /** entry_sentence 的 id，删除时用它。 */
  id: string
  entryId: string
  /** 词条当前的主词形。 */
  entryMainForm: string
  /** 当时圈下的词形，原样保留。 */
  surface: string
  paragraphId: string
  /** 段内句序，0 起。 */
  sentenceOrdinal: number
  start: number
  end: number
}

/** 词条的规模与词形，词条卡顶部与删除提示用。 */
export type EntrySummary = {
  id: string
  mainForm: string
  /** 除主词形外，已收集到的其他词形，按首次收集时间排。 */
  variants: string[]
  sentenceCount: number
  articleCount: number
  /** ISO 8601 UTC。 */
  lastCollectedAt: string
}

/** 词条下的一条原句：选中词形、原句文字与出处。 */
export type EntrySentence = {
  id: string
  surface: string
  articleId: string
  articleTitle: string
  paragraphId: string
  /** 段序，1 起，直接可写进界面。 */
  paragraphOrdinal: number
  /** 段内句序，0 起。 */
  sentenceOrdinal: number
  sentenceText: string
  /** 段内字符区间。 */
  start: number
  end: number
  collectedAt: string
}

/** 阅读页点开一个已收集的词时看到的词条卡。 */
export type WordEntryCard = {
  entry: EntrySummary
  /** 按最近收集在前。 */
  sentences: EntrySentence[]
}

export type CollectSelectionRequest = {
  articleId: string
  paragraphId: string
  /** 段内句序，0 起。 */
  sentenceOrdinal: number
  /** 段内字符区间。 */
  start: number
  end: number
}

export type CollectRejection = 'article' | 'paragraph' | 'sentence' | 'range' | 'empty'

export type CollectSelectionResult =
  | {
      status: 'collected'
      entry: EntrySummary
      sentence: EntrySentence
      /** 这一篇最新的已收集标记，渲染层直接换上。 */
      marks: ReadingCollectionMark[]
    }
  | {
      /** 同篇同句同一个词条已经收过，不新增关联。 */
      status: 'duplicate'
      entry: EntrySummary
      sentence: EntrySentence
      marks: ReadingCollectionMark[]
    }
  | {
      status: 'rejected'
      reason: CollectRejection
    }

export type DeleteEntrySentenceResult =
  | {
      status: 'deleted'
      /** 删的是这个词条的最后一条原句，词条本身也没了。 */
      entryDeleted: boolean
      entry: EntrySummary | null
      /** 被删原句所在的那一篇；`marks` 只属于这一篇。 */
      articleId: string
      marks: ReadingCollectionMark[]
    }
  | {
      status: 'missing'
    }
