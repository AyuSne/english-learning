import { useState } from 'react'
import type { EntryListItem, EntryPage, LearningNote } from '../../../shared/entries'
import {
  createLearningNote,
  deleteLearningNote,
  pinLearningNote,
  updateLearningNote
} from '../api'
import { messageOf } from '../errors'
import { entryHeadlineText, noteSourceText } from './format'
import { LearningBody } from './learning-body'
import { MoreActions } from './more-actions'

/**
 * 词条页右栏。收窄时只留一条竖着的「学习内容」入口；点开才是主词形、学习内容与「更多」。
 * 学习内容只保留最终稿：编辑直接覆盖，不存历史版本；置顶一条，其余按写下的时间排。
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
  /** 全部词条，给「更多」里的合并、拆分与移动挑目标。 */
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
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

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
      const result = await createLearningNote({ entryId: page.entry.id, body })
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
      const result = await updateLearningNote({ noteId: note.id, body })
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
      const result = await pinLearningNote({ noteId: note.id, pinned: !note.pinned })
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
      const result = await deleteLearningNote(note.id)
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
          <span className="entry-form entry-form-current" aria-current="true">
            {page.entry.mainForm}
          </span>
          {page.entry.variants.map((variant) => (
            <span className="entry-form" key={variant}>
              {variant}
            </span>
          ))}
        </div>
      </section>

      <section className="entries-rail-section" aria-label="学习内容">
        {page.notes.length === 0 ? (
          <p className="empty-line">还没有学习内容 · 从对话里钉一段进来</p>
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
                  <LearningBody body={note.body} />
                )}

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
        <MoreActions
          page={page}
          entries={entries}
          onChanged={onChanged}
          onEntryGone={onEntryGone}
        />
      </section>
    </aside>
  )
}
