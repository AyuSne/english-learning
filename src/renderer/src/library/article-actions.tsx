import { useEffect, useState } from 'react'
import type { ArticleDeletionPreview, ArticleDetail } from '../../../shared/library'
import {
  deleteArticle,
  loadArticleDeletionPreview,
  renameArticle
} from '../api'
import { failureText } from '../errors'
import { deletionImpactLines } from './impact'

/**
 * 文章详情里的重命名与删除。删除先取影响面，确认后才真删；
 * 计数怎么读由 impact.ts 统一，别的页面复用时不会各写一套文案。
 */
export function LibraryArticleActions({
  detail,
  onRenamed,
  onDeleted,
  onError
}: {
  detail: ArticleDetail
  onRenamed: (title: string) => void
  onDeleted: (articleId: string) => void
  onError: (message: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(detail.title)
  const [renamingBusy, setRenamingBusy] = useState(false)
  const [renamingError, setRenamingError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ArticleDeletionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setRenaming(false)
    setDraft(detail.title)
    setRenamingError(null)
    setPreview(null)
    setPreviewLoading(false)
    setDeleting(false)
  }, [detail.id, detail.title])

  async function submitRename(): Promise<void> {
    if (renamingBusy) return
    setRenamingError(null)
    setRenamingBusy(true)
    try {
      const result = await renameArticle({ articleId: detail.id, title: draft })
      if (result.status === 'renamed') {
        setRenaming(false)
        onRenamed(result.title)
        return
      }
      if (result.status === 'missing') {
        setRenaming(false)
        onError('这篇文章已经不在了。')
        return
      }
      setRenamingError(
        result.reason === 'empty' ? '篇名不能为空。' : '篇名太长了，换短一点的。'
      )
    } catch (error) {
      setRenamingError(failureText(error, '这次重命名没有保存，再试一次。'))
    } finally {
      setRenamingBusy(false)
    }
  }

  function startRenaming(): void {
    setDraft(detail.title)
    setRenamingError(null)
    setPreview(null)
    setRenaming(true)
  }

  async function requestDelete(): Promise<void> {
    if (previewLoading) return
    setRenaming(false)
    setPreviewLoading(true)
    setPreview(null)
    try {
      const value = await loadArticleDeletionPreview(detail.id)
      if (value === null) {
        onError('这篇文章已经不在了。')
        return
      }
      setPreview(value)
    } catch (error) {
      onError(failureText(error, '这次没能读到删除影响面，再试一次。'))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleting) return
    setDeleting(true)
    try {
      const result = await deleteArticle({ articleId: detail.id })
      if (result.status === 'deleted') {
        setPreview(null)
        onDeleted(result.articleId)
        return
      }
      setPreview(null)
      onError('这篇文章已经不在了。')
    } catch (error) {
      onError(failureText(error, '这篇文章没有删掉，再试一次。'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="library-manage">
      {renaming ? (
        <form
          className="library-rename"
          aria-label="重命名文章"
          onSubmit={(event) => {
            event.preventDefault()
            void submitRename()
          }}
        >
          <label className="library-rename-field">
            <span>篇名</span>
            <input
              type="text"
              value={draft}
              autoFocus
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {renamingError === null ? null : (
            <p className="entry-error" role="alert">
              {renamingError}
            </p>
          )}
          <div className="library-manage-row">
            <button type="submit" className="button" disabled={renamingBusy}>
              保存篇名
            </button>
            <button
              type="button"
              className="button"
              disabled={renamingBusy}
              onClick={() => setRenaming(false)}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      <div className="library-detail-actions library-manage-row">
        {renaming ? null : (
          <button type="button" className="button" onClick={startRenaming}>
            重命名
          </button>
        )}
        <button
          type="button"
          className="button entry-action-danger"
          disabled={previewLoading || deleting}
          onClick={() => void requestDelete()}
        >
          {previewLoading ? '正在核对影响面…' : '删除文章'}
        </button>
      </div>

      {preview === null ? null : (
        <div className="entry-confirm" role="alertdialog" aria-label="删除文章">
          <p>
            删除「{detail.title}」后，文章、段落与句子都会从库里消失，不能撤销。
          </p>
          <ul className="library-impact">
            {deletionImpactLines(preview).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="library-manage-row">
            <button
              type="button"
              className="button"
              disabled={deleting}
              onClick={() => setPreview(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="button entry-action-danger"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? '正在删除…' : '确认删除'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
