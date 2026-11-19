import type { HomeEntryChip, HomeSummary, LibraryArticle } from '../../../shared/library'
import { progressText } from '../library/format'

/**
 * 首页的三行文字。语料的 article.title 里塞着场次、套数与题型，
 * 显示时拆开：场次进 eyebrow，篇名进标题，meta 只留题型、词数与进度。
 * 只影响显示，不改库里的 canonical 篇名（重命名后照原样显示）。
 */

export type ContinueReadingDisplay = {
  eyebrow: string
  title: string
  meta: string
}

/** eyebrow 里的场次与套数，形如「2026年6月 · 第1套」。 */
function sessionLine(article: LibraryArticle): string {
  return [article.sessionLabel, article.setLabel]
    .filter((part) => part.trim() !== '')
    .join(' · ')
}

export function continueReadingDisplay(article: LibraryArticle): ContinueReadingDisplay {
  const eyebrow = sessionLine(article) || '继续阅读'
  const prefix = sessionLine(article)
  const title = article.title

  const afterSession =
    prefix !== '' && title.startsWith(`${prefix} · `)
      ? title.slice(prefix.length + ' · '.length)
      : title
  const afterKind =
    article.kindLabel !== '' && afterSession.startsWith(`${article.kindLabel} · `)
      ? afterSession.slice(article.kindLabel.length + ' · '.length)
      : afterSession

  // 语料篇名就是题型（没有单独的文章名）；这时标题就是题型，meta 不再重复。
  const titleIsKind = afterKind === '' || afterKind === article.kindLabel
  const displayTitle = titleIsKind ? article.kindLabel || afterSession || title : afterKind

  const meta: string[] = []
  if (!titleIsKind && article.kindLabel !== '') {
    meta.push(article.kindLabel)
  }
  meta.push(`${article.wordCount} 词`)
  meta.push(progressText(article.progress))

  return { eyebrow, title: displayTitle, meta: meta.join(' · ') }
}

/** 首页词条 chip 的第二行：这个词条收了多少原句、来自多少篇。 */
export function homeEntryMeta(entry: HomeEntryChip): string {
  return `${entry.sentenceCount} 句 · ${entry.articleCount} 篇`
}

/**
 * 首页首屏该显示哪种阅读状态：
 * - `first-start`：还没读过任何一篇（含加载中，沿用原来的首启文案）；
 * - `continue`：有最近打开、还没读完的一篇；
 * - `finished`：读过并完成了，但已经没有未读完的篇目——不是第一次来。
 * 「继续阅读」已经排除已读完的篇目，所以 finished 不会再把读完的那篇端出来。
 */
export type HomeReadingState = 'first-start' | 'continue' | 'finished'

export function homeReadingState(summary: HomeSummary | null): HomeReadingState {
  if (summary === null) return 'first-start'
  if (summary.continueReading !== null) return 'continue'
  return summary.completedArticleCount > 0 ? 'finished' : 'first-start'
}

/** 全部读完时的空态：只写真正读完的篇数，不拿文章库总数冒充「都读过了」。 */
export function finishedReadingDisplay(completedCount: number): {
  eyebrow: string
  title: string
  lede: string
} {
  return {
    eyebrow: `已读完 ${completedCount} 篇`,
    title: '没有读到一半的文章了',
    lede: '已读完的都还在文章库里，想重读随时挑一篇。'
  }
}
