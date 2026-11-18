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
  noteCount: number
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
  /** 长篇匹配的原卷段落字母；仔细阅读为 null。 */
  paragraphLetter: string | null
  /** 段内句序，0 起。 */
  sentenceOrdinal: number
  sentenceText: string
  /** 段内字符区间。 */
  start: number
  end: number
  /** 选中的词形在句内的起始位置，界面据此把原词标出来。 */
  surfaceOffset: number
  /** 原 PDF 页码；语料没给时为 null。 */
  page: number | null
  /** 同一篇里的上一句 / 下一句，词条页展开前后句用；没有时为 null。 */
  previousSentence: string | null
  nextSentence: string | null
  /** 这个词形能不能单独拆成新词条；已经属于本词条时为 false。 */
  canSplitToNew: boolean
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

/** 词条页左栏的一行。 */
export type EntryListItem = {
  id: string
  mainForm: string
  sentenceCount: number
  articleCount: number
  noteCount: number
  lastCollectedAt: string
}

/** 左栏的排序与筛选；搜索同时匹配主词形与原句正文。 */
export type EntryListRequest = {
  query?: string
  sort?: 'recent' | 'alpha'
  filter?: 'all' | 'has-notes' | 'no-notes'
}

export type EntryListResult = {
  /** 库里的词条总数，不受搜索与筛选影响。 */
  total: number
  entries: EntryListItem[]
}

/** 学习内容：词条下的一段材料，只保留最终稿，不存历史版本。 */
export type LearningNote = {
  id: string
  entryId: string
  body: string
  pinned: boolean
  /** 来源：词条内就地手写，或从对话钉进来。 */
  source: 'manual' | 'pin'
  /** 钉住来源的 id；手写时为 null。 */
  sourcePinId: string | null
  createdAt: string
  updatedAt: string
}

/** 词条页里按文章分组的一组原句。 */
export type EntrySentenceGroup = {
  articleId: string
  articleTitle: string
  sessionLabel: string
  setLabel: string
  /** 这一组里最新收集的时间，组间按它倒序。 */
  latestCollectedAt: string
  /** 组内按段序、句序。 */
  sentences: EntrySentence[]
}

/** 词条页中栏与右栏要的全部内容。 */
export type EntryPage = {
  entry: EntrySummary
  groups: EntrySentenceGroup[]
  /** 置顶的在前，其余按写下的时间倒序。 */
  notes: LearningNote[]
}

/** 合并两个词条：source 的原句与学习内容迁到 target，source 消失。 */
export type MergeEntriesRequest = {
  sourceEntryId: string
  targetEntryId: string
  /** 合并后用的主词形；缺省沿用 target 的。 */
  mainForm?: string
}

export type MergeEntriesResult =
  | {
      status: 'merged'
      entry: EntrySummary
      /** 迁过来的原句条数。 */
      movedSentences: number
      /** 目标词条里已有同篇同句，合并成一条的条数。 */
      repeatedSentences: number
      movedNotes: number
    }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'same-entry' | 'main-form' }

/** 换主词形：只能从已收集的词形里选。 */
export type ChangeMainFormRequest = {
  entryId: string
  mainForm: string
}

export type ChangeMainFormResult =
  | { status: 'changed'; entry: EntrySummary }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'unknown-form' }

/** 把一条原句拆到另一个已有词条，或按它的词形新建一个词条。 */
export type MoveEntrySentenceRequest = {
  entrySentenceId: string
  target: { kind: 'entry'; entryId: string } | { kind: 'new' }
}

export type MoveEntrySentenceResult =
  | {
      status: 'moved'
      /** 源词条；拆走最后一条原句时它连学习内容一起删掉，为 null。 */
      from: EntrySummary | null
      to: EntrySummary
    }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'same-entry' | 'duplicate' }

/** 重新圈定：只在原句所在的那一句里换范围。 */
export type ReselectEntrySentenceRequest = {
  entrySentenceId: string
  start: number
  end: number
}

export type ReselectEntrySentenceResult =
  | {
      status: 'resaved'
      entry: EntrySummary
      sentence: EntrySentence
      articleId: string
      marks: ReadingCollectionMark[]
    }
  | { status: 'missing' }
  | { status: 'rejected'; reason: CollectRejection }

export type CreateLearningNoteRequest = {
  entryId: string
  body: string
}

export type UpdateLearningNoteRequest = {
  noteId: string
  body: string
}

export type PinLearningNoteRequest = {
  noteId: string
  pinned: boolean
}

export type MoveLearningNoteRequest = {
  noteId: string
  entryId: string
}

/** 学习内容的增改、置顶、移动与删除共用一种结果。 */
export type LearningNoteResult =
  | { status: 'saved'; note: LearningNote }
  | { status: 'deleted' }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'empty' | 'entry' | 'same-entry' }

/** 阅读页从词条跳过来时要定位的原句。 */
export type EntrySentenceTarget = {
  entry: EntrySummary
  sentence: EntrySentence
}
