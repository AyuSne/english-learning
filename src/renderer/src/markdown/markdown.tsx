import type { ReactNode } from 'react'
import type { MarkdownBlock as Block, MarkdownSpan, SourceRange } from './parse-markdown'

function sourceAttributes({ start, end }: SourceRange) {
  return { 'data-source-start': start, 'data-source-end': end }
}

function renderSpans(spans: readonly MarkdownSpan[]): ReactNode[] {
  return spans.map((span) => {
    if ('children' in span) {
      const Emphasis = span.kind === 'strong' ? 'strong' : 'em'
      return <Emphasis key={span.start}>{renderSpans(span.children)}</Emphasis>
    }

    // A marked span has exactly one direct Text child. CRLF stays unmodified;
    // only the break itself needs pre-wrap, so ordinary spaces still collapse.
    const leaf = (
      <span
        key={span.start}
        data-md-leaf=""
        {...sourceAttributes(span)}
        style={span.kind === 'break' ? { whiteSpace: 'pre-wrap' } : undefined}
      >
        {span.text}
      </span>
    )
    return span.kind === 'code' ? <code key={span.start}>{leaf}</code> : leaf
  })
}

type BlockDecoration = { className?: string; suffix?: ReactNode }

/** Decorate individual paragraphs, headings or list items, not an entire list. */
export function MarkdownBlock({ block, decorate }: {
  block: Block
  decorate?: (range: SourceRange) => BlockDecoration | undefined
}) {
  const attributes = { 'data-md-block': block.kind, ...sourceAttributes(block) }
  if (block.kind === 'list') {
    const List = block.ordered ? 'ol' : 'ul'
    return (
      <List {...attributes} start={block.ordered && block.firstNumber !== 1 ? block.firstNumber : undefined}>
        {block.items.map((item) => {
          const decoration = decorate?.(item)
          return (
            <li key={item.start} data-md-block="list-item" {...sourceAttributes(item)} className={decoration?.className}>
              {renderSpans(item.spans)}{decoration?.suffix}
            </li>
          )
        })}
      </List>
    )
  }
  const Tag = block.kind === 'paragraph' ? 'p' : block.level === 3 ? 'h3' : 'h4'
  const decoration = decorate?.(block)
  return <Tag {...attributes} className={decoration?.className}>{renderSpans(block.spans)}{decoration?.suffix}</Tag>
}

export function Markdown({ blocks, className }: { blocks: readonly Block[]; className?: string }) {
  return (
    <div className={className}>
      {blocks.map((block) => <MarkdownBlock key={block.start} block={block} />)}
    </div>
  )
}
