import type { ImportFailure, ImportReport } from '../../shared/library'
import type { AppDatabase } from '../db/database'
import {
  readCorpusArticle,
  readCorpusManifest,
  reasonOf,
  type CorpusArticle,
  type CorpusManifest
} from './source'

export type CorpusImportOptions = {
  /** 语料目录：manifest.json 与每篇 JSON 都在这里。 */
  directory: string
}

type ExistingArticle = {
  source_sha256: string
  last_paragraph_id: string | null
  last_sentence_index: number | null
}

/**
 * 把语料导入本机库。幂等：以文章 id 判重，内容哈希没变就跳过；哈希变了
 * 说明源 PDF 被替换，按新内容重写这篇文章的段落与句子，阅读位置保留。
 * 单篇失败不影响其余篇：已导入的留在库里，失败项带原因返回。
 */
export function importCorpus(
  database: AppDatabase,
  options: CorpusImportOptions
): ImportReport {
  let manifest: CorpusManifest
  try {
    manifest = readCorpusManifest(options.directory)
  } catch (error) {
    return {
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: [{ id: 'manifest', reason: reasonOf(error) }]
    }
  }

  let imported = 0
  let updated = 0
  let skipped = 0
  const failed: ImportFailure[] = [...manifest.failed]

  for (const entry of manifest.entries) {
    let article: CorpusArticle
    try {
      article = readCorpusArticle(options.directory, entry)
    } catch (error) {
      failed.push({ id: entry.id, reason: reasonOf(error) })
      continue
    }

    try {
      const outcome = persist(database, article, entry.position)
      if (outcome === 'imported') {
        imported += 1
      } else if (outcome === 'updated') {
        updated += 1
      } else {
        skipped += 1
      }
    } catch (error) {
      failed.push({ id: entry.id, reason: `写入本机库失败：${reasonOf(error)}` })
    }
  }

  return {
    total: manifest.entries.length + manifest.failed.length,
    imported,
    updated,
    skipped,
    failed
  }
}

/**
 * 重写这篇文章的段落之后，原来的阅读位置可能已经不存在了：句子还在就留着，
 * 不在了就清空，等阅读页重新写。
 */
function keptReadingPoint(
  existing: ExistingArticle,
  article: CorpusArticle
): { paragraphId: string; sentenceIndex: number } | null {
  if (existing.last_paragraph_id === null || existing.last_sentence_index === null) {
    return null
  }
  const paragraph = article.paragraphs.find(
    (candidate) => candidate.id === existing.last_paragraph_id
  )
  if (!paragraph || existing.last_sentence_index >= paragraph.sentences.length) {
    return null
  }
  return {
    paragraphId: existing.last_paragraph_id,
    sentenceIndex: existing.last_sentence_index
  }
}

function persist(
  database: AppDatabase,
  article: CorpusArticle,
  ordinal: number
): 'imported' | 'updated' | 'skipped' {
  const existing = database
    .prepare(
      `SELECT source_sha256, last_paragraph_id, last_sentence_index FROM article WHERE id = ?`
    )
    .get(article.id) as ExistingArticle | undefined

  if (existing && existing.source_sha256 === article.sha256) {
    return 'skipped'
  }

  const write = database.transaction(() => {
    if (existing) {
      // 段落随文章级联删掉句子与注释。
      database.prepare('DELETE FROM paragraph WHERE article_id = ?').run(article.id)
      const readingPoint = keptReadingPoint(existing, article)
      database
        .prepare(
          `UPDATE article SET
             title = ?, kind = ?, kind_label = ?, session_key = ?, session_label = ?,
             set_label = ?, exam_year = ?, exam_month = ?, exam_set = ?, word_count = ?,
             body_text = ?, source_pdf = ?, source_sha256 = ?, page_start = ?, page_end = ?,
             ordinal = ?, last_paragraph_id = ?, last_sentence_index = ?
           WHERE id = ?`
        )
        .run(
          article.title,
          article.kind,
          article.kindLabel,
          article.sessionKey,
          article.sessionLabel,
          article.setLabel,
          article.examYear,
          article.examMonth,
          article.examSet,
          article.wordCount,
          article.bodyText,
          article.sourcePdf,
          article.sha256,
          article.pageStart,
          article.pageEnd,
          ordinal,
          readingPoint?.paragraphId ?? null,
          readingPoint?.sentenceIndex ?? null,
          article.id
        )
    } else {
      database
        .prepare(
          `INSERT INTO article (
             id, title, kind, kind_label, session_key, session_label, set_label,
             exam_year, exam_month, exam_set, word_count, body_text, source_pdf,
             source_sha256, page_start, page_end, ordinal
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          article.id,
          article.title,
          article.kind,
          article.kindLabel,
          article.sessionKey,
          article.sessionLabel,
          article.setLabel,
          article.examYear,
          article.examMonth,
          article.examSet,
          article.wordCount,
          article.bodyText,
          article.sourcePdf,
          article.sha256,
          article.pageStart,
          article.pageEnd,
          ordinal
        )
    }

    const insertParagraph = database.prepare(
      `INSERT INTO paragraph (article_id, id, ordinal, text, page_start, page_end)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    const insertSentence = database.prepare(
      `INSERT INTO sentence (article_id, paragraph_id, ordinal, text, char_start, char_end, page)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const insertAnnotation = database.prepare(
      `INSERT INTO annotation (
         article_id, paragraph_id, sentence_ordinal, ordinal, surface, gloss, char_start, char_end
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )

    for (const paragraph of article.paragraphs) {
      insertParagraph.run(
        article.id,
        paragraph.id,
        paragraph.ordinal,
        paragraph.text,
        paragraph.pageStart,
        paragraph.pageEnd
      )
      for (const sentence of paragraph.sentences) {
        insertSentence.run(
          article.id,
          paragraph.id,
          sentence.ordinal,
          sentence.text,
          sentence.start,
          sentence.end,
          sentence.page
        )
      }
    }

    for (const annotation of article.annotations) {
      insertAnnotation.run(
        article.id,
        annotation.paragraphId,
        annotation.sentenceOrdinal,
        annotation.ordinal,
        annotation.surface,
        annotation.gloss,
        annotation.start,
        annotation.end
      )
    }
  })

  write()
  return existing ? 'updated' : 'imported'
}
