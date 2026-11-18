import type {
  ArticleDetail,
  HomeSummary,
  LibraryListing,
  LibrarySearchResults
} from '../../shared/library'
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
