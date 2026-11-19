import type { HomeEntryChip, LibraryArticle } from '../../../shared/library'
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
