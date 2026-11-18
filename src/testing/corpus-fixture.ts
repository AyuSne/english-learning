import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/**
 * 测试用的语料最小构造：按真实语料的 JSON 形状写出 manifest 与单篇文件，
 * 也能写出故意坏掉的文章，用来验证导入的校验与部分成功。
 */
export type FixtureAnnotation = {
  surface: string
  gloss: string
  paragraph: number
  sentence: number
}

export type FixtureArticleOptions = {
  id: string
  /** 每段一句或多句；句子文本按空格拼接成段，字符区间由构造器算好。 */
  sentences: string[][]
  label?: string
  kind?: 'long_match' | 'careful_reading'
  year?: number
  month?: number
  set?: number
  sha256?: string
  annotations?: readonly FixtureAnnotation[]
}

export type FixtureEntry = {
  id: string
  file: string
  json: Record<string, unknown>
}

const KIND_LABEL: Record<NonNullable<FixtureArticleOptions['kind']>, string> = {
  long_match: '长篇匹配',
  careful_reading: '仔细阅读 Passage One'
}

function sha256Of(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function fixtureArticle(options: FixtureArticleOptions): FixtureEntry {
  const kind = options.kind ?? 'careful_reading'
  const year = options.year ?? 2024
  const month = options.month ?? 6
  const set = options.set ?? 1
  const sha256 = options.sha256 ?? sha256Of(options.id)
  const label = options.label ?? `${year}年${month}月 · 第${set}套 · ${KIND_LABEL[kind]}`

  const paragraphs = options.sentences.map((sentences, paragraphIndex) => {
    let cursor = 0
    const built = sentences.map((text) => {
      const start = cursor
      cursor += text.length + 1
      return { text, start, end: start + text.length, page: 1 }
    })
    return {
      id: kind === 'long_match' ? String.fromCharCode(65 + paragraphIndex) : String(paragraphIndex + 1),
      text: sentences.join(' '),
      page_start: 1,
      page_end: 1,
      sentences: built
    }
  })

  const annotations = (options.annotations ?? []).map((annotation) => {
    const paragraph = paragraphs[annotation.paragraph]
    if (!paragraph) {
      throw new Error(`fixture ${options.id}: 没有第 ${annotation.paragraph} 段`)
    }
    const sentence = paragraph.sentences[annotation.sentence]
    if (!sentence) {
      throw new Error(`fixture ${options.id}: 第 ${annotation.paragraph} 段没有 ${annotation.sentence} 句`)
    }
    const offset = sentence.text.indexOf(annotation.surface)
    if (offset < 0) {
      throw new Error(`fixture ${options.id}: 句子中没有 ${annotation.surface}`)
    }
    return {
      surface: annotation.surface,
      gloss: annotation.gloss,
      start: sentence.start + offset,
      end: sentence.start + offset + annotation.surface.length,
      paragraph: paragraph.id,
      sentence: annotation.sentence
    }
  })

  const words = paragraphs.reduce(
    (total, paragraph) => total + paragraph.text.split(/\s+/).filter(Boolean).length,
    0
  )

  const json: Record<string, unknown> = {
    schema: 1,
    id: options.id,
    label,
    source: {
      exam: 'CET-6',
      year,
      month,
      set,
      kind,
      pdf: `真题PDF/六级/${year}年${month}月英语六级真题(第${set}套).pdf`,
      sha256,
      pages: [1, 2]
    },
    paragraphs,
    annotations,
    stats: {
      paragraphs: paragraphs.length,
      sentences: paragraphs.reduce((total, paragraph) => total + paragraph.sentences.length, 0),
      words
    }
  }

  return { id: options.id, file: `${options.id}.json`, json }
}

/** 与导入器一致的 manifest 形状；entries 顺序就是库内顺序。 */
export function fixtureManifest(entries: readonly FixtureEntry[]): Record<string, unknown> {
  return {
    schema: 1,
    articles: entries.map((entry) => {
      const json = entry.json as {
        label: string
        source: { kind: string; sha256: string; pages: number[] }
        stats: unknown
        annotations: unknown[]
      }
      return {
        id: entry.id,
        label: json.label,
        file: entry.file,
        kind: json.source.kind,
        pages: json.source.pages,
        stats: json.stats,
        annotations: json.annotations.length,
        sha256: json.source.sha256
      }
    })
  }
}

export function writeCorpusDirectory(
  directory: string,
  entries: readonly FixtureEntry[],
  options: { manifest?: Record<string, unknown> | string } = {}
): void {
  mkdirSync(directory, { recursive: true })
  for (const entry of entries) {
    writeFileSync(join(directory, entry.file), `${JSON.stringify(entry.json, null, 1)}\n`, 'utf8')
  }
  const manifest = options.manifest ?? fixtureManifest(entries)
  writeFileSync(
    join(directory, 'manifest.json'),
    typeof manifest === 'string' ? manifest : `${JSON.stringify(manifest, null, 1)}\n`,
    'utf8'
  )
}
