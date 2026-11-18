import type { ReadingPoint, ReadingProgress } from '../../../shared/library'

/** 文章库里显示的一行进度文字。 */
export function progressText(progress: ReadingProgress): string {
  return progress.state === 'unread' ? '未读' : `读到 ${progress.percent}%`
}

/** 「第 3 段 · 第 2 句」。 */
export function readingPointText(point: ReadingPoint): string {
  return `第 ${point.paragraphOrdinal} 段 · 第 ${point.sentenceOrdinal} 句`
}

/** 时间只写日期，按本机时区。 */
export function formatDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
