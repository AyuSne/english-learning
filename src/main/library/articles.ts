import type {
  ArticleDeletionPreview,
  DeleteArticleRequest,
  DeleteArticleResult,
  RenameArticleRequest,
  RenameArticleResult
} from '../../shared/library'
import { ARTICLE_TITLE_MAX_LENGTH } from '../../shared/library'
import type { AppDatabase } from '../db/database'
import { refreshLastCollected } from '../entries/entry-state'
import { reassignPinsFromEntry } from '../pins/pins'
import {
  forgetArticleTitleOverride,
  markArticleDeleted,
  rememberArticleTitleOverride
} from './article-marks'

/**
 * 文章的重命名与删除。重命名只改显示名；删除按文章→段落→句子→原句关联级联，
 * 再按「删最后一条原句」的规则清理词条，并在同一笔事务里把挂在本篇的钉住转为未归档。
 * 语料导入会再跑，所以删掉的 id 也要在同一笔事务里记下，免得重启后文章复活。
 */

type AffectedEntryRow = {
  entry_id: string
  in_article: number
  total: number
}

/**
 * 这一篇的每条原句关联属于哪个词条，以及那个词条总共还有几条原句。
 * `total === in_article` 的就是删完会消失的词条；其余是仍被其他文章支撑的存活词条。
 */
function readAffectedEntries(database: AppDatabase, articleId: string): AffectedEntryRow[] {
  return database
    .prepare(
      `SELECT es.entry_id,
              COUNT(*) AS in_article,
              (SELECT COUNT(*) FROM entry_sentence all_es
                WHERE all_es.entry_id = es.entry_id) AS total
         FROM entry_sentence es
        WHERE es.article_id = ?
        GROUP BY es.entry_id`
    )
    .all(articleId) as AffectedEntryRow[]
}

function readArticlePinCount(database: AppDatabase, articleId: string): number {
  const row = database
    .prepare(
      `SELECT COUNT(*) AS count FROM pin
        WHERE target_kind = 'article' AND target_id = ?`
    )
    .get(articleId) as { count: number }
  return row.count
}

function readEntryNoteCount(database: AppDatabase, entryId: string): number {
  const row = database
    .prepare('SELECT COUNT(*) AS count FROM learning_note WHERE entry_id = ?')
    .get(entryId) as { count: number }
  return row.count
}

/** 删除前的影响面。文章不存在时返回 null，界面据此不再弹确认。 */
export function readArticleDeletionPreview(
  database: AppDatabase,
  articleId: string
): ArticleDeletionPreview | null {
  const exists = database
    .prepare('SELECT 1 FROM article WHERE id = ?')
    .get(articleId)
  if (exists === undefined) {
    return null
  }

  const affected = readAffectedEntries(database, articleId)
  let disappearingEntryCount = 0
  let disappearingLearningNoteCount = 0
  for (const row of affected) {
    if (row.total === row.in_article) {
      disappearingEntryCount += 1
      disappearingLearningNoteCount += readEntryNoteCount(database, row.entry_id)
    }
  }

  return {
    articleId,
    sentenceAssociationCount: affected.reduce((total, row) => total + row.in_article, 0),
    affectedEntryCount: affected.length,
    disappearingEntryCount,
    survivingEntryCount: affected.length - disappearingEntryCount,
    disappearingLearningNoteCount,
    articlePinCount: readArticlePinCount(database, articleId)
  }
}

/**
 * 重命名只改显示名；标题与用户覆盖标记在同一笔事务里写。
 * 语料刷新会重写文章元信息，导入时按这个标记把用户的名字放回去。
 */
export function renameArticle(
  database: AppDatabase,
  request: RenameArticleRequest
): RenameArticleResult {
  const title = request.title.trim()
  if (title === '') {
    return { status: 'rejected', reason: 'empty' }
  }
  if (title.length > ARTICLE_TITLE_MAX_LENGTH) {
    return { status: 'rejected', reason: 'too-long' }
  }
  const exists = database
    .prepare('SELECT 1 FROM article WHERE id = ?')
    .get(request.articleId)
  if (exists === undefined) {
    return { status: 'missing' }
  }

  database.transaction(() => {
    database.prepare('UPDATE article SET title = ? WHERE id = ?').run(title, request.articleId)
    rememberArticleTitleOverride(database, request.articleId, title)
  })()
  return { status: 'renamed', articleId: request.articleId, title }
}

/**
 * 确认弹层看到的那份影响面是否仍然成立。逐项比较，不只比总数：
 * 原句、词条、学习内容与钉住任何一项变了都算变了，删除必须重新确认。
 */
function sameDeletionPreview(
  confirmed: ArticleDeletionPreview,
  current: ArticleDeletionPreview
): boolean {
  return (
    confirmed.articleId === current.articleId &&
    confirmed.sentenceAssociationCount === current.sentenceAssociationCount &&
    confirmed.affectedEntryCount === current.affectedEntryCount &&
    confirmed.disappearingEntryCount === current.disappearingEntryCount &&
    confirmed.survivingEntryCount === current.survivingEntryCount &&
    confirmed.disappearingLearningNoteCount === current.disappearingLearningNoteCount &&
    confirmed.articlePinCount === current.articlePinCount
  )
}

/**
 * 删除一篇文章：文章、段落、句子与 entry_sentence 由外键级联；
 * 受影响词条若已无原句，按「删最后一条原句」的规则连同学习内容一起删；
 * 挂在本篇的钉住只改落点为未归档，快照、出处与来源原句一个字不动。
 *
 * 删除前在事务里重新算影响面，和用户确认的那份对不上就整体回滚、返回 `stale`：
 * 界面拿最新一份重新确认，绝不按旧数字悄悄删掉刚收下的原句或钉住。
 */
export function deleteArticle(
  database: AppDatabase,
  request: DeleteArticleRequest
): DeleteArticleResult {
  const outcome = database.transaction((): DeleteArticleResult | null => {
    const current = readArticleDeletionPreview(database, request.articleId)
    if (current === null) {
      return null
    }
    if (!sameDeletionPreview(request.confirmed, current)) {
      return { status: 'stale', articleId: request.articleId, preview: current }
    }

    const affected = readAffectedEntries(database, request.articleId)
    database.prepare('DELETE FROM article WHERE id = ?').run(request.articleId)

    for (const row of affected) {
      if (row.total === row.in_article) {
        // 词条删掉后，钉在上面的学习内容随级联没了；钉住本身退回未归档等重新落点。
        reassignPinsFromEntry(database, row.entry_id, null)
        database.prepare('DELETE FROM word_entry WHERE id = ?').run(row.entry_id)
      } else {
        refreshLastCollected(database, row.entry_id)
      }
    }

    database
      .prepare(
        `UPDATE pin SET target_kind = 'unfiled', target_id = NULL
          WHERE target_kind = 'article' AND target_id = ?`
      )
      .run(request.articleId)

    markArticleDeleted(database, request.articleId)
    forgetArticleTitleOverride(database, request.articleId)
    return { status: 'deleted', articleId: request.articleId, preview: current }
  })()

  return outcome ?? { status: 'missing' }
}
