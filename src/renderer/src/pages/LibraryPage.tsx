import { useEffect, useState, type ReactNode } from 'react'
import type {
  ArticleDetail,
  ImportReport,
  LibraryListing,
  LibrarySearchResults
} from '../../../shared/library'
import {
  loadArticleDetail,
  loadLibrary,
  searchLibrary
} from '../api'
import { messageOf } from '../errors'
import { openThreadForMain } from '../chat/store'
import { formatDay, progressText } from '../library/format'
import { navigate } from '../navigate'

/**
 * 文章库：左边按场次分组的列表（搜索时换成命中结果），右边是选中一篇的详情。
 * 「继续阅读」把文章 id 交给阅读页，由阅读页记下最近打开并恢复上次位置。
 */
export function LibraryPage({ corpusImport }: { corpusImport: ImportReport }) {
  const [listing, setListing] = useState<LibraryListing | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<LibrarySearchResults | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ArticleDetail | null>(null)

  useEffect(() => {
    let active = true
    loadLibrary().then(
      (value) => {
        if (!active) return
        setListing(value)
        setSelectedId((current) => current ?? value.sessions[0]?.articles[0]?.id ?? null)
      },
      (error: unknown) => {
        if (active) setLoadError(messageOf(error))
      }
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null)
      return
    }
    let active = true
    loadArticleDetail(selectedId).then(
      (value) => {
        if (active) setDetail(value)
      },
      (error: unknown) => {
        if (active) setLoadError(messageOf(error))
      }
    )
    return () => {
      active = false
    }
  }, [selectedId])

  const trimmedQuery = query.trim()

  useEffect(() => {
    if (trimmedQuery === '') {
      setFound(null)
      return
    }
    let active = true
    searchLibrary(trimmedQuery).then(
      (value) => {
        if (active) setFound(value)
      },
      (error: unknown) => {
        if (active) setLoadError(messageOf(error))
      }
    )
    return () => {
      active = false
    }
  }, [trimmedQuery])

  function select(articleId: string): void {
    setSelectedId(articleId)
  }

  function open(articleId: string): void {
    navigate('reading', { articleId })
  }

  const failureCount = corpusImport.failed.length
  // 以库里实际篇数为准：这一轮失败的那篇可能上一轮就已经导进来了。
  const storedCount =
    listing?.articleCount ??
    corpusImport.imported + corpusImport.updated + corpusImport.skipped

  return (
    <div className="page page-wide library">
      <header className="library-head">
        <div>
          <h1 className="page-title">文章库</h1>
          <p className="library-count">
            {listing === null
              ? '正在读取本机资料库…'
              : `${listing.articleCount} 篇 · ${listing.sessionCount} 个场次`}
          </p>
        </div>
        <label className="library-search">
          <input
            type="search"
            aria-label="搜篇名或正文"
            placeholder="搜篇名或正文"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      {failureCount > 0 ? (
        <section className="library-warning" role="alert">
          <p className="library-warning-title">
            有 {failureCount} 篇没导进来，其余 {storedCount} 篇已在库里。
          </p>
          <ul className="library-warning-list">
            {corpusImport.failed.map((failure) => (
              <li key={failure.id}>
                <span className="library-warning-id">{failure.id}</span>
                {failure.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loadError !== null ? (
        <p className="library-error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="library-columns">
        <div className="library-list">
          {listing !== null && listing.articleCount === 0 && failureCount === 0 ? (
            <p className="empty-line">还没有文章。语料随应用分发，重新启动会再导入一次。</p>
          ) : found !== null ? (
            <SearchResults
              query={found.query}
              results={found.results}
              selectedId={selectedId}
              onSelect={select}
            />
          ) : listing !== null ? (
            listing.sessions.map((session) => (
              <section key={session.id} className="library-session" aria-label={session.label}>
                <h2 className="library-session-head">
                  <span>{session.label}</span>
                  <span className="library-session-count">{session.articles.length} 篇</span>
                </h2>
                <ul className="library-rows">
                  {session.articles.map((article) => (
                    <li key={article.id}>
                      <button
                        type="button"
                        className="library-row"
                        aria-current={article.id === selectedId ? 'true' : undefined}
                        onClick={() => select(article.id)}
                      >
                        <span className="library-row-name">{article.kindLabel}</span>
                        <span className="library-row-meta">
                          {article.setLabel} · {article.wordCount} 词
                        </span>
                        <span className="library-row-progress">
                          {progressText(article.progress)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : null}
        </div>

        <aside className="library-detail" aria-label="文章详情">
          {detail === null ? (
            <p className="empty-line">在左边选一篇。</p>
          ) : (
            <>
              <p className="eyebrow">这篇</p>
              <h2 className="library-detail-title">{detail.title}</h2>
              <dl className="library-meta">
                <div>
                  <dt>场次</dt>
                  <dd>
                    {detail.sessionLabel} · {detail.setLabel}
                  </dd>
                </div>
                <div>
                  <dt>题型</dt>
                  <dd>{detail.kindLabel}</dd>
                </div>
                <div>
                  <dt>篇幅</dt>
                  <dd>
                    {detail.wordCount} 词 · {detail.paragraphCount} 段 · {detail.sentenceCount} 句
                  </dd>
                </div>
                <div>
                  <dt>进度</dt>
                  <dd>{progressText(detail.progress)}</dd>
                </div>
                <div>
                  <dt>最近打开</dt>
                  <dd>
                    {detail.lastOpenedAt === null
                      ? '还没打开过'
                      : formatDay(detail.lastOpenedAt)}
                  </dd>
                </div>
                {detail.pages === '' ? null : (
                  <div>
                    <dt>原卷</dt>
                    <dd>{detail.pages}</dd>
                  </div>
                )}
              </dl>
              <div className="library-detail-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => open(detail.id)}
                >
                  继续阅读
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    void openThreadForMain({ kind: 'article', articleId: detail.id })
                  }
                >
                  与这篇对话
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function SearchResults({
  query,
  results,
  selectedId,
  onSelect
}: {
  query: string
  results: LibrarySearchResults['results']
  selectedId: string | null
  onSelect: (articleId: string) => void
}) {
  return (
    <section className="library-session" aria-label={`「${query}」的搜索结果`}>
      <h2 className="library-session-head">
        <span>「{query}」的结果</span>
        <span className="library-session-count">{results.length} 篇</span>
      </h2>
      {results.length === 0 ? (
        <p className="empty-line">没有找到。换个词试试，篇名和正文都会搜。</p>
      ) : (
        <ul className="library-rows">
          {results.map((result) => (
            <li key={result.article.id}>
              <button
                type="button"
                className="library-row library-row-search"
                aria-current={result.article.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(result.article.id)}
              >
                <span className="library-row-name">{result.article.kindLabel}</span>
                <span className="library-row-meta">
                  {result.article.sessionLabel} · {result.article.setLabel} ·{' '}
                  {result.article.wordCount} 词
                </span>
                <span className="library-row-progress">
                  {progressText(result.article.progress)}
                </span>
                <span className="library-snippet">
                  <span className="library-hit">
                    {result.matched === 'title' ? '篇名命中' : '正文命中'}
                  </span>
                  {highlight(result.snippet, query)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 把 <mark> 左右按原文字面切出来，不拼 HTML。 */
function highlight(text: string, query: string): ReactNode[] {
  const needle = query.toLowerCase()
  if (needle === '') {
    return [text]
  }
  const haystack = text.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  while (cursor < text.length) {
    const hit = haystack.indexOf(needle, cursor)
    if (hit < 0) {
      parts.push(text.slice(cursor))
      break
    }
    if (hit > cursor) {
      parts.push(text.slice(cursor, hit))
    }
    parts.push(<mark key={hit}>{text.slice(hit, hit + needle.length)}</mark>)
    cursor = hit + needle.length
  }
  return parts
}
