import type { ReadingSettings } from '../../../shared/reading'

/** 设置面板底部那一行：字号 20 · 行距 1.8。 */
export function settingsLabel(settings: Pick<ReadingSettings, 'fontSize' | 'lineHeight'>): string {
  return `字号 ${settings.fontSize} · 行距 ${settings.lineHeight.toFixed(1)}`
}

/** 当前值来自本篇还是全局默认。 */
export function settingsSourceLabel(source: ReadingSettings['source']): string {
  return source === 'article' ? '按本篇记住' : '来自全局默认'
}
