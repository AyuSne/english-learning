export type SourceRange = {
  /** UTF-16 offsets into the original source, [start, end). */
  start: number
  end: number
}

export type MarkdownLeaf = SourceRange & {
  kind: 'text' | 'break' | 'code'
  /** Exactly source.slice(start, end), including the original line ending for a break. */
  text: string
}

export type MarkdownSpan =
  | MarkdownLeaf
  // A formatting container includes its delimiters; only leaves carry visible text.
  | (SourceRange & { kind: 'strong' | 'em'; children: MarkdownSpan[] })

type Paragraph = SourceRange & { kind: 'paragraph'; spans: MarkdownSpan[] }
type List = SourceRange & { kind: 'list'; ordered: boolean; items: MarkdownListItem[] }

/** A list item includes its marker, but not the newline after the item. */
export type MarkdownListItem = SourceRange & { spans: MarkdownSpan[] }

/** Block ranges include their source syntax, but not the newline after the block. */
export type MarkdownBlock =
  | Paragraph
  | List
  | (SourceRange & { kind: 'heading'; level: 3 | 4; spans: MarkdownSpan[] })

const HEADING = /^(#{1,6})\s+(?=\S)/
const LIST_ITEM = /^(\d+[.)]|[-*+])\s+(?=\S)/

type EmphasisWidth = 1 | 2

type OpenEmphasis = { width: EmphasisWidth; start: number; children: MarkdownSpan[] }

function parseInline(source: string, start: number, end: number): MarkdownSpan[] {
  const spans: MarkdownSpan[] = []
  const open: OpenEmphasis[] = []
  const current = (): MarkdownSpan[] => open.at(-1)?.children ?? spans
  const appendText = (from: number, to: number): void => {
    if (from === to) return
    const target = current()
    const previous = target.at(-1)
    if (previous?.kind === 'text' && previous.end === from) {
      previous.end = to
      previous.text = source.slice(previous.start, to)
    } else {
      target.push({ kind: 'text', text: source.slice(from, to), start: from, end: to })
    }
  }
  const discardUnclosed = (frame: OpenEmphasis): void => {
    appendText(frame.start, frame.start + frame.width)
    for (const child of frame.children) {
      if (child.kind === 'text') appendText(child.start, child.end)
      else current().push(child)
    }
  }

  let cursor = start
  for (const mark of source.slice(start, end).matchAll(/`[^`]+`|\*+/g)) {
    let markStart = start + mark.index
    const markEnd = markStart + mark[0].length
    appendText(cursor, markStart)
    cursor = markEnd

    if (mark[0].startsWith('`')) {
      const codeStart = markStart + 1
      const codeEnd = markEnd - 1
      current().push({ kind: 'code', text: source.slice(codeStart, codeEnd), start: codeStart, end: codeEnd })
      continue
    }

    const canOpen = markEnd < end && /\S/.test(source[markEnd])
    const canClose = markStart > start && /\S/.test(source[markStart - 1])
    while (canClose && markStart < markEnd && open.length > 0) {
      const remaining = markEnd - markStart
      // Prefer an exact match for one/two stars; a longer run can close nested styles.
      const top = open.length - 1
      const closing = remaining >= 3 || (!canOpen && open[top].width < remaining && open.length === 1)
        ? top
        : open.findLastIndex((frame) => frame.width === remaining)
      if (closing < 0) break
      while (open.length - 1 > closing) discardUnclosed(open.pop()!)
      const frame = open.pop()!
      markStart += frame.width
      current().push({
        kind: frame.width === 2 ? 'strong' : 'em',
        start: frame.start,
        end: markStart,
        children: frame.children
      })
    }

    // Only one instance of each style can be open. A triple opens em around strong.
    const remaining = markEnd - markStart
    const widths: EmphasisWidth[] = remaining === 3 ? [1, 2] :
      remaining === 1 || remaining === 2 ? [remaining] : []
    if (canOpen && widths.every((width) => !open.some((frame) => frame.width === width))) {
      for (const width of widths) {
        open.push({ width, start: markStart, children: [] })
        markStart += width
      }
    }
    appendText(markStart, markEnd)
  }
  appendText(cursor, end)
  while (open.length > 0) discardUnclosed(open.pop()!)
  return spans
}

function* sourceLines(source: string): Generator<SourceRange> {
  let start = 0
  for (const newline of source.matchAll(/\r\n|[\r\n]/g)) {
    yield { start, end: newline.index }
    start = newline.index + newline[0].length
  }
  if (start < source.length) yield { start, end: source.length }
}

/** Parse the app's Markdown subset directly against the original source. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let open: Paragraph | List | undefined
  for (const { start, end } of sourceLines(source)) {
    const line = source.slice(start, end)
    if (!/\S/.test(line)) {
      open = undefined
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length <= 2 ? 3 : 4,
        start,
        end,
        spans: parseInline(source, start + heading[0].length, end)
      })
      open = undefined
      continue
    }

    const marker = LIST_ITEM.exec(line)
    if (marker) {
      const ordered = /\d/.test(marker[1][0])
      if (open?.kind !== 'list' || open.ordered !== ordered) {
        open = { kind: 'list', ordered, start, end, items: [] }
        blocks.push(open)
      }
      open.end = end
      open.items.push({ start, end, spans: parseInline(source, start + marker[0].length, end) })
      continue
    }

    if (open?.kind === 'paragraph') {
      const breakStart = open.end
      open.spans.push({
        kind: 'break',
        text: source.slice(breakStart, start),
        start: breakStart,
        end: start
      })
      open.end = end
    } else {
      open = { kind: 'paragraph', start, end, spans: [] }
      blocks.push(open)
    }
    for (const span of parseInline(source, start, end)) open.spans.push(span)
  }
  return blocks
}
