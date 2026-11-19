import { useEffect, useState } from 'react'
import type { ArticleWordsView } from '../../../shared/article-words'
import { loadArticleWords } from '../api'
import { ErrorBlock } from '../components/error-block'
import { failureText } from '../errors'
import { goBack, navigate } from '../navigate'
import type { ReadingSource } from '../routes'
import {
  articleWordsSummaryText,
  paragraphWordsCountText,
  paragraphWordsLabel,
  splitSentenceSurface
} from './article-words-format'

/**
 * 本篇选词：同一篇文章下的子视图，按段落列出这篇实际收下的词条与原句。
 *
 * 只读视图——进入、刷新或退出都不写阅读位置与本篇阅读设置；「进入即已读完」的
 * 完成时间由 #54 负责，这一层只留出稳定入口（阅读页页脚与文章库详情）。
 */
export function ArticleWordsPage({
  articleId,
  readingFrom
}: {
  articleId: string | null
  readingFrom: ReadingSource | null
}) {
  const [view, setView] = useState<ArticleWordsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (articleId === null) {
      setView(null)
      setError(null)
      return
    }
    let active = true
    setView(null)
    setError(null)
    loadArticleWords(articleId).then(
      (value) => {
        if (!active) return
        if (value === null) {
          setError('这篇文章已经不在库里了。')
          return
        }
        setView(value)
      },
      (failure: unknown) => {
        if (active) setError(failureText(failure, '本篇选词没有读出来。'))
      }
    )
    return () => {
      active = false
    }
  }, [articleId, reloadToken])

  const backLabel =
    readingFrom === 'library' ? '返回文章库' : readingFrom === 'entries' ? '返回词条' : '返回阅读'
  const backFallback = readingFrom === 'library' ? 'library' : readingFrom === 'entries' ? 'entries' : 'reading'

  function backToReading(): void {
    if (articleId === null) {
      navigate('library')
      return
    }
    navigate('reading', { articleId, readingFrom })
  }

  return (
    <div className="reading reading-words" data-article-words="true">
      <header className="reading-bar">
        <button
          type="button"
          className="reading-back"
          aria-label={backLabel}
          onClick={() => goBack(backFallback, { articleId })}
        >
          <span aria-hidden="true">←</span> {backLabel.replace(/^返回/, '')}
        </button>
        <div className="reading-bar-text">
          <h1 className="reading-bar-title">{view?.article.title ?? '本篇选词'}</h1>
        </div>
        <div className="reading-bar-actions">
          {view === null ? null : (
            <>
              <span className="article-words-summary">
                {articleWordsSummaryText(view.article)}
              </span>
              <button type="button" className="reading-tool" onClick={backToReading}>
                回到阅读
              </button>
            </>
          )}
        </div>
      </header>

      <div className="reading-scroll">
        <div className="reading-sheet article-words-sheet">
          {error !== null ? (
            <ErrorBlock
              message={error}
              actionLabel="再读一次"
              onAction={() => setReloadToken((token) => token + 1)}
            />
          ) : view === null ? (
            <p className="empty-line" aria-busy="true">
              正在读本篇选词…
            </p>
          ) : view.paragraphs.length === 0 ? (
            <div className="article-words-empty">
              <p className="eyebrow">本篇还没收词</p>
              <h2 className="article-words-empty-title">先读一篇，圈下想学的词</h2>
              <p className="empty-line">在正文里圈一个词或短语，它就会按段落收在这里。</p>
              <button type="button" className="button button-primary" onClick={backToReading}>
                回到阅读
              </button>
            </div>
          ) : (
            <ol className="article-words-paragraphs">
              {view.paragraphs.map((paragraph) => (
                <li key={paragraph.id} className="article-words-paragraph">
                  <h2 className="article-words-paragraph-head">
                    <span className="article-words-paragraph-label">
                      {paragraphWordsLabel(paragraph)}
                    </span>
                    <span className="article-words-paragraph-count">
                      {paragraphWordsCountText(paragraph.entries.length)}
                    </span>
                  </h2>
                  <ul className="article-words-entries">
                    {paragraph.entries.map(({ entry, sentences }) => (
                      <li key={entry.id} className="article-words-entry">
                        <button
                          type="button"
                          className="article-words-entry-link"
                          onClick={() => navigate('entries', { entryId: entry.id })}
                        >
                          <span className="article-words-entry-form">{entry.mainForm}</span>
                          <span className="article-words-entry-meta">
                            {entry.sentenceCount} 条原句 · {entry.articleCount} 篇
                          </span>
                        </button>
                        <ul className="article-words-sentences">
                          {sentences.map((sentence) => {
                            const parts = splitSentenceSurface(sentence)
                            return (
                              <li key={sentence.id} className="article-words-sentence">
                                {parts.before}
                                {parts.surface === '' ? null : (
                                  <mark className="article-words-surface">{parts.surface}</mark>
                                )}
                                {parts.after}
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
