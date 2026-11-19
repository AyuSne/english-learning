import type { HomeEntryChip, HomeSummary } from '../../../shared/library'
import { continueReadingDisplay, type ContinueReadingDisplay } from '../library/display'

/**
 * 首页的三行文字。篇名怎么从语料的「场次 · 套数 · 题型」里拆出来，与文章库共用
 * `library/display` 的一份规则；这里只补首页自己的阅读状态与词条 chip 文案。
 */

export { continueReadingDisplay }
export type { ContinueReadingDisplay }

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
