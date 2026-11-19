import type { ReadingSource, Route, RouteHashOptions, WordsSource } from '../routes'

/**
 * 阅读页与「本篇选词」共用的返回映射：文字与目标只写一处，避免两个页面各写一套后漂移。
 *
 * - 阅读页按自己的 `readingFrom` 说话（文章库 / 首页 / 词条 / 搜索结果）。
 * - 本篇选词按直接上游说话：页脚进来就回阅读页（并把原来的 `readingFrom` 带回去），
 *   文章库详情进来就回文章库；直接打开或刷新地址时没有上游信息，固定按阅读页兜底，
 *   不再让顶部写着「文章库」而历史却退回别处。
 */

const READING_SOURCE_LABELS: Record<ReadingSource, string> = {
  library: '文章库',
  home: '首页',
  entries: '词条',
  search: '搜索结果'
}

export type BackTarget = {
  /** 箭头后显示的字；没有来源时为空串，按钮只写「返回」。 */
  label: string
  /** 屏幕阅读器读到的完整说法。 */
  ariaLabel: string
  route: Route
  options: RouteHashOptions
}

function target(label: string, route: Route, options: RouteHashOptions = {}): BackTarget {
  return {
    label,
    ariaLabel: label === '' ? '返回' : `返回${label}`,
    route,
    options
  }
}

/** 阅读页正文的返回去向：由调用方传入的来源决定，缺省回首页。 */
export function readingBackTarget(
  readingFrom: ReadingSource | null,
  entrySentenceId: string | null
): BackTarget {
  const label = readingFrom === null ? '' : READING_SOURCE_LABELS[readingFrom]
  const route: Route =
    readingFrom === 'library' ? 'library' : readingFrom === 'entries' ? 'entries' : 'home'
  return target(
    label,
    route,
    readingFrom === 'entries' && entrySentenceId !== null ? { entrySentenceId } : {}
  )
}

/**
 * 本篇选词的返回去向。直接上游只有文章库详情与阅读页两种；缺省（直接打开、刷新、
 * 旧地址）按阅读页兜底——地址里本来就带文章 id，回阅读页是确定可达的。
 */
export function articleWordsBackTarget(input: {
  articleId: string | null
  readingFrom: ReadingSource | null
  wordsFrom: WordsSource | null
}): BackTarget {
  if (input.wordsFrom === 'library' && input.articleId !== null) {
    return target('文章库', 'library', { articleId: input.articleId })
  }
  return target(
    '阅读',
    'reading',
    input.articleId === null
      ? {}
      : { articleId: input.articleId, readingFrom: input.readingFrom }
  )
}
