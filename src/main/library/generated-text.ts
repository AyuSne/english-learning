/**
 * 生成文章正文的切分。保存整条回答时不做「一篇一段、一段一句」的偷懒处理：
 *
 * - 段落按空行切（CRLF、单换行与只含空白字符的行都认），段内单换行原样保留；
 * - 句在段内切，交给 Node 22 的 `Intl.Segmenter('en', { granularity: 'sentence' })`；
 * - 每条句子带段内 UTF-16 `[start, end)`，`text` 必须等于 `paragraph.text.slice(start, end)`，
 *   阅读页的选词、收原句与回链都直接用这两个偏移。
 *
 * 末句没有标点也保留（例如生成内容写到一半就结束）；句间空白留在正文里，
 * 由阅读页当作 gap 渲染，不并进任何一条句子。
 */

export type GeneratedSentence = {
  text: string
  /** 段内字符区间，UTF-16 下标。 */
  start: number
  end: number
}

export type GeneratedParagraph = {
  /** 段落正文，首尾不含空行与空白，段内换行原样保留。 */
  text: string
  sentences: GeneratedSentence[]
}

const SENTENCE_SEGMENTER = new Intl.Segmenter('en', { granularity: 'sentence' })

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character)
}

/** 统一换行符：CRLF 与单独的 CR 都当 LF，偏移因此按同一份正文计算。 */
export function normalizeGeneratedText(source: string): string {
  return source.replace(/\r\n?/g, '\n').trim()
}

/** 段落正文：空行（含只有空白的行）分段，段内单换行保留。 */
function paragraphTexts(source: string): string[] {
  const lines = normalizeGeneratedText(source).split('\n')
  const paragraphs: string[] = []
  let current: string[] = []

  const flush = (): void => {
    if (current.length === 0) return
    const text = current.join('\n').trim()
    if (text !== '') paragraphs.push(text)
    current = []
  }

  for (const line of lines) {
    if (line.trim() === '') {
      flush()
      continue
    }
    current.push(line)
  }
  flush()
  return paragraphs
}

/**
 * `Intl.Segmenter` 在英文里会把「Mr. Lee」的称呼拆成两句；把这类缩写与单个大写首字母
 * 的片段并回下一句。小数（3.14）与 e.g. / U.S. 由 ICU 自己处理，不额外动。
 */
function endsWithAbbreviation(text: string): boolean {
  const lastWord = text.split(/\s+/u).at(-1) ?? ''
  return (
    /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs)\.$/.test(lastWord) ||
    /^[A-Z]\.$/.test(lastWord) ||
    /^(?:[A-Z]\.)+$/.test(lastWord)
  )
}

function sentencesOf(paragraph: string): GeneratedSentence[] {
  const spans: { start: number; end: number }[] = []
  for (const segment of SENTENCE_SEGMENTER.segment(paragraph)) {
    let start = segment.index
    let end = segment.index + segment.segment.length
    while (start < end && isWhitespace(paragraph[start])) start += 1
    while (end > start && isWhitespace(paragraph[end - 1])) end -= 1
    if (end <= start) continue
    spans.push({ start, end })
  }

  const merged: { start: number; end: number }[] = []
  for (const span of spans) {
    const previous = merged.at(-1)
    if (previous !== undefined && endsWithAbbreviation(paragraph.slice(previous.start, previous.end))) {
      previous.end = span.end
      continue
    }
    merged.push({ ...span })
  }

  return merged.map((span) => ({
    text: paragraph.slice(span.start, span.end),
    start: span.start,
    end: span.end
  }))
}

/** 把一条回答正文切成可写入 paragraph / sentence 表的段落与句子。 */
export function splitGeneratedText(source: string): GeneratedParagraph[] {
  return paragraphTexts(source).map((text) => ({ text, sentences: sentencesOf(text) }))
}
