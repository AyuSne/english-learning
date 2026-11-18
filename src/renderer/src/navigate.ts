import { routeHash, type Route } from './routes'

export type NavigateOptions = {
  /** 阅读页要打开的文章。 */
  articleId?: string
}

export function navigate(route: Route, options: NavigateOptions = {}): void {
  window.location.hash = routeHash(route, options)
}

/**
 * 退回上一层视图。hash 路由也进浏览历史，所以能用 history.back；
 * 直接从某篇阅读页启动（没有上一页）时退到首页。
 */
export function goBack(fallback: Route = 'home'): void {
  if (window.history.length > 1) {
    window.history.back()
  } else {
    navigate(fallback)
  }
}
