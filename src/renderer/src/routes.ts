export const ROUTES = ['home', 'reading', 'entries', 'chat', 'library', 'settings'] as const

export type Route = (typeof ROUTES)[number]

/**
 * 当前视图。阅读页要带上是哪一篇，其余页暂时没有参数。
 * 刷新或重启后靠 hash 回到同一处。
 */
export type View = {
  route: Route
  /** 阅读页打开的文章；没有指定时为空，阅读页显示空态。 */
  articleId: string | null
}

function routeOf(segment: string): Route | null {
  return (ROUTES as readonly string[]).includes(segment) ? (segment as Route) : null
}

function decodeArticleId(segment: string): string | null {
  try {
    return decodeURIComponent(segment) || null
  } catch {
    return null
  }
}

/**
 * 阅读页的 hash 是 `#/reading/<articleId>`；其余页面只认 `#/<route>`。
 * 多出来的路径段或认不出的路径都退回首页，不吃掉粘贴进来的怪 URL。
 */
export function parseView(hash: string): View {
  const path = hash.replace(/^#\/?/, '')
  const segments = path.split('/').filter((segment) => segment !== '')
  const route = routeOf(segments[0] ?? '')
  if (route === null) {
    return { route: 'home', articleId: null }
  }
  if (route !== 'reading') {
    return segments.length === 1
      ? { route, articleId: null }
      : { route: 'home', articleId: null }
  }
  if (segments.length === 1) {
    return { route, articleId: null }
  }
  if (segments.length > 2) {
    return { route: 'home', articleId: null }
  }
  const articleId = decodeArticleId(segments[1] as string)
  return articleId === null
    ? { route, articleId: null }
    : { route, articleId }
}

export function routeHash(route: Route, options: { articleId?: string | null } = {}): string {
  if (route === 'reading' && options.articleId) {
    return `#/reading/${encodeURIComponent(options.articleId)}`
  }
  return `#/${route}`
}
