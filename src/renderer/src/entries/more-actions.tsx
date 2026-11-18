import { useState } from 'react'
import type { EntryListItem, EntryPage, EntrySentence } from '../../../shared/entries'
import {
  changeEntryMainForm,
  mergeEntries,
  moveEntrySentence,
  moveLearningNote
} from '../api'
import { messageOf } from '../errors'
import { noteExcerpt, sentenceSourceText } from './format'

type MoreForm = 'merge' | 'split' | 'main-form' | 'move-note'

type SentenceChoice = { sentence: EntrySentence; articleTitle: string }

/**
 * 右栏「更多」：合并词条、拆分原句、换主词形、移动学习内容。
 * 每次只铺开一种表单，改完让词条页重读并说一句结果。
 */
export function MoreActions({
  page,
  entries,
  onChanged,
  onEntryGone
}: {
  page: EntryPage
  /** 全部词条，给合并、拆分与移动挑目标。 */
  entries: readonly EntryListItem[]
  onChanged: (message: string) => void
  onEntryGone: () => void
}) {
  const [form, setForm] = useState<MoreForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otherEntries = entries.filter((entry) => entry.id !== page.entry.id)
  const forms = [page.entry.mainForm, ...page.entry.variants]
  const sentences: SentenceChoice[] = page.groups.flatMap((group) =>
    group.sentences.map((sentence) => ({ sentence, articleTitle: group.articleTitle }))
  )

  const [mergeTargetId, setMergeTargetId] = useState('')
  const [mergeMainForm, setMergeMainForm] = useState(page.entry.mainForm)
  const [splitSentenceId, setSplitSentenceId] = useState(sentences[0]?.sentence.id ?? '')
  const [splitTarget, setSplitTarget] = useState('new')
  const [mainForm, setMainForm] = useState(page.entry.mainForm)
  const [moveNoteId, setMoveNoteId] = useState(page.notes[0]?.id ?? '')
  const [moveTarget, setMoveTarget] = useState('')

  const mergeTarget = otherEntries.find((entry) => entry.id === mergeTargetId) ?? null
  const splitChoice = sentences.find((choice) => choice.sentence.id === splitSentenceId) ?? null
  const moveNote = page.notes.find((note) => note.id === moveNoteId) ?? null
  const dropsEntry = page.entry.sentenceCount <= 1

  /** 已经属于本词条的词形不能再建新词条；默认挑一个能用的目标。 */
  function defaultSplitTarget(choice: SentenceChoice | null): string {
    if (choice === null) return ''
    if (choice.sentence.canSplitToNew) return 'new'
    return otherEntries[0]?.id ?? ''
  }

  function open(next: MoreForm): void {
    setForm(next)
    setError(null)
    setMergeTargetId('')
    setMergeMainForm(page.entry.mainForm)
    setSplitSentenceId(sentences[0]?.sentence.id ?? '')
    setSplitTarget(defaultSplitTarget(sentences[0] ?? null))
    setMainForm(page.entry.mainForm)
    setMoveNoteId(page.notes[0]?.id ?? '')
    setMoveTarget('')
  }

  async function submitMerge(): Promise<void> {
    if (mergeTarget === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await mergeEntries({
        sourceEntryId: mergeTarget.id,
        targetEntryId: page.entry.id,
        mainForm: mergeMainForm
      })
      if (result.status === 'merged') {
        setForm(null)
        const repeated =
          result.repeatedSentences > 0 ? `，其中 ${result.repeatedSentences} 条并成一条` : ''
        onChanged(`已把「${mergeTarget.mainForm}」并进来，迁入 ${result.movedSentences} 条原句${repeated}。`)
        return
      }
      if (result.status === 'rejected') {
        setError(
          result.reason === 'main-form'
            ? '合并后的主词形不在已收集的词形里。'
            : '不能把词条并到自己。'
        )
        return
      }
      setError('要合并的词条已经不在了。')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function submitSplit(): Promise<void> {
    if (splitChoice === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await moveEntrySentence({
        entrySentenceId: splitChoice.sentence.id,
        target: splitTarget === 'new' ? { kind: 'new' } : { kind: 'entry', entryId: splitTarget }
      })
      if (result.status === 'moved') {
        setForm(null)
        onChanged(`原句已拆到「${result.to.mainForm}」。`)
        if (result.from === null) {
          onEntryGone()
        }
        return
      }
      if (result.status === 'missing') {
        setError('这条原句或目标词条已经不在了。')
        return
      }
      setError(
        result.reason === 'duplicate'
          ? '目标词条已经有这条原句了。'
          : '这条原句已经在这个词条里。'
      )
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function submitMainForm(): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await changeEntryMainForm({ entryId: page.entry.id, mainForm })
      if (result.status === 'changed') {
        setForm(null)
        onChanged(`主词形已换成「${mainForm}」。`)
        return
      }
      if (result.status === 'rejected') {
        setError('这个词形没有收集过。')
        return
      }
      onEntryGone()
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function submitMoveNote(): Promise<void> {
    if (moveNote === null || moveTarget === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await moveLearningNote({ noteId: moveNote.id, entryId: moveTarget })
      if (result.status === 'saved') {
        const target = entries.find((entry) => entry.id === result.note.entryId)
        setForm(null)
        onChanged(`学习内容已移到「${target?.mainForm ?? '另一个词条'}」。`)
        return
      }
      if (result.status === 'rejected') {
        setError(result.reason === 'same-entry' ? '已经在这个词条里了。' : '目标词条已经不在了。')
        return
      }
      setError('这条学习内容已经不在了。')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  if (form === null) {
    return (
      <div className="entry-more-list">
        <button type="button" className="button" onClick={() => open('merge')}>
          合并词条…
        </button>
        <button
          type="button"
          className="button"
          disabled={sentences.length === 0}
          onClick={() => open('split')}
        >
          拆分原句…
        </button>
        <button type="button" className="button" disabled={forms.length <= 1} onClick={() => open('main-form')}>
          换主词形…
        </button>
        <button
          type="button"
          className="button"
          disabled={page.notes.length === 0}
          onClick={() => open('move-note')}
        >
          移动学习内容…
        </button>
      </div>
    )
  }

  return (
    <div className="entry-more-form" role="group" aria-label={formName(form)}>
      {form === 'merge' ? (
        <>
          <label className="entry-more-field">
            <span>把哪个词条并进来</span>
            <select
              aria-label="要并进来的词条"
              value={mergeTargetId}
              onChange={(event) => {
                setMergeTargetId(event.target.value)
                setMergeMainForm(page.entry.mainForm)
                setError(null)
              }}
            >
              <option value="">选一个词条</option>
              {otherEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.mainForm}（{entry.sentenceCount} 句）
                </option>
              ))}
            </select>
          </label>
          {mergeTarget !== null && mergeTarget.mainForm !== page.entry.mainForm ? (
            <fieldset className="entry-more-forms">
              <legend>合并后的主词形</legend>
              {[page.entry.mainForm, mergeTarget.mainForm].map((candidate) => (
                <label key={candidate}>
                  <input
                    type="radio"
                    name="entry-merge-main-form"
                    value={candidate}
                    checked={mergeMainForm === candidate}
                    onChange={() => setMergeMainForm(candidate)}
                  />
                  {candidate}
                </label>
              ))}
            </fieldset>
          ) : null}
          <p className="entry-more-hint">
            并进来的原句与学习内容都会移到「{page.entry.mainForm}」下，另一个词条消失。
          </p>
          <div className="entries-rail-actions">
            <button type="button" className="button" disabled={mergeTarget === null || busy} onClick={() => void submitMerge()}>
              合并
            </button>
            <button type="button" className="button" onClick={() => setForm(null)}>
              取消
            </button>
          </div>
        </>
      ) : form === 'split' ? (
        <>
          <label className="entry-more-field">
            <span>拆哪一条</span>
            <select
              aria-label="要拆的原句"
              value={splitSentenceId}
              onChange={(event) => {
                const choice =
                  sentences.find((candidate) => candidate.sentence.id === event.target.value) ??
                  null
                setSplitSentenceId(event.target.value)
                setSplitTarget(defaultSplitTarget(choice))
              }}
            >
              {sentences.map((choice) => (
                <option key={choice.sentence.id} value={choice.sentence.id}>
                  {choice.sentence.surface} · {sentenceSourceText(choice.sentence)} ·{' '}
                  {choice.articleTitle}
                </option>
              ))}
            </select>
          </label>
          <label className="entry-more-field">
            <span>拆到</span>
            <select
              aria-label="拆到哪个词条"
              value={splitTarget}
              onChange={(event) => setSplitTarget(event.target.value)}
            >
              <option value="" disabled>
                选一个词条
              </option>
              <option value="new" disabled={splitChoice !== null && !splitChoice.sentence.canSplitToNew}>
                {splitChoice !== null && !splitChoice.sentence.canSplitToNew
                  ? '新词条（这个词形已属于本词条）'
                  : '新词条'}
              </option>
              {otherEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.mainForm}
                </option>
              ))}
            </select>
          </label>
          {splitChoice !== null &&
          !splitChoice.sentence.canSplitToNew &&
          otherEntries.length === 0 ? (
            <p className="entry-more-hint">这个表达已经属于这个词条，现在没有别的词条可拆。</p>
          ) : null}
          <div className="entries-rail-actions">
            <button
              type="button"
              className="button"
              disabled={splitChoice === null || splitTarget === '' || busy}
              onClick={() => void submitSplit()}
            >
              {dropsEntry ? '拆走并删除词条' : '拆过去'}
            </button>
            <button type="button" className="button" onClick={() => setForm(null)}>
              取消
            </button>
          </div>
          {dropsEntry ? (
            <p className="entry-more-warning" role="alert">
              这是最后一条原句：拆走后「{page.entry.mainForm}」词条
              {page.entry.noteCount > 0 ? `与 ${page.entry.noteCount} 条学习内容` : ''}
              会一起删除。
            </p>
          ) : null}
        </>
      ) : form === 'main-form' ? (
        <>
          <label className="entry-more-field">
            <span>新的主词形</span>
            <select
              aria-label="新的主词形"
              value={mainForm}
              onChange={(event) => setMainForm(event.target.value)}
            >
              {forms.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>
          <div className="entries-rail-actions">
            <button type="button" className="button" disabled={busy} onClick={() => void submitMainForm()}>
              换主词形
            </button>
            <button type="button" className="button" onClick={() => setForm(null)}>
              取消
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="entry-more-field">
            <span>移动哪一条</span>
            <select
              aria-label="要移动的学习内容"
              value={moveNoteId}
              onChange={(event) => setMoveNoteId(event.target.value)}
            >
              {page.notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {noteExcerpt(note.body)}
                </option>
              ))}
            </select>
          </label>
          <label className="entry-more-field">
            <span>移到</span>
            <select
              aria-label="移动到词条"
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
            >
              <option value="">选一个词条</option>
              {otherEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.mainForm}
                </option>
              ))}
            </select>
          </label>
          <div className="entries-rail-actions">
            <button
              type="button"
              className="button"
              disabled={moveNote === null || moveTarget === '' || busy}
              onClick={() => void submitMoveNote()}
            >
              移过去
            </button>
            <button type="button" className="button" onClick={() => setForm(null)}>
              取消
            </button>
          </div>
        </>
      )}

      {error === null ? null : (
        <p className="entry-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function formName(form: MoreForm): string {
  if (form === 'merge') return '合并词条'
  if (form === 'split') return '拆分原句'
  if (form === 'main-form') return '换主词形'
  return '移动学习内容'
}
