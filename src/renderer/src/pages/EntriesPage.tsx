import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EntryListResult, EntryPage, EntrySentence } from '../../../shared/entries'
import { deleteEntrySentence, loadEntryList, loadEntryPage } from '../api'
import { getChatStore, openThreadForMain } from '../chat/store'
import { ErrorBlock } from '../components/error-block'
import { EntryList, type EntryFilter, type EntrySort } from '../entries/entry-list'
import { entryHeadlineText } from '../entries/format'
import { NoteRail } from '../entries/note-rail'
import { SentenceRow } from '../entries/sentence-row'
import { failureText } from '../errors'
import { laterToggleLabel } from '../later/format'
import { useLaterMark } from '../later/use-later-mark'
import { navigate, replaceRoute } from '../navigate'
import {
  entriesViewState,
  entryScrollTop,
  updateEntriesViewState,
  updateEntryScrollTop
} from '../view-state'

/**
 * 词条页：左列表、中原句、右学习内容。打开词条先看到原句，右栏默认收窄。
 * 原句按文章分组，组内按句序；每条能回到原文、重新圈定、拆到别的词条或删除。
 */
export function EntriesPage({ entryId, entrySentenceId }: { entryId: string | null; entrySentenceId: string | null }) {
  const [listing, setListing] = useState<EntryListResult | null>(null)
  const [allEntries, setAllEntries] = useState<EntryListResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(entryId)
  const [page, setPage] = useState<EntryPage | null>(null)
  const [query, setQuery] = useState(() => entriesViewState().query)
  const [sort, setSort] = useState<EntrySort>(() => entriesViewState().sort)
  const [filter, setFilter] = useState<EntryFilter>(() => entriesViewState().filter)
  const [railOpen, setRailOpen] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<EntrySentence | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const later = useLaterMark()

  const listRequest = useRef(0)
  const pageRequest = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const restoredScroll = useRef(false)
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  useLayoutEffect(() => {
    const node = rootRef.current?.closest('main')
    if (!node) return
    restoredScroll.current = false
    const remember = (): void => {
      if (restoredScroll.current) updateEntryScrollTop(selectedId, node.scrollTop)
    }
    node.addEventListener('scroll', remember)
    return () => {
      remember()
      node.removeEventListener('scroll', remember)
    }
  }, [selectedId])

  useLayoutEffect(() => {
    if (restoredScroll.current) return
    if (selectedId !== null && page?.entry.id !== selectedId) return
    // 带原句的跳转应定位该句，不能让稍后返回的列表再覆盖这个位置。
    if (selectedId === entryId && entrySentenceId !== null) {
      restoredScroll.current = true
      return
    }
    if (listing === null) return
    const node = rootRef.current?.closest('main')
    if (!node) return
    node.scrollTop = entryScrollTop(selectedId)
    restoredScroll.current = true
  }, [entryId, entrySentenceId, listing, page, selectedId])

  useEffect(() => {
    if (entryId !== null) {
      setSelectedId(entryId)
    }
  }, [entryId])

  useEffect(() => {
    const sequence = listRequest.current + 1
    listRequest.current = sequence
    setListError(null)
    loadEntryList({ query, sort, filter }).then(
      (value) => {
        if (sequence !== listRequest.current) return
        setListing(value)
        setListError(null)
      },
      (error: unknown) => {
        if (sequence === listRequest.current) {
          setListError(failureText(error, '词条列表没有读出来。'))
        }
      }
    )
  }, [query, sort, filter, reloadToken])

  useEffect(() => {
    let active = true
    loadEntryList({}).then(
      (value) => {
        if (active) setAllEntries(value)
      },
      () => undefined
    )
    return () => {
      active = false
    }
  }, [reloadToken])

  useEffect(() => {
    if (selectedId === null) {
      pageRequest.current += 1
      setPage(null)
      setPageError(null)
      replaceRoute('entries')
      return
    }
    replaceRoute('entries', { entryId: selectedId, entrySentenceId: selectedId === entryId ? entrySentenceId : null })
    const sequence = pageRequest.current + 1
    pageRequest.current = sequence
    setPageError(null)
    loadEntryPage(selectedId).then(
      (value) => {
        if (sequence !== pageRequest.current) return
        if (value === null) {
          setPage(null)
          setPageError('这个词条已经不在了。')
          return
        }
        setPage(value)
      },
      (error: unknown) => {
        if (sequence === pageRequest.current) {
          setPage(null)
          setPageError(failureText(error, '这个词条没有读出来。'))
        }
      }
    )
  }, [selectedId, reloadToken, entryId, entrySentenceId])

  useEffect(() => {
    if (page === null || page.entry.id !== entryId || entrySentenceId === null) return
    const frame = window.requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('.entry-sentence'))
        .find((item) => item.dataset.entrySentenceId === entrySentenceId)
      row?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page, entryId, entrySentenceId])

  useEffect(() => {
    if (hint === null) return
    const timer = window.setTimeout(() => setHint(null), 4000)
    return () => window.clearTimeout(timer)
  }, [hint])

  function refresh(message?: string): void {
    setActionError(null)
    setReloadToken((token) => token + 1)
    if (message !== undefined) {
      setHint(message)
    }
  }

  function selectEntry(id: string): void {
    setSelectedId(id)
    setRailOpen(false)
    setActionError(null)
    setConfirmDelete(null)
  }

  function openReading(sentence: EntrySentence, reselect: boolean): void {
    navigate('reading', {
      articleId: sentence.articleId,
      entrySentenceId: sentence.id,
      readingFrom: 'entries',
      reselect
    })
  }

  async function removeSentence(sentence: EntrySentence): Promise<void> {
    if (deleting) return
    setDeleting(true)
    setActionError(null)
    try {
      const result = await deleteEntrySentence(sentence.id)
      if (result.status === 'missing') {
        setActionError('这条原句已经不在了。')
        setConfirmDelete(null)
        refresh()
        return
      }
      setConfirmDelete(null)
      if (result.entryDeleted || result.entry === null) {
        setHint(`原句与「${page?.entry.mainForm ?? '这个词条'}」已删除。`)
        setPage(null)
        setSelectedId(null)
        refresh()
        return
      }
      refresh('原句已删除。')
    } catch (error) {
      setActionError(failureText(error))
    } finally {
      setDeleting(false)
    }
  }

  function requestDelete(sentence: EntrySentence): void {
    if (page === null) return
    if (page.entry.sentenceCount <= 1) {
      setConfirmDelete(sentence)
      return
    }
    void removeSentence(sentence)
  }

  function entryGone(): void {
    setPage(null)
    setSelectedId(null)
    refresh()
  }

  /** 词条页上的「稍后看」：状态只改独立标记，原句、学习内容与收集时间都不动。 */
  function toggleLater(): void {
    if (page === null) return
    const { id, mainForm, laterMarkedAt } = page.entry
    const next = laterMarkedAt === null
    void later.setLater(
      { entryId: id, mainForm, later: next },
      {
        failureMessage: '稍后看没有改成功，再试一次。',
        onSettled: ({ entryId, markedAt, notice }) => {
          setPage((current) =>
            current !== null && current.entry.id === entryId
              ? { ...current, entry: { ...current.entry, laterMarkedAt: markedAt } }
              : current
          )
          // 只在用户还停在这条词条上时给反馈；切走后晚到的结果不打扰当前页。
          if (selectedIdRef.current === entryId) setHint(notice)
        },
        onMissing: (entryId) => {
          if (selectedIdRef.current !== entryId) return
          refresh()
          setActionError('这个词条已经不在了。')
        },
        onError: ({ entryId, message }) => {
          if (selectedIdRef.current === entryId) setActionError(message)
        }
      }
    )
  }

  async function askAboutEntry(forceNew = false): Promise<void> {
    if (page === null) return
    setActionError(null)
    const opened = await openThreadForMain({ kind: 'entry', entryId: page.entry.id }, { forceNew })
    if (opened === null) setActionError(getChatStore().error ?? '没能打开线程，请刷新词条后再试。')
  }

  async function askAboutSentence(sentence: EntrySentence, forceNew = false): Promise<void> {
    setActionError(null)
    const opened = await openThreadForMain({
      kind: 'sentence',
      entrySentenceId: sentence.id
    }, { forceNew })
    if (opened === null) setActionError(getChatStore().error ?? '没能打开线程，请刷新词条后再试。')
  }

  return (
    <div ref={rootRef} className="entries-page" data-rail={railOpen ? 'open' : 'closed'}>
      <EntryList
        listing={listing}
        selectedId={selectedId}
        query={query}
        sort={sort}
        filter={filter}
        onQuery={(value) => {
          setQuery(value)
          updateEntriesViewState({ query: value })
        }}
        onSort={(value) => {
          setSort(value)
          updateEntriesViewState({ sort: value })
        }}
        onFilter={(value) => {
          setFilter(value)
          updateEntriesViewState({ filter: value })
        }}
        onSelect={selectEntry}
      />

      <section className="entries-main" aria-label="词条内容">
        {listError === null ? null : (
          <ErrorBlock message={listError} onAction={() => refresh()} />
        )}

        {page !== null ? (
          <>
            <header className="entries-main-head">
              <div className="entries-main-title">
                <p className="eyebrow">词条</p>
                <h2 className="entries-title">{page.entry.mainForm}</h2>
                <p className="entries-meta">{entryHeadlineText(page.entry)}</p>
              </div>
              <div className="entries-main-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => void askAboutEntry()}
                >
                  开始对话
                </button>
                <button type="button" className="button" onClick={() => void askAboutEntry(true)}>
                  新开一条
                </button>
                <button
                  type="button"
                  className="button"
                  aria-pressed={page.entry.laterMarkedAt !== null}
                  disabled={later.busyEntryId !== null}
                  onClick={toggleLater}
                >
                  {laterToggleLabel(page.entry.laterMarkedAt !== null)}
                </button>
                <button
                  type="button"
                  className="button"
                  aria-expanded={railOpen}
                  onClick={() => setRailOpen(true)}
                >
                  学习内容 {page.entry.noteCount}
                </button>
              </div>
            </header>

            {actionError === null ? null : (
              <ErrorBlock
                message={actionError}
                actionLabel="刷新列表"
                onAction={() => refresh()}
              />
            )}

            {page.groups.length === 0 ? (
              <p className="empty-line">这个词条还没有原句。</p>
            ) : (
              page.groups.map((group) => (
                <section
                  className="entry-group"
                  key={group.articleId}
                  aria-label={`${group.articleTitle} 的原句`}
                >
                  <h3 className="entry-group-head">
                    <span>{group.articleTitle}</span>
                    <span className="entry-group-count">{group.sentences.length} 句</span>
                  </h3>
                  <ul className="entry-sentences">
                    {group.sentences.map((sentence) => (
                      <SentenceRow
                        key={sentence.id}
                        sentence={sentence}
                        focused={page.entry.id === entryId && sentence.id === entrySentenceId}
                        busy={deleting}
                        onBack={() => openReading(sentence, false)}
                        onReselect={() => openReading(sentence, true)}
                        onAsk={() => void askAboutSentence(sentence)}
                        onAskNew={() => void askAboutSentence(sentence, true)}
                        onRequestDelete={() => requestDelete(sentence)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}

            {confirmDelete === null ? null : (
              <div className="entry-confirm" role="alertdialog" aria-label="删除最后一条原句">
                <p>
                  这是最后一条原句。删掉后「{page.entry.mainForm}」词条连同{' '}
                  {page.entry.noteCount} 条学习内容也会一起删除。
                </p>
                <div className="entries-main-actions">
                  <button
                    type="button"
                    className="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="button entry-action-danger"
                    disabled={deleting}
                    onClick={() => void removeSentence(confirmDelete)}
                  >
                    删除词条与原句
                  </button>
                </div>
              </div>
            )}
          </>
        ) : pageError !== null ? (
          <ErrorBlock message={pageError} onAction={() => refresh()} />
        ) : listing !== null && listing.total === 0 ? (
          <div className="entries-main-empty">
            <p className="eyebrow">还没有词条</p>
            <h2 className="entries-title">先读一篇</h2>
            <p className="empty-line">读的时候圈一个词，它就会出现在这里。</p>
            <button
              type="button"
              className="button button-primary"
              onClick={() => navigate('library')}
            >
              去文章库
            </button>
          </div>
        ) : (
          <p className="empty-line">在左边选一个词条。</p>
        )}
      </section>

      {page === null ? null : (
        <NoteRail
          key={page.entry.id}
          page={page}
          entries={allEntries?.entries ?? []}
          open={railOpen}
          onToggle={() => setRailOpen((open) => !open)}
          onChanged={(message) => refresh(message)}
          onEntryGone={entryGone}
        />
      )}

      {hint === null ? null : (
        <p className="entries-toast" role="status">
          {hint}
        </p>
      )}
    </div>
  )
}
