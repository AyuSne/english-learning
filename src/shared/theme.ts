import type { Theme } from './types'

/**
 * 窗口首帧的底色，与 docs/ui-tokens.md 的 --paper 一致。
 * 渲染层加载 CSS 之前先用它兜底，避免闪白；其余颜色以 tokens.css 为准。
 */
export const THEME_PAPER: Record<Theme, string> = {
  light: '#FBFAF3',
  dark: '#1A1A1E'
}
