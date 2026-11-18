import type { Pin } from '../../../shared/pins'
import type { ThreadAnswer } from '../../../shared/threads'
import { splitAnswerParagraphs, targetLabel, pinTouchesParagraph } from './pin-text'

/**
 * 回答正文按段落渲染：被钉住的段落左侧常驻琥珀竖条，刚钉的那条在段尾闪一次角标。
 * 段落带上整版正文里的起始位置，选区据此换算成主进程认识的字符区间。
 */
export type PinMarks = {
  pins: readonly Pin[]
  freshPinIds: readonly string[]
  sourceHitPinId: string | null
}

export function AnswerText({
  answer,
  marks
}: {
  answer: ThreadAnswer
  marks: PinMarks
}) {
  const paragraphs = splitAnswerParagraphs(answer.text)
  const answerPins = marks.pins.filter((pin) => pin.provenance.answerId === answer.id)
  /** 跨段钉住只在第一段闪一次角标。 */
  const firstParagraph = new Map<string, number>()
  paragraphs.forEach((paragraph, index) => {
    for (const pin of answerPins) {
      if (!firstParagraph.has(pin.id) && pinTouchesParagraph(pin, paragraph)) {
        firstParagraph.set(pin.id, index)
      }
    }
  })

  return (
    <div className="assistant-text" data-answer-id={answer.id}>
      {paragraphs.map((paragraph, index) => {
        const hits = answerPins.filter((pin) => pinTouchesParagraph(pin, paragraph))
        const fresh =
          hits.find(
            (pin) =>
              marks.freshPinIds.includes(pin.id) && firstParagraph.get(pin.id) === index
          ) ?? null
        const sourceHit = hits.some((pin) => pin.id === marks.sourceHitPinId)
        return (
          <div
            key={index}
            className={[
              'assistant-paragraph',
              hits.length > 0 ? 'is-pinned' : '',
              sourceHit ? 'is-source-hit' : ''
            ]
              .filter((name) => name !== '')
              .join(' ')}
            data-para-start={paragraph.start}
          >
            <p className="assistant-paragraph-text">{paragraph.text}</p>
            {fresh === null ? null : (
              <span className="pin-badge">已钉 · {targetLabel(fresh.target)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
