import { useState } from 'react'
import type { EntryListItem, EntrySentence } from '../../../shared/entries'
import { moveEntrySentenceTo } from '../api'
import { messageOf } from '../errors'
import { sentenceSourceText } from './format'

/**
 * 一条原句：原句文字里把当时圈下的词形标出来，下面写清楚它出处的段、句、页。
 * 回到原文 / 重新圈定 / 拆到… / 删除 四个动作在悬停与键盘聚焦时出现，
 * 窄窗口常驻（见 entries.css）。
 */
export function SentenceRow({
  sentence,
  otherEntries,
  busy,
  onBack,
  onReselect,
  onRequestDelete,
  onChanged,
  onEntryGone
}: {
  sentence: EntrySentence
  otherEntries: readonly EntryListItem[]
  busy: boolean
  onBack: () => void
  onReselect: () => void
  onRequestDelete: () => void
  /** 改完之后让词条页重读一遍，并把结果说给用户。 */
  onChanged: (message: string) => void
  /** 这条原句被拆走后源词条没了。 */
  onEntryGone: () => void
}) {
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitTarget, setSplitTarget] = useState('new')
  const [splitting, setSplitting] = useState(false)
  const [splitError, setSplitError] = useState<string | null>(null)

  async function submitSplit(): Promise<void> {
    if (splitting) return
    setSplitting(true)
    setSplitError(null)
    try {
      const result = await moveEntrySentenceTo({
        entrySentenceId: sentence.id,
        target:
          splitTarget === 'new'
            ? { kind: 'new' }
            : { kind: 'entry', entryId: splitTarget }
      })
      if (result.status === 'moved') {
        onChanged(`原句已拆到「${result.to.mainForm}」。`)
        if (result.from === null) {
          onEntryGone()
        }
        return
      }
      if (result.status === 'missing') {
        setSplitError('这条原句或目标词条已经不在了。')
        return
      }
      setSplitError(
        result.reason === 'duplicate'
          ? '目标词条已经有这条原句了。'
          : '这条原句已经在这个词条里。'
      )
    } catch (error) {
      setSplitError(messageOf(error))
    } finally {
      setSplitting(false)
    }
  }

  return (
    <li className="entry-sentence" data-entry-sentence-id={sentence.id}>
      <blockquote className="entry-sentence-text">
        <SentenceText sentence={sentence} />
      </blockquote>
      <p className="entry-sentence-source">{sentenceSourceText(sentence)}</p>

      <div className="entry-sentence-actions">
        <button type="button" className="entry-action" onClick={onBack}>
          回到原文
        </button>
        <button type="button" className="entry-action" onClick={onReselect}>
          重新圈定
        </button>
        <button
          type="button"
          className="entry-action"
          aria-expanded={splitOpen}
          onClick={() => setSplitOpen((open) => !open)}
        >
          拆到…
        </button>
        <button
          type="button"
          className="entry-action entry-action-danger"
          disabled={busy}
          onClick={onRequestDelete}
        >
          删除
        </button>
      </div>

      {splitOpen ? (
        <div className="entry-split" role="group" aria-label="拆分原句">
          <label className="entry-split-field">
            <span>拆到</span>
            <select
              aria-label="拆到哪个词条"
              value={splitTarget}
              onChange={(event) => setSplitTarget(event.target.value)}
            >
              <option value="new">新词条</option>
              {otherEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.mainForm}
                </option>
              ))}
            </select>
          </label>
          <div className="entry-split-actions">
            <button
              type="button"
              className="button"
              disabled={splitting}
              onClick={() => void submitSplit()}
            >
              拆过去
            </button>
            <button type="button" className="button" onClick={() => setSplitOpen(false)}>
              取消
            </button>
          </div>
          {splitError === null ? null : (
            <p className="entry-error" role="alert">
              {splitError}
            </p>
          )}
        </div>
      ) : null}
    </li>
  )
}

/** 原句里把当时圈下的词形标出来；位置对不上就退化成整句。 */
function SentenceText({ sentence }: { sentence: EntrySentence }) {
  const start = sentence.surfaceOffset
  const end = start + sentence.surface.length
  if (start < 0 || end > sentence.sentenceText.length) {
    return <>{sentence.sentenceText}</>
  }
  return (
    <>
      {sentence.sentenceText.slice(0, start)}
      <mark className="entry-surface">{sentence.surface}</mark>
      {sentence.sentenceText.slice(end)}
    </>
  )
}
