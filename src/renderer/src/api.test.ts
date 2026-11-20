import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArticleDeletionPreview } from '../../shared/library'
import {
  deleteArticle,
  loadEntryList,
  loadNavCounts,
  saveGeneratedArticle
} from './api'
import {
  resetNavCountsInvalidationForTest,
  subscribeNavCountsInvalidated
} from './nav-counts/invalidation'

/**
 * 渲染层统一的 IPC 成功边界：会改变全局栏计数的写操作在成功返回后
 * 发一次失效信号；读操作与失败的写都不发，避免轮询和无效重查。
 */

const preview: ArticleDeletionPreview = {
  articleId: 'article-1',
  sentenceAssociationCount: 0,
  affectedEntryCount: 0,
  disappearingEntryCount: 0,
  survivingEntryCount: 0,
  disappearingLearningNoteCount: 0,
  articlePinCount: 0
}

const invoke = vi.fn()
const notified = vi.fn<() => void>()

beforeEach(() => {
  resetNavCountsInvalidationForTest()
  invoke.mockReset()
  vi.stubGlobal('window', { api: { invoke } })
  notified.mockClear()
  subscribeNavCountsInvalidated(notified)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetNavCountsInvalidationForTest()
})

describe('api 写成功边界', () => {
  it('删除文章成功后发一次失效信号', async () => {
    invoke.mockResolvedValueOnce({ status: 'deleted', articleId: 'article-1', preview })
    await deleteArticle({ articleId: 'article-1', confirmed: preview })
    expect(invoke).toHaveBeenCalledWith('library:delete', {
      articleId: 'article-1',
      confirmed: preview
    })
    expect(notified).toHaveBeenCalledTimes(1)
  })

  it('存为文章成功后发一次失效信号', async () => {
    invoke.mockResolvedValueOnce({ status: 'missing' })
    await saveGeneratedArticle({ threadId: 'thread-1', answerId: 'answer-1' })
    expect(notified).toHaveBeenCalledTimes(1)
  })

  it('写操作抛错时不发失效信号', async () => {
    invoke.mockRejectedValueOnce(new Error('IPC 挂了'))
    await expect(
      saveGeneratedArticle({ threadId: 'thread-1', answerId: 'answer-1' })
    ).rejects.toThrow('IPC 挂了')
    expect(notified).not.toHaveBeenCalled()
  })

  it('读查询不发失效信号', async () => {
    invoke.mockResolvedValueOnce({ total: 0, entries: [] })
    await loadEntryList({})
    expect(notified).not.toHaveBeenCalled()
  })

  it('读计数本身不触发失效，避免自激重查', async () => {
    invoke.mockResolvedValueOnce({ entries: 0, articles: 2, unfiled: 0 })
    await expect(loadNavCounts()).resolves.toEqual({ entries: 0, articles: 2, unfiled: 0 })
    expect(invoke).toHaveBeenCalledWith('counts:summary', undefined)
    expect(notified).not.toHaveBeenCalled()
  })
})
