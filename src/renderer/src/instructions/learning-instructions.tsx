import { useEffect, useRef, useState } from 'react'
import type {
  LearningInstruction,
  LearningInstructionResult
} from '../../../shared/learning-instructions'
import { LEARNING_INSTRUCTION_EXAMPLES } from '../../../shared/learning-instructions'
import {
  copyLearningInstruction,
  createLearningInstruction,
  deleteLearningInstruction,
  loadLearningInstructions,
  updateLearningInstruction
} from '../api'
import { failureText } from '../errors'
import { appendInstructionDraft } from './draft'
import { instructionUpdatedText } from './format'

type EditorState = {
  id: string
  name: string
  body: string
}

const EMPTY_FORM_ERROR = ''

function rejectedText(result: LearningInstructionResult): string {
  return result.status === 'missing' ? '这条指令已经不在了。' : '名称和正文都不能为空。'
}

/**
 * 对话输入框上方的学习指令入口：把当前输入存成命名指令，选用自己的指令或六条只读示例。
 * 选用和示例都只把正文追加到草稿，不覆盖、不发送；列表与更新时间的改动每次都从主进程重读。
 */
export function LearningInstructionPanel({
  draft,
  onAppend
}: {
  draft: string
  onAppend: (text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState<LearningInstruction[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleting, setDeleting] = useState<LearningInstruction | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(EMPTY_FORM_ERROR)
  const [notice, setNotice] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (saveOpen) {
      nameInput.current?.focus()
    }
  }, [saveOpen])

  function refresh(): void {
    setLoadError(null)
    loadLearningInstructions().then(
      (result) => setInstructions(result.instructions),
      (error: unknown) =>
        setLoadError(failureText(error, '学习指令没有读出来，再试一次。'))
    )
  }

  function ensureLoaded(): void {
    if (instructions === null) {
      refresh()
    }
  }

  function toggle(): void {
    const next = !open
    setOpen(next)
    setNotice(null)
    if (next) {
      ensureLoaded()
    }
  }

  function startSave(): void {
    if (draft.trim() === '') {
      return
    }
    setOpen(true)
    ensureLoaded()
    setEditor(null)
    setSaveOpen(true)
    setSaveName('')
    setFormError(EMPTY_FORM_ERROR)
    setNotice(null)
  }

  function applyInstruction(text: string): void {
    onAppend(appendInstructionDraft(draft, text))
    setNotice('已追加到输入框，可以继续编辑。')
  }

  function save(): void {
    if (busy) {
      return
    }
    setBusy(true)
    setFormError(EMPTY_FORM_ERROR)
    createLearningInstruction({ name: saveName, body: draft }).then(
      (result) => {
        setBusy(false)
        if (result.status !== 'saved') {
          setFormError(rejectedText(result))
          return
        }
        setSaveOpen(false)
        setSaveName('')
        setNotice(`已保存「${result.instruction.name}」`)
        refresh()
      },
      (error: unknown) => {
        setBusy(false)
        setFormError(failureText(error, '没有保存成功，再试一次。'))
      }
    )
  }

  function submitEdit(): void {
    if (editor === null || busy) {
      return
    }
    setBusy(true)
    setFormError(EMPTY_FORM_ERROR)
    updateLearningInstruction({
      instructionId: editor.id,
      name: editor.name,
      body: editor.body
    }).then(
      (result) => {
        setBusy(false)
        if (result.status !== 'saved') {
          setFormError(rejectedText(result))
          return
        }
        setEditor(null)
        setNotice(`已更新「${result.instruction.name}」`)
        refresh()
      },
      (error: unknown) => {
        setBusy(false)
        setFormError(failureText(error, '没有保存成功，再试一次。'))
      }
    )
  }

  function duplicate(instruction: LearningInstruction): void {
    if (busy) {
      return
    }
    setBusy(true)
    setNotice(null)
    copyLearningInstruction({ instructionId: instruction.id }).then(
      (result) => {
        setBusy(false)
        if (result.status !== 'saved') {
          setNotice(result.status === 'missing' ? '这条指令已经不在了。' : '没有复制成功，再试一次。')
          refresh()
          return
        }
        setNotice(`已复制「${result.instruction.name}」`)
        refresh()
      },
      (error: unknown) => {
        setBusy(false)
        setNotice(failureText(error, '没有复制成功，再试一次。'))
      }
    )
  }

  function confirmDelete(): void {
    const target = deleting
    if (target === null || busy) {
      return
    }
    setBusy(true)
    deleteLearningInstruction({ instructionId: target.id }).then(
      (result) => {
        setBusy(false)
        setDeleting(null)
        setNotice(
          result.status === 'deleted' ? `已删除「${target.name}」` : '这条指令已经不在了。'
        )
        refresh()
      },
      (error: unknown) => {
        setBusy(false)
        setNotice(failureText(error, '没有删除成功，再试一次。'))
      }
    )
  }

  return (
    <section className="instruction-panel" aria-label="学习指令">
      <div className="instruction-head">
        <span className="instruction-label">学习指令</span>
        <span className="instruction-count">
          {instructions === null ? '' : `${instructions.length} 条已保存`}
        </span>
        <button
          type="button"
          className="chat-action instruction-toggle"
          aria-expanded={open}
          onClick={toggle}
        >
          {open ? '收起指令' : '选用指令'}
        </button>
        <button
          type="button"
          className="chat-action instruction-save-open"
          disabled={draft.trim() === ''}
          title={
            draft.trim() === ''
              ? '先在输入框写点东西，再存成指令'
              : '把当前输入存成命名指令'
          }
          onClick={startSave}
        >
          存为指令
        </button>
      </div>

      {open ? (
        <div className="instruction-body">
          {loadError === null ? null : (
            <p className="instruction-error" role="alert">
              {loadError}{' '}
              <button type="button" className="chat-action" onClick={refresh}>
                再试一次
              </button>
            </p>
          )}
          {notice === null ? null : (
            <p className="instruction-notice" role="status">
              {notice}
            </p>
          )}

          <div className="instruction-examples" role="group" aria-label="内置示例（只读）">
            <span className="instruction-subhead">内置示例 · 只读</span>
            <div className="instruction-example-row">
              {LEARNING_INSTRUCTION_EXAMPLES.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  className="instruction-example"
                  aria-label={`示例：${example.name}`}
                  onClick={() => applyInstruction(example.body)}
                >
                  {example.name}
                </button>
              ))}
            </div>
          </div>

          {saveOpen ? (
            <form
              className="instruction-form"
              aria-label="保存学习指令"
              onSubmit={(event) => {
                event.preventDefault()
                save()
              }}
            >
              <label className="instruction-field">
                <span>指令名称</span>
                <input
                  ref={nameInput}
                  className="instruction-input"
                  value={saveName}
                  maxLength={60}
                  placeholder="例如：我的语境词义问法"
                  onChange={(event) => setSaveName(event.target.value)}
                />
              </label>
              <p className="instruction-preview">
                正文用输入框里的现有内容；保存后输入框不会清空。
              </p>
              {formError === '' ? null : (
                <p className="instruction-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="instruction-form-actions">
                <button
                  type="submit"
                  className="button button-small button-primary"
                  disabled={busy || saveName.trim() === ''}
                >
                  保存
                </button>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    setSaveOpen(false)
                    setFormError(EMPTY_FORM_ERROR)
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          ) : null}

          {instructions === null ? (
            loadError === null ? (
              <p className="empty-line">正在读取学习指令…</p>
            ) : null
          ) : instructions.length === 0 ? (
            <p className="instruction-empty">
              还没有保存的指令。把输入框里写好的问法存下来，下次就能直接用。
            </p>
          ) : (
            <ul className="instruction-list" aria-label="已保存的学习指令">
              {instructions.map((instruction) => (
                <li
                  key={instruction.id}
                  className="instruction-row"
                  data-instruction-id={instruction.id}
                >
                  <button
                    type="button"
                    className="instruction-apply"
                    aria-label={`选用指令：${instruction.name}`}
                    onClick={() => applyInstruction(instruction.body)}
                  >
                    <span className="instruction-name">{instruction.name}</span>
                    <span className="instruction-time">
                      {instructionUpdatedText(instruction.updatedAt)}
                    </span>
                  </button>
                  <div className="instruction-actions">
                    <button
                      type="button"
                      className="chat-action"
                      aria-label={`编辑指令：${instruction.name}`}
                      onClick={() => {
                        setSaveOpen(false)
                        setEditor({
                          id: instruction.id,
                          name: instruction.name,
                          body: instruction.body
                        })
                        setFormError(EMPTY_FORM_ERROR)
                        setNotice(null)
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="chat-action"
                      aria-label={`复制指令：${instruction.name}`}
                      onClick={() => duplicate(instruction)}
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      className="chat-action"
                      aria-label={`删除指令：${instruction.name}`}
                      onClick={() => {
                        setDeleting(instruction)
                        setNotice(null)
                      }}
                    >
                      删除
                    </button>
                  </div>

                  {editor !== null && editor.id === instruction.id ? (
                    <form
                      className="instruction-form"
                      aria-label={`编辑学习指令：${instruction.name}`}
                      onSubmit={(event) => {
                        event.preventDefault()
                        submitEdit()
                      }}
                    >
                      <label className="instruction-field">
                        <span>指令名称</span>
                        <input
                          className="instruction-input"
                          value={editor.name}
                          maxLength={60}
                          onChange={(event) =>
                            setEditor({ ...editor, name: event.target.value })
                          }
                        />
                      </label>
                      <label className="instruction-field">
                        <span>指令正文</span>
                        <textarea
                          className="instruction-textarea"
                          rows={3}
                          value={editor.body}
                          onChange={(event) =>
                            setEditor({ ...editor, body: event.target.value })
                          }
                        />
                      </label>
                      {formError === '' ? null : (
                        <p className="instruction-error" role="alert">
                          {formError}
                        </p>
                      )}
                      <div className="instruction-form-actions">
                        <button
                          type="submit"
                          className="button button-small button-primary"
                          disabled={busy}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="button button-small"
                          onClick={() => {
                            setEditor(null)
                            setFormError(EMPTY_FORM_ERROR)
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {deleting === null ? null : (
            <div className="instruction-confirm" role="dialog" aria-label="删除学习指令">
              <p>确定删除「{deleting.name}」？删除后不能恢复。</p>
              <div className="instruction-form-actions">
                <button
                  type="button"
                  className="button button-small instruction-danger"
                  disabled={busy}
                  onClick={confirmDelete}
                >
                  删除
                </button>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => setDeleting(null)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
