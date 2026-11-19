import type { ArticleDetail } from '../../../shared/library'
import { navigate } from '../navigate'
import { articleWordsSummaryText } from '../reading/article-words-format'

/**
 * 文章库详情里的「本篇收过」：与词条页、本篇选词读同一份计数。
 * 单独一块，文章重命名 / 删除的改动不碰这里。
 */
export function ArticleCollectedSection({
  article
}: {
  article: Pick<ArticleDetail, 'id' | 'wordEntryCount' | 'collectedSentenceCount'>
}) {
  return (
    <section className="library-collected" aria-label="本篇收过">
      <h3 className="library-collected-title">本篇收过</h3>
      <p className="library-collected-count">
        {article.wordEntryCount === 0
          ? '还没收过词'
          : articleWordsSummaryText(article)}
      </p>
      <button
        type="button"
        className="button"
        onClick={() =>
          navigate('reading', {
            articleId: article.id,
            words: true,
            readingFrom: 'library'
          })
        }
      >
        打开本篇选词
      </button>
    </section>
  )
}
