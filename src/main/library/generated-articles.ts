import { randomUUID } from 'node:crypto'
import type {
  SaveGeneratedArticleRequest,
  SaveGeneratedArticleResult
} from '../../shared/library'
import { ARTICLE_TITLE_MAX_LENGTH } from '../../shared/library'
import { wordContextEntryId, type ThreadContextItem } from '../../shared/threads'
import {
  readAnswerForArticle,
  wordEntryIdsOfQuestion
} from '../chat/threads'
import type { AppDatabase } from '../db/database'
import { normalizeGeneratedText, splitGeneratedText } from './generated-text'
import { readArticleDetail } from './queries'

/**
 * 「存为文章」：把一次已完成的回答存成文章库里的生成文章。
 *
 * 请求只带线程、当前显示的回答版本与可选篇名。正文与来源都由主进程从已存的线程
 * 条目日志里读：根回答加继续生成，不含思维链；来源词只认提这一问时存下的上下文快照，
 * 线程后来增删上下文不会改写它。保存沿用现有 paragraph / sentence 结构，因此阅读、
 * 选词、收原句、回链与删除规则都不需要另一套分支。
 *
 * 与「钉住」是两个独立动作：存为文章保存整条回答，重复保存每次都新建一篇、不覆盖。
 */

/** 生成文章的题型文字。来源是另一个概念，kind 仍按正文形态取仔细阅读（不显示段字母）。 */
const AI_KIND_LABEL = 'AI 生成'
/** 生成文章不占真题场次：session_key 只作库内标识，场次与套数留空，界面不编年份。 */
const AI_SESSION_KEY = 'ai'
const AI_SOURCE_TYPE = 'ai'

/** 英文词数：字母/数字串算一个词，带撇号或连字符的算一个。 */
function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length
}

/** 来源词在提问快照里的显示名；没有 label 时退回正文。 */
function sourceLabelsOf(context: readonly ThreadContextItem[]): Map<string, string> {
  const labels = new Map<string, string>()
  for (const item of context) {
    const entryId = wordContextEntryId(item)
    if (entryId === null || labels.has(entryId)) continue
    const label = item.label.trim() !== '' ? item.label.trim() : item.text.trim()
    if (label !== '') labels.set(entryId, label)
  }
  return labels
}

/**
 * 默认篇名用来源词起：一个词就用它，多词用「、」连起来；太多词时收成「前三个 等 N 个词」。
 * 用户之后可以在文章库重命名。
 */
function defaultTitleOf(
  entryIds: readonly string[],
  labels: ReadonlyMap<string, string>
): string {
  const forms = entryIds
    .map((entryId) => labels.get(entryId) ?? '')
    .filter((form) => form !== '')
  if (forms.length === 0) {
    return AI_KIND_LABEL
  }
  const joined =
    forms.length <= 4
      ? forms.join('、')
      : `${forms.slice(0, 3).join('、')} 等 ${forms.length} 个词`
  const characters = Array.from(joined)
  return characters.length <= ARTICLE_TITLE_MAX_LENGTH
    ? joined
    : `${characters.slice(0, ARTICLE_TITLE_MAX_LENGTH - 1).join('')}…`
}

export function saveGeneratedArticle(
  database: AppDatabase,
  request: SaveGeneratedArticleRequest,
  options: { now?: string } = {}
): SaveGeneratedArticleResult {
  const answer = readAnswerForArticle(database, request.threadId, request.answerId)
  if (answer === null) {
    return { status: 'missing' }
  }
  // 与 ThreadAnswer 的规范语义一致：最后一段成功完成，历史段里的停止/出错不阻止保存。
  if (answer.phase !== 'done' || answer.error !== null) {
    return { status: 'rejected', reason: 'incomplete' }
  }

  const bodyText = normalizeGeneratedText(answer.text)
  if (bodyText === '') {
    return { status: 'rejected', reason: 'empty' }
  }

  // 来源只取提这一问时的上下文快照；线程主对象是词条或组词线程都可以，只要有词。
  const entryIds = wordEntryIdsOfQuestion(answer.questionContext)
  if (entryIds.length === 0) {
    return { status: 'rejected', reason: 'no-word-context' }
  }

  const requestedTitle = request.title?.trim() ?? ''
  const title =
    requestedTitle !== ''
      ? requestedTitle
      : defaultTitleOf(entryIds, sourceLabelsOf(answer.questionContext))
  if (Array.from(title).length > ARTICLE_TITLE_MAX_LENGTH) {
    return { status: 'rejected', reason: 'too-long' }
  }

  const paragraphs = splitGeneratedText(bodyText)
  if (paragraphs.length === 0 || paragraphs.every((paragraph) => paragraph.sentences.length === 0)) {
    return { status: 'rejected', reason: 'empty' }
  }

  const articleId = randomUUID()
  const now = options.now ?? new Date().toISOString()
  const words = countWords(bodyText)

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO article (
           id, title, kind, kind_label, session_key, session_label, set_label,
           exam_year, exam_month, exam_set, word_count, body_text, source_pdf,
           source_sha256, page_start, page_end, ordinal, source_type, source_entry_ids,
           created_at
         ) VALUES (?, ?, 'careful_reading', ?, ?, ?, '', 0, 0, 0, ?, ?, '', '', NULL, NULL,
                   0, ?, ?, ?)`
      )
      .run(
        articleId,
        title,
        AI_KIND_LABEL,
        AI_SESSION_KEY,
        '',
        words,
        bodyText,
        AI_SOURCE_TYPE,
        JSON.stringify(entryIds),
        now
      )

    const insertParagraph = database.prepare(
      `INSERT INTO paragraph (article_id, id, ordinal, text, page_start, page_end)
       VALUES (?, ?, ?, ?, NULL, NULL)`
    )
    const insertSentence = database.prepare(
      `INSERT INTO sentence (article_id, paragraph_id, ordinal, text, char_start, char_end, page)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
    )

    paragraphs.forEach((paragraph, paragraphIndex) => {
      // 段 id 只需篇内唯一；阅读页按 ordinal 排序，不把它们当原卷字母。
      const paragraphId = `g${paragraphIndex + 1}`
      insertParagraph.run(articleId, paragraphId, paragraphIndex, paragraph.text)
      paragraph.sentences.forEach((sentence, sentenceIndex) => {
        insertSentence.run(
          articleId,
          paragraphId,
          sentenceIndex,
          sentence.text,
          sentence.start,
          sentence.end
        )
      })
    })
  })()

  const article = readArticleDetail(database, articleId)
  if (article === null) {
    return { status: 'missing' }
  }
  return { status: 'saved', article }
}
