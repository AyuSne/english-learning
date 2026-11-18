import { routeHash, type Route, type RouteHashOptions } from './routes'

export type NavigateOptions = RouteHashOptions

export function navigate(route: Route, options: NavigateOptions = {}): void {
  window.location.hash = routeHash(route, options)
}

/**
 * 不新增浏览历史的视图切换：词条页换选中项时用，免得「后退」在词条之间打转。
 */
export function replaceRoute(route: Route, options: NavigateOptions = {}): void {
  window.history.replaceState(null, '', routeHash(route, options))
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
