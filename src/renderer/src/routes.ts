export const ROUTES = ['home', 'reading', 'entries', 'chat', 'library', 'settings'] as const

export type Route = (typeof ROUTES)[number]
export type ReadingSource = 'library' | 'home' | 'entries' | 'search'

/**
 * 本篇选词的直接上游：从阅读页页脚进来（`reader`）还是从文章库详情进来（`library`）。
 * 它和 `readingFrom` 是两件事：`readingFrom` 是阅读页自己的来源，页脚进子视图后仍要带回
 * 阅读页，让阅读页的返回目标不被改写；直接打开或刷新地址时没有值，按 `reader` 兜底。
 */
export type WordsSource = 'reader' | 'library'

/**
 * 当前视图。阅读页要带上是哪一篇（可以再带一条要定位的原句），
 * 词条页要带上打开哪个词条，对话页可以带一条要从学习内容定位回来的钉住。
 * 刷新或重启后靠 hash 回到同一处。
 */
export type View = {
  route: Route
  /** 阅读页打开或文章库选中的文章；没有指定时为空。 */
  articleId: string | null
  /** 词条页打开的词条；没有指定时为空，词条页显示「在左边选一个词条」。 */
  entryId: string | null
  /** 对话页打开的线程；没有指定时为空，对话页是一张新的空白线程。 */
  threadId: string | null
  /** 阅读页或词条页要定位的原句。 */
  entrySentenceId: string | null
  /** 阅读页要把这条原句的范围换掉（重新圈定）。 */
  reselect: boolean
  /** 对话页要从学习内容回跳定位的那条钉住。 */
  pinId: string | null
  /** 回跳时「回词条」要回到的词条。 */
  fromEntryId: string | null
  /** 阅读页由哪里打开，用于标明返回目标。 */
  readingFrom: ReadingSource | null
  /** 阅读页正在看的是「本篇选词」子视图，而不是正文。 */
  readingWords: boolean
  /** 本篇选词的直接上游；直接打开或刷新时为空，界面按 `reader` 兜底。 */
  readingWordsFrom: WordsSource | null
}

export type RouteHashOptions = {
  articleId?: string | null
  entryId?: string | null
  threadId?: string | null
  entrySentenceId?: string | null
  reselect?: boolean
  pinId?: string | null
  fromEntryId?: string | null
  readingFrom?: ReadingSource | null
  /** 阅读页进入「本篇选词」；只有带文章 id 时才成立。 */
  words?: boolean
  /** 本篇选词的直接上游：页脚进来是 reader，文章库详情进来是 library。 */
  wordsFrom?: WordsSource | null
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
    threadId: null,
    entrySentenceId: null,
    reselect: false,
    pinId: null,
    fromEntryId: null,
    readingFrom: null,
    readingWords: false,
    readingWordsFrom: null
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
    // `#/reading/<articleId>` 是正文；`#/reading/<articleId>/words` 是同一篇文章的
    // 「本篇选词」子视图。第三段认不出时不把前一段当成文章，直接退回首页。
    if (segments.length > 3) {
      return blankView('home')
    }
    const readingWords = segments.length === 3 && segments[2] === 'words'
    if (segments.length === 3 && !readingWords) {
      return blankView('home')
    }
    const params = new URLSearchParams(query)
    const from = params.get('from')
    const readingFrom =
      from === 'library' || from === 'home' || from === 'entries' || from === 'search'
        ? from
        : null
    const wordsFromParam = params.get('wordsFrom')
    const readingWordsFrom =
      wordsFromParam === 'reader' || wordsFromParam === 'library' ? wordsFromParam : null
    if (segments.length === 1) {
      return { ...blankView('reading'), readingFrom }
    }
    const articleId = decodeSegment(segments[1] as string)
    if (articleId === null) {
      return blankView('reading')
    }
    const sentence = readingWords ? null : params.get('sentence')
    const entrySentenceId = sentence === null ? null : decodeSegment(sentence)
    return {
      route,
      articleId,
      entryId: null,
      threadId: null,
      entrySentenceId,
      reselect: entrySentenceId !== null && params.get('reselect') === '1',
      pinId: null,
      fromEntryId: null,
      readingFrom,
      readingWords,
      readingWordsFrom: readingWords ? readingWordsFrom : null
    }
  }

  if (route === 'library') {
    if (segments.length > 2) return blankView('home')
    return {
      ...blankView('library'),
      articleId: segments.length === 2 ? decodeSegment(segments[1] as string) : null
    }
  }

  if (route === 'entries') {
    if (segments.length > 2) {
      return blankView('home')
    }
    if (segments.length === 1) {
      return blankView('entries')
    }
    const entryId = decodeSegment(segments[1] as string)
    const params = new URLSearchParams(query)
    return {
      ...blankView('entries'),
      entryId,
      entrySentenceId: entryId === null ? null : params.get('sentence') || null
    }
  }

  if (route === 'chat') {
    if (segments.length > 2) {
      return blankView('home')
    }
    if (segments.length === 1) {
      return blankView('chat')
    }
    const params = new URLSearchParams(query)
    return {
      ...blankView('chat'),
      threadId: decodeSegment(segments[1] as string),
      pinId: decodeSegment(params.get('pin') ?? ''),
      fromEntryId: decodeSegment(params.get('from') ?? '')
    }
  }

  return singleView(route, segments)
}

export function routeHash(route: Route, options: RouteHashOptions = {}): string {
  if (route === 'reading') {
    const words = options.words === true && Boolean(options.articleId)
    let hash = options.articleId
      ? `#/reading/${encodeURIComponent(options.articleId)}${words ? '/words' : ''}`
      : '#/reading'
    const params: string[] = []
    if (options.articleId && !words && options.entrySentenceId) {
      params.push(`sentence=${encodeURIComponent(options.entrySentenceId)}`)
      if (options.reselect) {
        params.push('reselect=1')
      }
    }
    if (options.readingFrom) params.push(`from=${options.readingFrom}`)
    if (words && (options.wordsFrom === 'reader' || options.wordsFrom === 'library')) {
      params.push(`wordsFrom=${options.wordsFrom}`)
    }
    if (params.length > 0) hash += `?${params.join('&')}`
    return hash
  }
  if (route === 'entries' && options.entryId) {
    const hash = `#/entries/${encodeURIComponent(options.entryId)}`
    return options.entrySentenceId
      ? `${hash}?sentence=${encodeURIComponent(options.entrySentenceId)}`
      : hash
  }
  if (route === 'library' && options.articleId) {
    return `#/library/${encodeURIComponent(options.articleId)}`
  }
  if (route === 'chat' && options.threadId) {
    let hash = `#/chat/${encodeURIComponent(options.threadId)}`
    if (options.pinId) {
      hash += `?pin=${encodeURIComponent(options.pinId)}`
      if (options.fromEntryId) {
        hash += `&from=${encodeURIComponent(options.fromEntryId)}`
      }
    }
    return hash
  }
  return `#/${route}`
}
