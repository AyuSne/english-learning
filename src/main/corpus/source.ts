import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { ArticleKind, ImportFailure } from '../../shared/library'

/**
 * 语料读取与校验。导入前把每篇的结构、句区间、注释区间与统计核一遍：
 * 宁可让这一篇失败并报出原因，也不把乱码或错位的句子带进原句。
 */
export class CorpusError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CorpusError'
  }
}

export type CorpusManifestEntry = {
  id: string
  file: string
  sha256: string
  /** 清单里的顺序，落库后用于平手时的排序。 */
  position: number
}

export type CorpusManifest = {
  entries: CorpusManifestEntry[]
  /** 清单里这一项本身就不合法的文章；其余照常导入。 */
  failed: ImportFailure[]
}

export type CorpusSentence = {
  /** 段内句序，0 起。 */
  ordinal: number
  text: string
  /** 段内字符区间。 */
  start: number
  end: number
  page: number
}

export type CorpusParagraph = {
  id: string
  ordinal: number
  text: string
  pageStart: number
  pageEnd: number
  sentences: CorpusSentence[]
}

export type CorpusAnnotation = {
  paragraphId: string
  sentenceOrdinal: number
  ordinal: number
  surface: string
  gloss: string
  start: number
  end: number
}

export type CorpusArticle = {
  id: string
  title: string
  kind: ArticleKind
  kindLabel: string
  sessionKey: string
  sessionLabel: string
  setLabel: string
  examYear: number
  examMonth: number
  examSet: number
  wordCount: number
  pageStart: number
  pageEnd: number
  sourcePdf: string
  sha256: string
  bodyText: string
  paragraphs: CorpusParagraph[]
  annotations: CorpusAnnotation[]
}

const LONG_MATCH = '长篇匹配'
const CAREFUL_READING = '仔细阅读'

function fail(reason: string): never {
  throw new CorpusError(reason)
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${what}不是对象`)
  }
  return value as Record<string, unknown>
}

function asText(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${what}是空的或不是文字`)
  }
  return value
}

function asInteger(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(`${what}不是整数`)
  }
  return value
}

/** 英文正文不该出现乱码替换符或混进来的中文夹注。 */
function assertEnglishBody(text: string, what: string): void {
  if (text.includes('\uFFFD')) {
    fail(`${what}里有乱码字符`)
  }
  if (/[\u4e00-\u9fff]/.test(text)) {
    fail(`${what}里混进了中文`)
  }
}

function readJson(file: string, what: string): unknown {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    fail(`${what}读不出来`)
  }
  try {
    return JSON.parse(text)
  } catch {
    fail(`${what}不是合法 JSON`)
  }
}

