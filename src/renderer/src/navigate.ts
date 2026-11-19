import { loadHomeSummary } from './api'
import { parseView, routeHash, type Route, type RouteHashOptions, type View } from './routes'

export type NavigateOptions = RouteHashOptions

let recentEntryId: string | null = null
let recentThreadId: string | null = null
let recentLibraryArticleId: string | null = null
let navigationRequest = 0
const CURRENT_ROUTE_KEY = 'navigation.current-route'
const RECENT_ENTRY_KEY = 'navigation.entry'
const RECENT_THREAD_KEY = 'navigation.thread'
const RECENT_LIBRARY_ARTICLE_KEY = 'navigation.library-article'

function rememberObject(hash: string): void {
  const view = parseView(hash)
  if (view.route === 'entries') recentEntryId = view.entryId
  if (view.route === 'chat') recentThreadId = view.threadId
  if (view.route === 'library') recentLibraryArticleId = view.articleId
  try {
    window.localStorage.setItem(CURRENT_ROUTE_KEY, hash)
    if (view.route === 'entries') {
      window.localStorage.setItem(RECENT_ENTRY_KEY, view.entryId ?? '')
    }
    if (view.route === 'chat') {
      window.localStorage.setItem(RECENT_THREAD_KEY, view.threadId ?? '')
    }
    if (view.route === 'library') {
      window.localStorage.setItem(RECENT_LIBRARY_ARTICLE_KEY, view.articleId ?? '')
    }
  } catch {
    // 地址仍可在当前窗口使用，存储不可用时不阻止导航。
  }
}

/** 启动时优先使用现有地址，否则恢复上次窗口中的地址。 */
export function restoreCurrentView(): View {
  let hash = window.location.hash
  try {
    recentEntryId = window.localStorage.getItem(RECENT_ENTRY_KEY) || null
    recentThreadId = window.localStorage.getItem(RECENT_THREAD_KEY) || null
    recentLibraryArticleId = window.localStorage.getItem(RECENT_LIBRARY_ARTICLE_KEY) || null
    if (hash === '') {
      hash = window.localStorage.getItem(CURRENT_ROUTE_KEY) ?? ''
      if (hash !== '') window.history.replaceState(null, '', hash)
    }
  } catch {
    hash = window.location.hash
  }
  rememberObject(hash)
  return parseView(hash)
}

/** 后退与前进也要更新最近对象与下次启动的地址。 */
export function currentView(): View {
  rememberObject(window.location.hash)
  return parseView(window.location.hash)
}

/** 删除最近线程时清掉恢复地址，但不把用户从另一个页面或线程拉回来。 */
export function forgetChatThread(threadId: string): boolean {
  const view = parseView(window.location.hash)
  if (view.route === 'chat' && view.threadId === threadId) {
    replaceRoute('chat')
    return true
  }
  if (recentThreadId === threadId) {
    recentThreadId = null
    try {
      window.localStorage.removeItem(RECENT_THREAD_KEY)
    } catch {
      // 存储不可用时仍清理当前窗口里的最近线程。
    }
  }
  return false
}

/**
 * 文章被删后清掉「最近文章库对象」：下次点文章库不再指向一篇不存在的文章。
 * 当前地址由调用方决定是否替换，这里只清记忆，不把用户从别的页面拉回来。
 */
export function forgetLibraryArticle(articleId: string): void {
  if (recentLibraryArticleId === articleId) {
    recentLibraryArticleId = null
    try {
      window.localStorage.removeItem(RECENT_LIBRARY_ARTICLE_KEY)
    } catch {
      // 存储不可用时仍清理当前窗口里的最近文章。
    }
  }
}

export function navigate(route: Route, options: NavigateOptions = {}): void {
  rememberObject(window.location.hash)
  const target = routeHash(route, options)
  window.location.hash = target
  rememberObject(target)
}

/** 全局栏回到刚才看的对象；重复点当前页不改变地址或状态。 */
export function navigateFromGlobal(route: Route): void {
  const request = ++navigationRequest
  if (parseView(window.location.hash).route === route) return
  if (route === 'reading') {
    const fromHash = window.location.hash
    const fromRoute = parseView(fromHash).route
    const readingFrom = fromRoute === 'home' || fromRoute === 'library' || fromRoute === 'entries'
      ? fromRoute
      : null
    void loadHomeSummary().then(
      (summary) => {
        if (navigationRequest !== request || window.location.hash !== fromHash) return
        navigate('reading', { articleId: summary.continueReading?.article.id ?? null, readingFrom })
      },
      () => {
        if (navigationRequest === request && window.location.hash === fromHash) navigate('reading')
      }
    )
    return
  }
  navigate(
    route,
    route === 'entries'
      ? { entryId: recentEntryId }
      : route === 'chat'
        ? { threadId: recentThreadId }
        : route === 'library'
          ? { articleId: recentLibraryArticleId }
        : {}
  )
}

/**
 * 不新增浏览历史的视图切换：词条页换选中项时用，免得「后退」在词条之间打转。
 */
export function replaceRoute(route: Route, options: NavigateOptions = {}): void {
  const target = routeHash(route, options)
  if (target === window.location.hash) return
  window.history.replaceState(null, '', target)
  rememberObject(window.location.hash)
  // replaceState 不触发 hashchange，通知当前视图同步但不新增历史记录。
  window.dispatchEvent(new Event('route-replaced'))
}

/**
 * 退回上一层视图。hash 路由也进浏览历史，所以能用 history.back；
 * 直接从某篇阅读页启动（没有上一页）时退到首页。
 */
export function goBack(fallback: Route = 'home', options: NavigateOptions = {}): void {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    const recent = fallback === 'entries'
      ? { entryId: recentEntryId }
      : fallback === 'library'
        ? { articleId: recentLibraryArticleId }
        : {}
    navigate(fallback, { ...recent, ...options })
  }
}
