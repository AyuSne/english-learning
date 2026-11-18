import type { ArticleDetail, ReadingPoint } from './library'

/**
 * 阅读页的跨层类型：正文按段、句、原文注释给出，阅读设置与最后读到的位置随视图一起返回。
 * 句子与注释都带段内字符区间，渲染层据此把注释挂回原词，不自己拼正文。
 */

/** 字号四档。 */
export const READING_FONT_SIZES = [16, 18, 20, 22] as const
export type ReadingFontSize = (typeof READING_FONT_SIZES)[number]

/** 行距三档。 */
export const READING_LINE_HEIGHTS = [1.6, 1.8, 2.0] as const
export type ReadingLineHeight = (typeof READING_LINE_HEIGHTS)[number]

/** 一份阅读偏好；全局默认与单篇覆盖用同一种形状。 */
export type ReadingPreferences = {
  fontSize: ReadingFontSize
  lineHeight: ReadingLineHeight
  annotationsVisible: boolean
}

/**
 * 生效中的阅读设置。`source` 说明这份值来自本机全局默认，还是本篇单独记住的。
 */
export type ReadingSettings = ReadingPreferences & {
  source: 'global' | 'article'
}

/** 产品说明里定下的全局默认：20px、1.8、注释显示。 */
export const DEFAULT_READING_PREFERENCES: ReadingPreferences = {
  fontSize: 20,
  lineHeight: 1.8,
  annotationsVisible: true
}

export function isReadingFontSize(value: unknown): value is ReadingFontSize {
  return (READING_FONT_SIZES as readonly unknown[]).includes(value)
}

export function isReadingLineHeight(value: unknown): value is ReadingLineHeight {
  return (READING_LINE_HEIGHTS as readonly unknown[]).includes(value)
}

/** 原文注释：词形、中文注释与段内字符区间。 */
export type ReadingAnnotation = {
  surface: string
  gloss: string
  /** 段内字符区间，用于把注释挂回正文。 */
  start: number
  end: number
  /** 所在句的段内句序，0 起。 */
  sentenceOrdinal: number
}

export type ReadingSentence = {
  /** 段内句序，0 起。 */
  ordinal: number
  text: string
  /** 段内字符区间。 */
  start: number
  end: number
  /** PDF 物理页码；语料没给页码时为 null。 */
  page: number | null
}

export type ReadingParagraph = {
  id: string
  /** 段序，0 起。 */
  ordinal: number
  /** 长篇匹配的原卷段落字母 A–P；仔细阅读为 null。 */
  letter: string | null
  text: string
  pageStart: number | null
  pageEnd: number | null
  sentences: ReadingSentence[]
  annotations: ReadingAnnotation[]
}

/** 打开一篇原文时渲染层需要的全部内容。 */
export type ReadingView = {
  article: ArticleDetail
  paragraphs: ReadingParagraph[]
  settings: ReadingSettings
  /** 上次读到的位置；没读过时为 null。 */
  readingPoint: ReadingPoint | null
}

export type ReadingProgressRequest = {
  articleId: string
  paragraphId: string
  /** 段内句序，0 起。 */
  sentenceOrdinal: number
}

export type ReadingProgressResult = {
  saved: boolean
}

export type ReadingSettingsRequest = {
  articleId: string
  preferences: ReadingPreferences
}

export type ReadingSettingsResult = {
  saved: boolean
  settings: ReadingSettings
}
