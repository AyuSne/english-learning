import { useEffect, useState } from 'react'
import type { HomeSummary } from '../../../shared/library'
import { loadHomeSummary } from '../api'
import { ErrorBlock } from '../components/error-block'
import { failureText } from '../errors'
import { readingPointText, progressText } from '../library/format'
import { navigate } from '../navigate'

/**
 * 首页：读过一篇就把「继续阅读」放在最前，没读过仍是首屏空态。
 * 最近收集与稍后看随词条一起落地，这里先占位。
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

  function continueReading(articleId: string): void {
    navigate('reading', { articleId, readingFrom: 'home' })
  }

  return (
    <div className="page home">
      {current === null ? (
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
          <p className="eyebrow">继续阅读</p>
          <h1 className="home-title">{current.article.title}</h1>
          <p className="home-meta">
            {current.article.sessionLabel} · {current.article.kindLabel} ·{' '}
            {current.article.wordCount} 词 · {progressText(current.article.progress)}
          </p>
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
        <p className="empty-line">还没有词条。读的时候圈一个词，它就会出现在这里。</p>
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
