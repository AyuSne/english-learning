export const ROUTES = ['home', 'reading', 'entries', 'chat', 'library', 'settings'] as const

export type Route = (typeof ROUTES)[number]

/**
 * 当前视图。阅读页要带上是哪一篇（可以再带一条要定位的原句），
 * 词条页要带上打开哪个词条。刷新或重启后靠 hash 回到同一处。
 */
export type View = {
  route: Route
  /** 阅读页打开的文章；没有指定时为空，阅读页显示空态。 */
  articleId: string | null
  /** 词条页打开的词条；没有指定时为空，词条页显示「在左边选一个词条」。 */
  entryId: string | null
  /** 阅读页要从词条跳到的原句。 */
  entrySentenceId: string | null
  /** 阅读页要把这条原句的范围换掉（重新圈定）。 */
  reselect: boolean
}

export type RouteHashOptions = {
  articleId?: string | null
  entryId?: string | null
  entrySentenceId?: string | null
  reselect?: boolean
}

function routeOf(segment: string): Route | null {
  return (ROUTES as readonly string[]).includes(segment) ? (segment as Route) : null
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment) || null
  } catch {
    return null
  }
}

/** 只解析单段参数的路由；多一段就退回首页，不吃掉粘贴进来的怪 URL。 */
function singleView(route: Route, segments: string[]): View {
  return segments.length === 1 ? blankView(route) : blankView('home')
}

function blankView(route: Route): View {
  return {
    route,
    articleId: null,
    entryId: null,
    entrySentenceId: null,
    reselect: false
  }
}

/**
 * hash 形如 `#/reading/<articleId>?sentence=<id>&reselect=1`、`#/entries/<entryId>`
 * 或 `#/<route>`。多出来的路径段或认不出的路径都退回首页。
 */
export function parseView(hash: string): View {
  const withoutHash = hash.replace(/^#\/?/, '')
  const queryStart = withoutHash.indexOf('?')
  const path = queryStart < 0 ? withoutHash : withoutHash.slice(0, queryStart)
  const query = queryStart < 0 ? '' : withoutHash.slice(queryStart + 1)
  const segments = path.split('/').filter((segment) => segment !== '')

  const route = routeOf(segments[0] ?? '')
  if (route === null) {
    return blankView('home')
  }

  if (route === 'reading') {
    if (segments.length > 2) {
      return blankView('home')
    }
    if (segments.length === 1) {
      return blankView('reading')
    }
    const articleId = decodeSegment(segments[1] as string)
    if (articleId === null) {
      return blankView('reading')
    }
    const params = new URLSearchParams(query)
    const sentence = params.get('sentence')
    const entrySentenceId = sentence === null ? null : decodeSegment(sentence)
    return {
      route,
      articleId,
      entryId: null,
      entrySentenceId,
      reselect: entrySentenceId !== null && params.get('reselect') === '1'
    }
  }

  if (route === 'entries') {
    if (segments.length > 2) {
      return blankView('home')
    }
    if (segments.length === 1) {
      return blankView('entries')
    }
    return {
      ...blankView('entries'),
      entryId: decodeSegment(segments[1] as string)
    }
  }

  return singleView(route, segments)
}

export function routeHash(route: Route, options: RouteHashOptions = {}): string {
  if (route === 'reading' && options.articleId) {
    let hash = `#/reading/${encodeURIComponent(options.articleId)}`
    if (options.entrySentenceId) {
      hash += `?sentence=${encodeURIComponent(options.entrySentenceId)}`
      if (options.reselect) {
        hash += '&reselect=1'
      }
    }
    return hash
  }
  if (route === 'entries' && options.entryId) {
    return `#/entries/${encodeURIComponent(options.entryId)}`
  }
  return `#/${route}`
}
