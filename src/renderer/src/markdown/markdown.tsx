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

/** Render a single block, e.g. when the caller needs its own block decoration. */
export function MarkdownBlock({ block }: { block: Block }) {
  const attributes = { 'data-md-block': block.kind, ...sourceAttributes(block) }
  if (block.kind === 'heading') {
    const Heading = block.level === 3 ? 'h3' : 'h4'
    return <Heading {...attributes}>{renderSpans(block.spans)}</Heading>
  }
  if (block.kind === 'list') {
    const List = block.ordered ? 'ol' : 'ul'
    return (
      <List {...attributes}>
        {block.items.map((item) => (
          <li key={item.start} data-md-block="list-item" {...sourceAttributes(item)}>
            {renderSpans(item.spans)}
          </li>
        ))}
      </List>
    )
  }
  return <p {...attributes}>{renderSpans(block.spans)}</p>
}

export function Markdown({ blocks, className }: { blocks: readonly Block[]; className?: string }) {
  return (
    <div className={className}>
      {blocks.map((block) => <MarkdownBlock key={block.start} block={block} />)}
    </div>
  )
}
