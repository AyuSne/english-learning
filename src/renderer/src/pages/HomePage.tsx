import { useEffect, useState } from 'react'
import type { HomeSummary } from '../../../shared/library'
import { loadHomeSummary } from '../api'
import { ErrorBlock } from '../components/error-block'
import { failureText } from '../errors'
import { continueReadingDisplay, finishedReadingDisplay, homeEntryMeta, homeReadingState } from '../home/format'
import { readingPointText } from '../library/format'
import { navigate } from '../navigate'

/**
 * 首页：继续阅读是最近读过的一篇；最近收集列出真实的词条，点一下进词条。
 */
export function HomePage() {
  const [summary, setSummary] = useState<HomeSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)
    loadHomeSummary().then(
      (value) => {
        if (active) setSummary(value)
      },
      (reason: unknown) => {
        if (active) setError(failureText(reason, '首页没有读出来。'))
      }
    )
    return () => {
      active = false
    }
  }, [reloadToken])

  const current = summary?.continueReading ?? null
  const readingState = homeReadingState(summary)
  const display = current === null ? null : continueReadingDisplay(current.article)
  const finished =
    readingState === 'finished' && summary !== null
      ? finishedReadingDisplay(summary.completedArticleCount)
      : null

  function continueReading(articleId: string): void {
    navigate('reading', { articleId, readingFrom: 'home' })
  }

  function openEntry(entryId: string): void {
    navigate('entries', { entryId })
  }

  const recentEntries = summary?.recentEntries ?? null

  return (
    <div className="page home">
      {finished !== null ? (
        // 读过并完成了，但没有未读完的篇目：明确说「没有未读完的文章了」，
        // 不把已读完的那篇再当成「继续阅读」端出来，也不暗示整个文章库都读过了。
        <section className="home-finished" aria-label="已读完">
          <p className="eyebrow">{finished.eyebrow}</p>
          <h1 className="home-title">{finished.title}</h1>
          <p className="home-lede">{finished.lede}</p>
          <div className="home-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => navigate('library')}
            >
              从文章库挑一篇
            </button>
            <button type="button" className="button" onClick={() => navigate('chat')}>
              用一组词生成
            </button>
          </div>
        </section>
      ) : current === null ? (
        <>
          <p className="eyebrow">还没有开始读</p>
          <h1 className="home-title">先读一篇</h1>
          <p className="home-lede">挑一篇真题开始读，圈下的词会出现在这里。</p>
          <div className="home-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => navigate('library')}
            >
              从文章库挑一篇
            </button>
            <button type="button" className="button" onClick={() => navigate('chat')}>
              用一组词生成
            </button>
          </div>
        </>
      ) : (
        <section className="home-continue" aria-label="继续阅读">
          <p className="eyebrow">{display?.eyebrow}</p>
          <h1 className="home-title">{display?.title}</h1>
          <p className="home-meta">{display?.meta}</p>
          {current.lastReadPoint === null ? (
            <p className="home-position">还没读到下一句。</p>
          ) : (
            <>
              <p className="home-position">上次停在 {readingPointText(current.lastReadPoint)}</p>
              <p className="home-sentence">{current.lastReadPoint.sentenceText}</p>
            </>
          )}
          <div className="home-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => continueReading(current.article.id)}
            >
              继续阅读
            </button>
          </div>
        </section>
      )}

      {error === null ? null : (
        <ErrorBlock
          message={error}
          onAction={() => setReloadToken((token) => token + 1)}
        />
      )}

      <section className="home-section">
        <h2 className="section-label">最近收集</h2>
        {recentEntries === null ? null : recentEntries.length === 0 ? (
          <p className="empty-line">还没有词条。读的时候圈一个词，它就会出现在这里。</p>
        ) : (
          <div className="home-entries" aria-label="最近收集的词条">
            {recentEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="home-entry"
                onClick={() => openEntry(entry.id)}
              >
                <span className="home-entry-form">{entry.mainForm}</span>
                <span className="home-entry-meta">{homeEntryMeta(entry)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="home-section">
        <h2 className="section-label">稍后看</h2>
        <p className="empty-line">空着。看到不想现在查的词，标一下会收到这里。</p>
      </section>
      <section className="home-section">
        <h2 className="section-label">文章库</h2>
        <button type="button" className="home-library" onClick={() => navigate('library')}>
          {summary === null
            ? '文章库'
            : `${summary.library.articleCount} 篇 · ${summary.library.sessionCount} 个场次`}
        </button>
      </section>
    </div>
  )
}
