import type {
  ArticleDetail,
  HomeSummary,
  LibraryListing,
  LibrarySearchResults
} from '../../shared/library'
import type {
  CollectSelectionRequest,
  CollectSelectionResult,
  DeleteEntrySentenceResult,
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
