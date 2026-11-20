import type { ReadingParagraph } from '../../../shared/reading'
import type { ReadingBlock, ReadingPart } from './content'

/**
 * 一段正文的渲染：句子块、原文注释，以及已收集/本次选中的词状态。
 * 所有字符都来自块结构，组件不加工正文文字。
 */
export function ReadingParagraphView({
  paragraph,
  blocks,
  focusedSentenceOrdinal = null,
  focusedParagraph = false
}: {
  paragraph: ReadingParagraph
  blocks: readonly ReadingBlock[]
  /** 从词条跳过来或搜索命中一句时，这一句整句底色高亮。 */
  focusedSentenceOrdinal?: number | null
  /**
   * 全局搜索跨句命中：没有单一句可定位，但段落是真实目标。
   * 整段标出来，不冒充某一句，也不写进原句定位 state。
   */
  focusedParagraph?: boolean
}) {
  return (
    <div className="reading-row">
      {paragraph.letter === null ? null : (
        <span className="reading-letter" aria-hidden="true">
          {paragraph.letter}
        </span>
      )}
      <p
        className={
          focusedParagraph ? 'reading-paragraph reading-paragraph-focused' : 'reading-paragraph'
        }
        data-paragraph-id={paragraph.id}
      >
        {blocks.map((block, index) =>
          block.kind === 'gap' ? (
            <span key={index}>{block.text}</span>
          ) : (
            <span
              key={index}
              className={
                block.ordinal === focusedSentenceOrdinal
                  ? 'reading-sentence reading-sentence-focused'
                  : 'reading-sentence'
              }
              data-paragraph-id={paragraph.id}
              data-paragraph-ordinal={paragraph.ordinal}
              data-sentence-ordinal={block.ordinal}
            >
              {block.parts.map((part, partIndex) => (
                <ReadingPartView key={partIndex} part={part} />
              ))}
            </span>
          )
        )}
      </p>
      {paragraph.annotations.length === 0 ? null : (
        <aside className="reading-notes" aria-label="原文注释">
          {paragraph.annotations.map((annotation) => (
            <p className="reading-note" key={`${annotation.start}-${annotation.end}`}>
              <span className="reading-note-word">{annotation.surface}</span>
              <span className="reading-note-gloss">{annotation.gloss}</span>
            </p>
          ))}
        </aside>
      )}
    </div>
  )
}

function ReadingPartView({ part }: { part: ReadingPart }) {
  const mark = part.mark
  const className = [
    part.kind === 'annotation' ? 'reading-annotated' : '',
    mark === undefined ? '' : mark.selected ? 'reading-selected' : 'reading-collected'
  ]
    .filter(Boolean)
    .join(' ')

  const entryId = mark?.entryId ?? null
  const markProps =
    entryId === null
      ? {}
      : {
          'data-entry-id': entryId,
          role: 'button',
          tabIndex: 0,
          'aria-label': `查看词条 ${mark?.label ?? ''}`
        }

  if (part.kind === 'annotation') {
    return (
      <span className={className || undefined} data-gloss={part.gloss} {...markProps}>
        {part.text}
      </span>
    )
  }
  return (
    <span className={className || undefined} {...markProps}>
      {part.text}
    </span>
  )
}