export function reasonOf(error: unknown): string {
  if (error instanceof CorpusError) {
    return error.message
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * 读清单本身。清单的骨架坏掉时整批都导不进来；单个条目坏掉只丢那一条，
 * 其余照常导入并各带一条失败原因。
 */
export function readCorpusManifest(directory: string): CorpusManifest {
  const manifest = asRecord(readJson(join(directory, 'manifest.json'), '文章清单'), '文章清单')
  if (manifest.schema !== 1) {
    fail('文章清单的 schema 不是 1')
  }
  if (!Array.isArray(manifest.articles) || manifest.articles.length === 0) {
    fail('文章清单里没有文章')
  }

  const seen = new Set<string>()
  const entries: CorpusManifestEntry[] = []
  const failed: ImportFailure[] = []

  manifest.articles.forEach((item, position) => {
    let id = `manifest 第 ${position + 1} 项`
    try {
      const entry = asRecord(item, `清单第 ${position + 1} 项`)
      id = asText(entry.id, `清单第 ${position + 1} 项的 id`)
      const file = asText(entry.file, `${id} 的文件名`)
      const sha256 = asText(entry.sha256, `${id} 的源文件哈希`)
      if (seen.has(id)) {
        fail(`文章清单里有重复的 id：${id}`)
      }
      if (file !== basename(file) || !file.endsWith('.json')) {
        fail(`${id} 的文件名不是目录内的 .json 文件`)
      }
      if (!/^[0-9a-f]{64}$/.test(sha256)) {
        fail(`${id} 的源文件哈希不是 64 位十六进制`)
      }
      seen.add(id)
      entries.push({ id, file, sha256, position })
    } catch (error) {
      failed.push({ id, reason: reasonOf(error) })
    }
  })

  return { entries, failed }
}

export function readCorpusArticle(
  directory: string,
  entry: CorpusManifestEntry
): CorpusArticle {
  const json = asRecord(readJson(join(directory, entry.file), `文章 ${entry.id}`), `文章 ${entry.id}`)
  if (json.schema !== 1) {
    fail(`文章 ${entry.id} 的 schema 不是 1`)
  }
  const id = asText(json.id, '文章 id')
  if (id !== entry.id) {
    fail(`文章 id ${id} 与清单的 ${entry.id} 不一致`)
  }
  const title = asText(json.label, `${id} 的篇名`)

  const source = asRecord(json.source, `${id} 的来源`)
  const rawKind = asText(source.kind, `${id} 的题型`)
  const kind: ArticleKind =
    rawKind === 'long_match'
      ? 'long_match'
      : rawKind === 'careful_reading'
        ? 'careful_reading'
        : fail(`${id} 的题型不是长篇匹配或仔细阅读`)
  const examYear = asInteger(source.year, `${id} 的年份`)
  const examMonth = asInteger(source.month, `${id} 的月份`)
  const examSet = asInteger(source.set, `${id} 的套数`)
  if (examYear < 2000 || examYear > 2100) {
    fail(`${id} 的年份不合理：${examYear}`)
  }
  if (examMonth < 1 || examMonth > 12) {
    fail(`${id} 的月份不合理：${examMonth}`)
  }
  if (examSet < 1) {
    fail(`${id} 的套数不合理：${examSet}`)
  }

  const sessionLabel = `${examYear}年${examMonth}月`
  const setLabel = `第${examSet}套`
  const titleParts = title.split(' · ')
  if (
    titleParts.length !== 3 ||
    titleParts[0] !== sessionLabel ||
    titleParts[1] !== setLabel
  ) {
    fail(`${id} 的篇名结构与来源不一致：${title}`)
  }
  const kindLabel = titleParts[2]
  const kindMatchesLabel =
    kind === 'long_match'
      ? kindLabel === LONG_MATCH
      : kindLabel.startsWith(CAREFUL_READING)
  if (!kindMatchesLabel) {
    fail(`${id} 的篇名题型与来源的题型不一致：${kindLabel}`)
  }

  const sourcePdf = asText(source.pdf, `${id} 的源 PDF`)
  const sha256 = asText(source.sha256, `${id} 的源文件哈希`)
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    fail(`${id} 的源文件哈希不是 64 位十六进制`)
  }
  if (sha256 !== entry.sha256) {
    fail(`${id} 的源文件哈希与清单不一致`)
  }
  const pages = source.pages
  if (!Array.isArray(pages) || pages.length !== 2) {
    fail(`${id} 的页码不是一对`)
  }
  const pageStart = asInteger(pages[0], `${id} 的起始页`)
  const pageEnd = asInteger(pages[1], `${id} 的结束页`)
  if (pageStart < 1 || pageEnd < pageStart) {
    fail(`${id} 的页码区间不合理`)
  }

  if (!Array.isArray(json.paragraphs) || json.paragraphs.length === 0) {
    fail(`${id} 没有段落`)
  }
  const paragraphIds = new Set<string>()
  const paragraphs = json.paragraphs.map((item, paragraphIndex): CorpusParagraph => {
    const paragraphNumber = `第 ${paragraphIndex + 1} 段`
    const paragraph = asRecord(item, `${id} ${paragraphNumber}`)
    const paragraphId = asText(paragraph.id, `${id} ${paragraphNumber}的 id`)
    if (paragraphIds.has(paragraphId)) {
      fail(`${id} 有重复的段落 id：${paragraphId}`)
    }
    paragraphIds.add(paragraphId)

    const text = asText(paragraph.text, `${id} ${paragraphNumber}的正文`)
    assertEnglishBody(text, `${id} ${paragraphNumber}`)
    const paragraphPageStart = asInteger(
      paragraph.page_start,
      `${id} ${paragraphNumber}的起始页`
    )
    const paragraphPageEnd = asInteger(paragraph.page_end, `${id} ${paragraphNumber}的结束页`)
    if (
      paragraphPageStart < pageStart ||
      paragraphPageEnd > pageEnd ||
      paragraphPageEnd < paragraphPageStart
    ) {
      fail(`${id} ${paragraphNumber}的页码超出来源页码范围`)
    }

    if (!Array.isArray(paragraph.sentences) || paragraph.sentences.length === 0) {
      fail(`${id} ${paragraphNumber}没有句子`)
    }
    let previousEnd = 0
    const sentences = paragraph.sentences.map((rawSentence, sentenceIndex): CorpusSentence => {
      const sentenceNumber = `第 ${sentenceIndex + 1} 句`
      const sentence = asRecord(rawSentence, `${id} ${paragraphNumber}${sentenceNumber}`)
      const sentenceText = asText(sentence.text, `${id} ${paragraphNumber}${sentenceNumber}的正文`)
      assertEnglishBody(sentenceText, `${id} ${paragraphNumber}${sentenceNumber}`)
      const start = asInteger(sentence.start, `${id} ${paragraphNumber}${sentenceNumber}的起点`)
      const end = asInteger(sentence.end, `${id} ${paragraphNumber}${sentenceNumber}的终点`)
      const page = asInteger(sentence.page, `${id} ${paragraphNumber}${sentenceNumber}的页码`)
      if (start < 0 || end <= start || end > text.length) {
        fail(`${id} ${paragraphNumber}${sentenceNumber}的字符区间越界`)
      }
      if (start < previousEnd) {
        fail(`${id} ${paragraphNumber}${sentenceNumber}与前一句重叠`)
      }
      if (text.slice(start, end) !== sentenceText) {
        fail(`${id} ${paragraphNumber}${sentenceNumber}与正文对不上`)
      }
      if (page < paragraphPageStart || page > paragraphPageEnd) {
        fail(`${id} ${paragraphNumber}${sentenceNumber}的页码超出该段`)
      }
      previousEnd = end
      return { ordinal: sentenceIndex, text: sentenceText, start, end, page }
    })

    return {
      id: paragraphId,
      ordinal: paragraphIndex,
      text,
      pageStart: paragraphPageStart,
      pageEnd: paragraphPageEnd,
      sentences
    }
  })

  const paragraphsById = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph]))
  const rawAnnotations = json.annotations ?? []
  if (!Array.isArray(rawAnnotations)) {
    fail(`${id} 的原文注释不是数组`)
  }
  const annotationKeys = new Set<string>()
  const annotations = rawAnnotations.map((item, index): CorpusAnnotation => {
    const number = `第 ${index + 1} 条原文注释`
    const annotation = asRecord(item, `${id} ${number}`)
    const surface = asText(annotation.surface, `${id} ${number}的词形`)
    const gloss = asText(annotation.gloss, `${id} ${number}的释义`)
    const paragraphId = asText(annotation.paragraph, `${id} ${number}所在的段落`)
    const paragraph = paragraphsById.get(paragraphId)
    if (!paragraph) {
      fail(`${id} ${number}指向不存在的段落 ${paragraphId}`)
    }
    const sentenceOrdinal = asInteger(
      annotation.sentence,
      `${id} ${number}所在的句子`
    )
    const sentence = paragraph.sentences[sentenceOrdinal]
    if (!sentence) {
      fail(`${id} ${number}指向不存在的第 ${sentenceOrdinal} 句`)
    }
    const start = asInteger(annotation.start, `${id} ${number}的起点`)
    const end = asInteger(annotation.end, `${id} ${number}的终点`)
    if (start < 0 || end <= start || end > paragraph.text.length) {
      fail(`${id} ${number}的字符区间越界`)
    }
    if (paragraph.text.slice(start, end) !== surface) {
      fail(`${id} ${number}的区间与 ${surface} 对不上`)
    }
    if (start < sentence.start || end > sentence.end) {
      fail(`${id} ${number}超出所在句`)
    }
    const key = `${paragraphId}:${start}`
    if (annotationKeys.has(key)) {
      fail(`${id} ${number}与另一条注释落在同一个词上`)
    }
    annotationKeys.add(key)
    return { paragraphId, sentenceOrdinal, ordinal: index, surface, gloss, start, end }
  })

  const sentenceCount = paragraphs.reduce(
    (total, paragraph) => total + paragraph.sentences.length,
    0
  )
  const wordCount = paragraphs.reduce(
    (total, paragraph) => total + paragraph.text.split(/\s+/).filter(Boolean).length,
    0
  )
  const stats = asRecord(json.stats, `${id} 的统计`)
  if (asInteger(stats.paragraphs, `${id} 统计里的段落数`) !== paragraphs.length) {
    fail(`${id} 的段落数与统计不一致`)
  }
  if (asInteger(stats.sentences, `${id} 统计里的句子数`) !== sentenceCount) {
    fail(`${id} 的句子数与统计不一致`)
  }
  if (asInteger(stats.words, `${id} 统计里的词数`) !== wordCount) {
    fail(`${id} 的词数与统计不一致`)
  }

  return {
    id,
    title,
    kind,
    kindLabel,
    sessionKey: `${examYear}-${String(examMonth).padStart(2, '0')}`,
    sessionLabel,
    setLabel,
    examYear,
    examMonth,
    examSet,
    wordCount,
    pageStart,
    pageEnd,
    sourcePdf,
    sha256,
    bodyText: paragraphs.map((paragraph) => paragraph.text).join('\n\n'),
    paragraphs,
    annotations
  }
}
