import type {
  ArticleDetail,
  HomeSummary,
  LibraryListing,
  LibrarySearchResults
} from '../../shared/library'
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

/** 记下「最近打开」，首次打开时位置停在第一句。 */
export function markArticleOpened(articleId: string): Promise<{ opened: boolean }> {
  return window.api.invoke('library:open', { articleId })
}
