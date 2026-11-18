import { useState } from 'react'
import type { EntryListItem, EntryPage, LearningNote } from '../../../shared/entries'
import {
  createEntryNote,
  deleteEntryNote,
  mergeWordEntries,
  moveEntryNote,
  pinEntryNote,
  saveEntryMainForm,
  updateEntryNote
} from '../api'
import { messageOf } from '../errors'
import { entryHeadlineText, noteSourceText } from './format'

/**
 * 词条页右栏。收窄时只留一条竖着的「学习内容」入口；点开才是主词形、学习内容与「更多」。
 * 学习内容只保留最终稿：编辑直接覆盖，不存历史版本。
 */
export function NoteRail({
  page,
  entries,
  open,
  onToggle,
  onChanged,
  onEntryGone
}: {
  page: EntryPage
  /** 全部词条，给「移动学习内容」与「合并词条」挑目标。 */
  entries: readonly EntryListItem[]
  open: boolean
  onToggle: () => void
  onChanged: (message: string) => void
  onEntryGone: () => void
}) {
  const [draft, setDraft] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [busyNoteId, setBusyNoteId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [changingForm, setChangingForm] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [mergeMainForm, setMergeMainForm] = useState(page.entry.mainForm)
  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)

  const otherEntries = entries.filter((entry) => entry.id !== page.entry.id)
  const mergeTarget = otherEntries.find((entry) => entry.id === mergeTargetId) ?? null

  if (!open) {
    return (
      <aside className="entries-rail entries-rail-closed" aria-label="学习内容">
        <button
          type="button"
          className="entries-rail-tab"
          aria-label="展开学习内容"
          aria-expanded={false}
          onClick={onToggle}
        >
          <span className="entries-rail-tab-label">学习内容</span>
          <span className="entries-rail-count">{page.entry.noteCount}</span>
        </button>
      </aside>
    )
  }

  async function saveDraft(): Promise<void> {
    const body = draft.trim()
    if (body === '' || savingDraft) return
    setSavingDraft(true)
    setError(null)
    try {
      const result = await createEntryNote({ entryId: page.entry.id, body })
      if (result.status === 'saved') {
        setDraft('')
        onChanged('学习内容已保存。')
        return
      }
      if (result.status === 'rejected') {
        if (result.reason === 'entry') {
          onEntryGone()
          return
        }
        setError('学习内容不能是空的。')
        return
      }
      setError('学习内容没有保存成功，再试一次。')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setSavingDraft(false)
    }
  }

  async function saveEdit(note: LearningNote): Promise<void> {
    const body = editDraft.trim()
    if (body === '' || savingEdit) return
    setSavingEdit(true)
    setEditError(null)
    try {
      const result = await updateEntryNote({ noteId: note.id, body })
      if (result.status === 'saved') {
        setEditingId(null)
        onChanged('学习内容已更新，旧稿不保留。')
        return
      }
      if (result.status === 'rejected') {
        setEditError('学习内容不能是空的。')
        return
      }
      setEditError('这条学习内容已经不在了。')
    } catch (reason) {
      setEditError(messageOf(reason))
    } finally {
      setSavingEdit(false)
    }
  }

  async function togglePin(note: LearningNote): Promise<void> {
    setBusyNoteId(note.id)
    setError(null)
    try {
      const result = await pinEntryNote({ noteId: note.id, pinned: !note.pinned })
      if (result.status === 'saved') {
        onChanged(note.pinned ? '已取消置顶。' : '已置顶这一条。')
        return
      }
      setError('这条学习内容已经不在了。')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusyNoteId(null)
    }
  }

  async function removeNote(note: LearningNote): Promise<void> {
    setBusyNoteId(note.id)
    setError(null)
    try {
      const result = await deleteEntryNote(note.id)
      if (result.status === 'deleted') {
        onChanged('学习内容已删除。')
        return
      }
      setError('这条学习内容已经不在了。')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusyNoteId(null)
    }
  }

  async function submitMove(note: LearningNote): Promise<void> {
    if (moveTarget === '') return
    setBusyNoteId(note.id)
    setError(null)
    try {
      const result = await moveEntryNote({ noteId: note.id, entryId: moveTarget })
      if (result.status === 'saved') {
        const target = entries.find((entry) => entry.id === result.note.entryId)
        setMovingId(null)
        setMoveTarget('')
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
      setBusyNoteId(null)
    }
  }

  async function changeMainForm(mainForm: string): Promise<void> {
    if (changingForm) return
    setChangingForm(true)
    setError(null)
    try {
      const result = await saveEntryMainForm({ entryId: page.entry.id, mainForm })
      if (result.status === 'changed') {
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
      setChangingForm(false)
    }
  }

  async function submitMerge(): Promise<void> {
    if (mergeTarget === null || merging) return
    setMerging(true)
    setMergeError(null)
    try {
      const result = await mergeWordEntries({
        sourceEntryId: mergeTarget.id,
        targetEntryId: page.entry.id,
        mainForm: mergeMainForm
      })
      if (result.status === 'merged') {
        setMergeOpen(false)
        setMergeTargetId('')
        onChanged(`已把「${mergeTarget.mainForm}」合并进来。`)
        return
      }
      if (result.status === 'rejected') {
        setMergeError(
          result.reason === 'main-form'
            ? '合并后的主词形不在已收集的词形里。'
            : '不能把词条并到自己。'
        )
        return
      }
      setMergeError('要合并的词条已经不在了。')
    } catch (reason) {
      setMergeError(messageOf(reason))
    } finally {
      setMerging(false)
    }
  }

  return (
    <aside className="entries-rail entries-rail-open" aria-label="学习内容">
      <header className="entries-rail-head">
        <p className="section-label">学习内容</p>
        <button
          type="button"
          className="entries-rail-close"
          aria-label="收起学习内容"
          onClick={onToggle}
        >
          ×
        </button>
      </header>

      <h2 className="entries-rail-title">{page.entry.mainForm}</h2>
      <p className="entries-rail-meta">{entryHeadlineText(page.entry)}</p>

      <section className="entries-rail-section" aria-label="主词形">
        <p className="section-label">主词形</p>
        <div className="entry-forms">
          <span className="entry-form entry-form-current">{page.entry.mainForm}</span>
          {page.entry.variants.map((variant) => (
            <button
              key={variant}
              type="button"
              className="entry-form"
              aria-label={`把主词形换成 ${variant}`}
              disabled={changingForm}
              onClick={() => void changeMainForm(variant)}
            >
              {variant}
            </button>
          ))}
        </div>
      </section>

      <section className="entries-rail-section" aria-label="学习内容">
        {page.notes.length === 0 ? (
          <p className="empty-line">
            还没有学习内容 · 现在写一条，或从对话里钉一段进来。
          </p>
        ) : (
          <div className="entry-notes">
            {page.notes.map((note) => (
              <article className="entry-note" data-note-id={note.id} key={note.id}>
                <header className="entry-note-head">
                  {note.pinned ? <span className="entry-note-pin">已置顶</span> : null}
                  <div className="entry-note-actions">
                    <button
                      type="button"
                      className="entry-action"
                      disabled={busyNoteId === note.id}
                      onClick={() => void togglePin(note)}
                    >
                      {note.pinned ? '取消置顶' : '置顶'}
                    </button>
                    <button
                      type="button"
                      className="entry-action"
                      onClick={() => {
                        setEditingId(note.id)
                        setEditDraft(note.body)
                        setEditError(null)
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="entry-action"
                      onClick={() => {
                        setMovingId(note.id)
                        setMoveTarget('')
                        setError(null)
                      }}
                    >
                      移动…
                    </button>
                    <button
                      type="button"
                      className="entry-action entry-action-danger"
                      disabled={busyNoteId === note.id}
                      onClick={() => void removeNote(note)}
                    >
                      删除
                    </button>
                  </div>
                </header>

                {editingId === note.id ? (
                  <div className="entry-note-editor">
                    <textarea
                      aria-label="编辑学习内容"
                      rows={4}
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                    />
                    <div className="entries-rail-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={savingEdit || editDraft.trim() === ''}
                        onClick={() => void saveEdit(note)}
                      >
                        保存修改
                      </button>
                      <button
                        type="button"
                        className="button"
                        onClick={() => setEditingId(null)}
                      >
                        取消
                      </button>
                    </div>
                    {editError === null ? null : (
                      <p className="entry-error" role="alert">
                        {editError}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="entry-note-body">{note.body}</p>
                )}

                {movingId === note.id ? (
                  <div className="entry-note-move" role="group" aria-label="移动学习内容">
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
                    <div className="entries-rail-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={moveTarget === '' || busyNoteId === note.id}
                        onClick={() => void submitMove(note)}
                      >
                        移过去
                      </button>
                      <button
                        type="button"
                        className="button"
                        onClick={() => setMovingId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}

                <p className="entry-note-source">{noteSourceText(note)}</p>
              </article>
            ))}
          </div>
        )}

        <form
          className="entry-note-form"
          onSubmit={(event) => {
            event.preventDefault()
            void saveDraft()
          }}
        >
          <textarea
            aria-label="写学习内容"
            placeholder="写释义、例句、辨析、助记…"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className="button"
            disabled={savingDraft || draft.trim() === ''}
          >
            保存学习内容
          </button>
        </form>
        {error === null ? null : (
          <p className="entry-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="entries-rail-section" aria-label="更多">
        <p className="section-label">更多</p>
        {mergeOpen ? (
          <div className="entry-merge" role="group" aria-label="合并词条">
            <label className="entry-merge-field">
              <span>把哪个词条并进来</span>
              <select
                aria-label="要并进来的词条"
                value={mergeTargetId}
                onChange={(event) => {
                  setMergeTargetId(event.target.value)
                  setMergeMainForm(page.entry.mainForm)
                  setMergeError(null)
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
              <fieldset className="entry-merge-forms">
                <legend>合并后的主词形</legend>
                {[page.entry.mainForm, mergeTarget.mainForm].map((form) => (
                  <label key={form}>
                    <input
                      type="radio"
                      name="entry-merge-main-form"
                      value={form}
                      checked={mergeMainForm === form}
                      onChange={() => setMergeMainForm(form)}
                    />
                    {form}
                  </label>
                ))}
              </fieldset>
            ) : null}

            <p className="entry-merge-hint">
              并进来的原句与学习内容都会移到「{page.entry.mainForm}」下，另一个词条消失。
            </p>

            <div className="entries-rail-actions">
              <button
                type="button"
                className="button"
                disabled={mergeTarget === null || merging}
                onClick={() => void submitMerge()}
              >
                合并
              </button>
              <button type="button" className="button" onClick={() => setMergeOpen(false)}>
                取消
              </button>
            </div>
            {mergeError === null ? null : (
              <p className="entry-error" role="alert">
                {mergeError}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="button"
            onClick={() => {
              setMergeOpen(true)
              setMergeTargetId('')
              setMergeMainForm(page.entry.mainForm)
              setMergeError(null)
            }}
          >
            合并词条…
          </button>
        )}
      </section>
    </aside>
  )
}
