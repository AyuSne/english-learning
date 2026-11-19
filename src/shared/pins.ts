import type { ChatThreadView } from './threads'

/**
 * 钉住：从 AI 回答里挑出的一段连续文本，连同出处与落点收进词条、文章或未归档。
 * 钉住的内容是快照，之后对话怎么改都不影响它；落到词条后成为该词条的一条学习内容。
 */

export type PinTargetKind = 'entry' | 'article' | 'unfiled'

/** 一条钉住只有一个落点；移动就是改这个落点，不复制。 */
export type PinTarget =
  | { kind: 'entry'; entryId: string }
  | { kind: 'article'; articleId: string }
  | { kind: 'unfiled' }

/** 读出来的落点带标签：词条给主词形，文章给篇名；未归档没有标签。 */
export type PinTargetView =
  | { kind: 'entry'; entryId: string; label: string }
  | { kind: 'article'; articleId: string; label: string }
  | { kind: 'unfiled' }

/** 钉住卡固定显示的出处行：线程名、第几轮、模型、时间与当时的原句。 */
export type PinProvenance = {
  threadId: string
  /** 钉住时的线程名快照；线程改名或删掉都不影响它。 */
  threadTitle: string
  /** 回答版本的根条目 id；片段位置是相对这一版正文的字符区间。 */
  answerId: string
  /** 第几轮，1 起。 */
  turnIndex: number
  /** 钉住时的模型名。 */
  model: string
  /** 钉住时的线程主对象原句快照；线程没挂原句时为 null。 */
  sourceSentence: { id: string; text: string } | null
}

/** 另一分支的回答仍可跳转；只在源线程或原回答缺失时置灰。 */
export type PinSourceStatus = 'available' | 'thread-deleted' | 'answer-missing'

export type Pin = {
  id: string
  /** 复制出来的正文快照。 */
  capturedText: string
  /** 片段在这一版回答正文里的字符区间。 */
  start: number
  end: number
  target: PinTargetView
  /** 按源线程主对象推导的落点；未归档的钉住归位时用它预选。 */
  defaultTarget: PinTargetView
  provenance: PinProvenance
  sourceStatus: PinSourceStatus
  createdAt: string
}

/** 钉板：这条线程钉住的（已归位）与全局未归档的两份列表。 */
export type PinBoard = {
  threadId: string | null
  threadPins: Pin[]
  unfiledPins: Pin[]
  /** 全局未归档总数；左栏与钉板窄条使用。 */
  unfiledCount: number
}

export type CreatePinRequest = {
  threadId: string
  /** 回答版本的根条目；继续生成接出来的内容也算在同一版里。 */
  answerId: string
  /** 片段在这一版回答正文里的起始位置。 */
  start: number
  /** 结束位置（不含）。 */
  end: number
  target: PinTarget
}

export type CreatePinRejection = 'answer' | 'range' | 'target' | 'thread'

export type CreatePinResult =
  | { status: 'pinned'; pin: Pin }
  | { status: 'rejected'; reason: CreatePinRejection }

export type MovePinRequest = {
  pinId: string
  target: PinTarget
}

export type PinResult =
  | { status: 'saved'; pin: Pin }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'target' }

export type DeletePinResult =
  | { status: 'deleted'; pinId: string }
  | { status: 'missing' }

export type FileAllUnfiledRequest = {
  /** 全部未归档统一归到这个落点。 */
  target: PinTarget
}

export type FileAllUnfiledResult =
  | { status: 'filed'; filed: Pin[] }
  | { status: 'rejected'; reason: 'target' }

/** 撤销「丢弃」用的完整快照：按原来的 id 和落点放回去。 */
export type RestorePinInput = {
  id: string
  capturedText: string
  start: number
  end: number
  target: PinTarget
  provenance: PinProvenance
  createdAt: string
}

export type RestorePinsRequest = {
  pins: RestorePinInput[]
}

export type RestorePinsResult =
  | { status: 'restored'; pins: Pin[] }
  | { status: 'rejected'; reason: 'target' }

/** 从学习内容点「来源」：打开线程、定位那条回答；不在当前分支时给切换入口。 */
export type PinSource = {
  pin: Pin
  thread: ChatThreadView | null
  /** 那条回答在不在线程当前分支上。 */
  onBranch: boolean
  /** 切到那条回答要用的问题 id；线程已删或已在当前分支时为 null。 */
  questionId: string | null
}

export type PinSourceResult = PinSource | null
