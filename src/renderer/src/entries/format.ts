import type { EntryListItem, EntrySentence, EntrySummary, LearningNote } from '../../../shared/entries'
import { formatDay } from '../library/format'

/** 左栏一行：「2 句 · 1 篇」。 */
export function entryListMetaText(
  entry: Pick<EntryListItem, 'sentenceCount' | 'articleCount'>
): string {
  return `${entry.sentenceCount} 句 · ${entry.articleCount} 篇`
}

/**
 * 原句出处：「段 D · 第 3 句 · 第 4 页」；仔细阅读是「第 2 段 · 第 1 句」。
 * 句序在库里从 0 数，写出来从 1 数。
 */
export function sentenceSourceText(
  sentence: Pick<
    EntrySentence,
    'paragraphLetter' | 'paragraphOrdinal' | 'sentenceOrdinal' | 'page'
  >
): string {
  const place =
    sentence.paragraphLetter === null
      ? `第 ${sentence.paragraphOrdinal} 段`
      : `段 ${sentence.paragraphLetter}`
  const parts = [place, `第 ${sentence.sentenceOrdinal + 1} 句`]
  if (sentence.page !== null) {
    parts.push(`第 ${sentence.page} 页`)
  }
  return parts.join(' · ')
}

/** 学习内容的来源行：「词条内手写 · 2026-11-18」。 */
export function noteSourceText(note: Pick<LearningNote, 'source' | 'createdAt'>): string {
  const origin = note.source === 'pin' ? '来自对话' : '词条内手写'
  const day = formatDay(note.createdAt)
  return day === '' ? origin : `${origin} · ${day}`
}

/** 词条标题下的一行：「已收集 6 条原句 · 来自 3 篇 · 最近 2026-11-15」。 */
export function entryHeadlineText(
  entry: Pick<EntrySummary, 'sentenceCount' | 'articleCount' | 'lastCollectedAt'>
): string {
  const base = `已收集 ${entry.sentenceCount} 条原句 · 来自 ${entry.articleCount} 篇`
  const day = formatDay(entry.lastCollectedAt)
  return day === '' ? base : `${base} · 最近 ${day}`
}
