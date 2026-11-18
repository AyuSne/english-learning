import { Fragment, type ReactNode } from 'react'

/**
 * 学习内容的 Markdown 渲染。只认最常用的几种标记：段落、换行、标题、有序/无序列表、
 * 粗体、斜体、行内代码。解析成结构以后再交给 React 渲染，不拼 HTML，也不执行任何标记里的内容。
 */

export type InlineSpan = {
  kind: 'text' | 'strong' | 'em' | 'code'
  text: string
}

export type LearningBlock =
  | { kind: 'paragraph'; lines: InlineSpan[][] }
  | { kind: 'list'; ordered: boolean; items: InlineSpan[][] }
  | { kind: 'heading'; level: 3 | 4; spans: InlineSpan[] }

const INLINE_MARKS =
  /(`[^`\n]+`|\*\*(?!\s)[^*\n]+(?<!\s)\*\*|\*(?!\s)[^*\n]+(?<!\s)\*)/g

/** 一行里的粗体、斜体与行内代码；认不出的标记按原样留着。 */
export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let cursor = 0
  for (const match of text.matchAll(INLINE_MARKS)) {
    const index = match.index ?? 0
    if (index > cursor) {
      spans.push({ kind: 'text', text: text.slice(cursor, index) })
    }
    const token = match[0]
    if (token.startsWith('`')) {
      spans.push({ kind: 'code', text: token.slice(1, -1) })
    } else if (token.startsWith('**')) {
      spans.push({ kind: 'strong', text: token.slice(2, -2) })
    } else {
      spans.push({ kind: 'em', text: token.slice(1, -1) })
    }
    cursor = index + token.length
  }
  if (cursor < text.length) {
    spans.push({ kind: 'text', text: text.slice(cursor) })
  }
  return spans
}

/** 把学习内容拆成段落、列表与标题；空行分段，段内换行保留。 */
export function parseLearningBody(body: string): LearningBlock[] {
  const blocks: LearningBlock[] = []
  let paragraph: InlineSpan[][] | null = null
  let list: { ordered: boolean; items: InlineSpan[][] } | null = null

  const flushParagraph = (): void => {
    if (paragraph !== null) {
      blocks.push({ kind: 'paragraph', lines: paragraph })
      paragraph = null
    }
  }
  const flushList = (): void => {
    if (list !== null) {
      blocks.push({ kind: 'list', ...list })
      list = null
    }
  }

  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        kind: 'heading',
        level: (heading[1] as string).length <= 2 ? 3 : 4,
        spans: parseInline(heading[2] as string)
      })
      continue
    }

    const unordered = /^[-*+]\s+(.*)$/.exec(line)
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line)
    if (unordered || ordered) {
      flushParagraph()
      const isOrdered = ordered !== null
      if (list === null || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push(parseInline((unordered ?? ordered)?.[1] ?? ''))
      continue
    }

    flushList()
    if (paragraph === null) {
      paragraph = []
    }
    paragraph.push(parseInline(line))
  }

  flushParagraph()
  flushList()
  return blocks
}

/** 学习内容正文。结构来自 parseLearningBody，文字一律作为 React 文本节点落下。 */
export function LearningBody({ body }: { body: string }) {
  const blocks = parseLearningBody(body)
  return (
    <div className="entry-note-body">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Heading = block.level === 3 ? 'h3' : 'h4'
          return <Heading key={index}>{renderSpans(block.spans)}</Heading>
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul'
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderSpans(item)}</li>
              ))}
            </List>
          )
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderSpans(line)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

function renderSpans(spans: readonly InlineSpan[]): ReactNode[] {
  return spans.map((span, index) => {
    if (span.kind === 'strong') return <strong key={index}>{span.text}</strong>
    if (span.kind === 'em') return <em key={index}>{span.text}</em>
    if (span.kind === 'code') return <code key={index}>{span.text}</code>
    return span.text
  })
}
