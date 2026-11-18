import type {
  ArticleDetail,
  HomeSummary,
  LibraryListing,
  LibrarySearchResults
} from '../../shared/library'
import type {
  ChangeMainFormRequest,
  ChangeMainFormResult,
  CollectSelectionRequest,
  CollectSelectionResult,
  CreateLearningNoteRequest,
  DeleteEntrySentenceResult,
  EntryListRequest,
  EntryListResult,
  EntryPage,
  EntrySentenceTarget,
  LearningNoteResult,
  MergeEntriesRequest,
  MergeEntriesResult,
  MoveEntrySentenceRequest,
  MoveEntrySentenceResult,
  MoveLearningNoteRequest,
  PinLearningNoteRequest,
  ReselectEntrySentenceRequest,
  ReselectEntrySentenceResult,
  UpdateLearningNoteRequest,
  WordEntryCard
} from '../../shared/entries'
import type {
  ReadingProgressRequest,
  ReadingProgressResult,
  ReadingSettingsRequest,
  ReadingSettingsResult,
  ReadingView
} from '../../shared/reading'
import type { AppBootstrap } from '../../shared/types'

export function loadBootstrap(): Promise<AppBootstrap> {
  return window.api.invoke('app:bootstrap')
}

export function loadHomeSummary(): Promise<HomeSummary> {
  return window.api.invoke('home:summary')
}

export function loadLibrary(): Promise<LibraryListing> {
  return window.api.invoke('library:list')
}

export function loadArticleDetail(articleId: string): Promise<ArticleDetail | null> {
  return window.api.invoke('library:detail', { articleId })
}

export function searchLibrary(query: string): Promise<LibrarySearchResults> {
  return window.api.invoke('library:search', { query })
}

/** 打开一篇文章：换回正文、生效设置与上次读到的位置，同时记下「最近打开」。 */
export function openReadingView(articleId: string): Promise<ReadingView | null> {
  return window.api.invoke('reading:open', { articleId })
}

/** 记下读到哪一段、哪一句。 */
export function saveReadingPoint(request: ReadingProgressRequest): Promise<ReadingProgressResult> {
  return window.api.invoke('reading:progress', request)
}

/** 记住这一篇的字号、行距与注释开关。 */
export function saveReadingSettings(
  request: ReadingSettingsRequest
): Promise<ReadingSettingsResult | null> {
  return window.api.invoke('reading:settings', request)
}

/** 收下一次选词：当场建原句、归词条，并拿回这一篇最新的标记。 */
export function collectSelection(
  request: CollectSelectionRequest
): Promise<CollectSelectionResult> {
  return window.api.invoke('reading:collect', request)
}

/** 点开一个已收集的词，读它的词条卡与原句。 */
export function loadWordEntryCard(entryId: string): Promise<WordEntryCard | null> {
  return window.api.invoke('entries:card', { entryId })
}

/** 删掉一条原句；词条只剩这一条时连词条一起删。 */
export function deleteEntrySentence(entrySentenceId: string): Promise<DeleteEntrySentenceResult> {
  return window.api.invoke('entries:delete-sentence', { entrySentenceId })
}

/** 词条页左栏：计数、搜索、排序与筛选。 */
export function loadEntryList(request: EntryListRequest): Promise<EntryListResult> {
  return window.api.invoke('entries:list', request)
}

/** 词条页的一整页：主词形、按文章分组的原句与学习内容。 */
export function loadEntryPage(entryId: string): Promise<EntryPage | null> {
  return window.api.invoke('entries:page', { entryId })
}

/** 阅读页从词条跳过来时要定位的原句。 */
export function loadEntrySentenceTarget(
  entrySentenceId: string
): Promise<EntrySentenceTarget | null> {
  return window.api.invoke('entries:sentence', { entrySentenceId })
}

/** 合并两个词条，源词条的原句与学习内容迁到目标。 */
export function mergeWordEntries(request: MergeEntriesRequest): Promise<MergeEntriesResult> {
  return window.api.invoke('entries:merge', request)
}

/** 换主词形，只能从已收集的词形里选。 */
export function saveEntryMainForm(
  request: ChangeMainFormRequest
): Promise<ChangeMainFormResult> {
  return window.api.invoke('entries:main-form', request)
}

/** 把一条原句拆到别的词条或新词条。 */
export function moveEntrySentenceTo(
  request: MoveEntrySentenceRequest
): Promise<MoveEntrySentenceResult> {
  return window.api.invoke('entries:move-sentence', request)
}

/** 重新圈定原句范围。 */
export function reselectEntrySentence(
  request: ReselectEntrySentenceRequest
): Promise<ReselectEntrySentenceResult> {
  return window.api.invoke('entries:reselect-sentence', request)
}

export function createEntryNote(
  request: CreateLearningNoteRequest
): Promise<LearningNoteResult> {
  return window.api.invoke('entries:create-note', request)
}

export function updateEntryNote(
  request: UpdateLearningNoteRequest
): Promise<LearningNoteResult> {
  return window.api.invoke('entries:update-note', request)
}

export function pinEntryNote(request: PinLearningNoteRequest): Promise<LearningNoteResult> {
  return window.api.invoke('entries:pin-note', request)
}

export function deleteEntryNote(noteId: string): Promise<LearningNoteResult> {
  return window.api.invoke('entries:delete-note', { noteId })
}

export function moveEntryNote(request: MoveLearningNoteRequest): Promise<LearningNoteResult> {
  return window.api.invoke('entries:move-note', request)
}
