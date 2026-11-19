import { useEffect, useState } from 'react'
import type { ArticleWordsView } from '../../../shared/article-words'
import { completeArticleReading, loadArticleWords } from '../api'
import { ErrorBlock } from '../components/error-block'
import { failureText } from '../errors'
import { forgetLibraryArticle, goBack, navigate, replaceRoute } from '../navigate'
import type { ReadingSource, WordsSource } from '../routes'
import { articleWordsBackTarget } from './back-target'
import {
  articleWordsSummaryText,
  paragraphWordsCountText,
  paragraphWordsLabel,
  splitSentenceSurface
} from './article-words-format'

/**
 * 本篇选词：同一篇文章下的子视图，按段落列出这篇实际收下的词条与原句。
 *
 * 「进入即已读完」拆成两步：页面先发显式的完成命令（`reading:complete`，幂等、只写
 * 完成时间），再读只读的 `reading:words` 视图。三条入口（阅读页页脚、文章库详情、
 * 直接打开地址）都走这里，所以都会标记；命令或视图失败就原地报错并可重试，不拿
 * 乐观的 100% 冒充已读完。文章不存在时沿用 #41 的退路回文章库；进入、刷新或退出
 * 都不写阅读位置与本篇阅读设置。
 */
export function ArticleWordsPage({
  articleId,
  readingFrom,
  wordsFrom
}: {
  articleId: string | null
  readingFrom: ReadingSource | null
  wordsFrom: WordsSource | null
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

    const fallbackToLibrary = (): void => {
      // 文章可能刚在文章库里被删掉：清掉最近文章并回文章库，不把子视图停在死地址上。
      forgetLibraryArticle(articleId)
      replaceRoute('library')
    }

    const loadWords = (): void => {
      loadArticleWords(articleId).then(
        (value) => {
          if (!active) return
          if (value === null) {
            fallbackToLibrary()
            return
          }
          setView(value)
        },
        (failure: unknown) => {
          if (active) setError(failureText(failure, '本篇选词没有读出来。'))
        }
      )
    }

    completeArticleReading(articleId).then(
      (result) => {
        if (!active) return
        if (result.status === 'missing') {
          fallbackToLibrary()
          return
        }
        loadWords()
      },
      (failure: unknown) => {
        if (active) setError(failureText(failure, '这篇没有标记为已读完。'))
      }
    )

    return () => {
      active = false
    }
  }, [articleId, reloadToken])

  const backTarget = articleWordsBackTarget({ articleId, readingFrom, wordsFrom })

  /**
   * 页脚进来时退回上一层（就是刚才那页阅读页），保留阅读页的定位与滚动；
   * 刷新后浏览器历史里仍是那页阅读页，所以这条退路仍然成立。文章库详情进来
   * 或直接打开地址时没有可退的上一页，按映射显式去文章库或阅读页，不猜历史。
   */
  function goBackFromWords(): void {
    if (wordsFrom === 'reader' && articleId !== null) {
      goBack('reading', { articleId, readingFrom })
      return
    }
    navigate(backTarget.route, backTarget.options)
  }

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
          aria-label={backTarget.ariaLabel}
          onClick={goBackFromWords}
        >
          <span aria-hidden="true">←</span> {backTarget.label}
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
