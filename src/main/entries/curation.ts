import { randomUUID } from 'node:crypto'
import type {
  ChangeMainFormRequest,
  ChangeMainFormResult,
  MergeEntriesRequest,
  MergeEntriesResult,
  MoveEntrySentenceRequest,
  MoveEntrySentenceResult,
  ReselectEntrySentenceRequest,
  ReselectEntrySentenceResult
} from '../../shared/entries'
import type { AppDatabase } from '../db/database'
import { entryExists, hasPinnedNote, refreshLastCollected } from './entry-state'
import {
  readArticleCollections,
  readEntrySentence,
  readEntrySummary,
  resolveEntryKey
} from './queries'
import { readEntrySelection } from './selection'

/**
 * 词条页里会改动归属的动作：换主词形、合并词条、把原句拆到别处、重新圈定。
 * 每次改动都按词条重新算计数与最近收集时间，让左栏与中栏马上对得上。
 */

type StoredSentenceRow = {
  id: string
  entry_id: string
  article_id: string
  paragraph_id: string
  sentence_ordinal: number
  surface: string
  collected_at: string
}

function readStoredSentence(database: AppDatabase, id: string): StoredSentenceRow | undefined {
  return database
    .prepare(
      `SELECT id, entry_id, article_id, paragraph_id, sentence_ordinal, surface, collected_at
         FROM entry_sentence WHERE id = ?`
    )
    .get(id) as StoredSentenceRow | undefined
}

function findEntryIdByKey(database: AppDatabase, key: string): string | null {
  const row = database
    .prepare('SELECT id FROM word_entry WHERE normalized_key = ?')
    .get(key) as { id: string } | undefined
  return row?.id ?? null
}

/** 已收集到的词形。换主词形只能从这些里面挑。 */
function collectedSurfaces(database: AppDatabase, entryIds: readonly string[]): string[] {
  const placeholders = entryIds.map(() => '?').join(', ')
  const rows = database
    .prepare(
      `SELECT DISTINCT surface FROM entry_sentence WHERE entry_id IN (${placeholders})`
    )
    .all(...entryIds) as { surface: string }[]
  return rows.map((row) => row.surface)
}

/** 换主词形：只能从已收集的词形里选，词条键不变。 */
export function changeEntryMainForm(
  database: AppDatabase,
  request: ChangeMainFormRequest
): ChangeMainFormResult {
  if (!entryExists(database, request.entryId)) {
    return { status: 'missing' }
  }
  const surfaces = collectedSurfaces(database, [request.entryId])
  if (!surfaces.includes(request.mainForm)) {
    return { status: 'rejected', reason: 'unknown-form' }
  }

  database
    .prepare('UPDATE word_entry SET main_form = ? WHERE id = ?')
    .run(request.mainForm, request.entryId)

  const entry = readEntrySummary(database, request.entryId)
  return entry ? { status: 'changed', entry } : { status: 'missing' }
}

type MergeCounts = {
  movedSentences: number
  repeatedSentences: number
  movedNotes: number
}

/**
 * 合并词条：源词条的原句与学习内容迁到目标，源词条消失。
 * 同篇同句两边都收过时并成一条；目标已有置顶内容时，迁过来的置顶改为不置顶。
 */
export function mergeEntries(
  database: AppDatabase,
  request: MergeEntriesRequest
): MergeEntriesResult {
  const source = readEntrySummary(database, request.sourceEntryId)
  const target = readEntrySummary(database, request.targetEntryId)
  if (!source || !target) {
    return { status: 'missing' }
  }
  if (source.id === target.id) {
    return { status: 'rejected', reason: 'same-entry' }
  }

  const mainForm = request.mainForm ?? target.mainForm
  if (!collectedSurfaces(database, [source.id, target.id]).includes(mainForm)) {
    return { status: 'rejected', reason: 'main-form' }
  }

  const counts = database.transaction((): MergeCounts => {
    const sentences = database
      .prepare(
        `SELECT id, article_id, paragraph_id, sentence_ordinal
           FROM entry_sentence WHERE entry_id = ?`
      )
      .all(source.id) as {
      id: string
      article_id: string
      paragraph_id: string
      sentence_ordinal: number
    }[]

    let movedSentences = 0
    let repeatedSentences = 0
    for (const sentence of sentences) {
      const duplicate = database
        .prepare(
          `SELECT 1 FROM entry_sentence
            WHERE entry_id = ? AND article_id = ? AND paragraph_id = ? AND sentence_ordinal = ?`
        )
        .get(target.id, sentence.article_id, sentence.paragraph_id, sentence.sentence_ordinal)
      if (duplicate !== undefined) {
        database.prepare('DELETE FROM entry_sentence WHERE id = ?').run(sentence.id)
        repeatedSentences += 1
      } else {
        database
          .prepare('UPDATE entry_sentence SET entry_id = ? WHERE id = ?')
          .run(target.id, sentence.id)
        movedSentences += 1
      }
    }

    const notes = database
      .prepare('SELECT id, pinned FROM learning_note WHERE entry_id = ?')
      .all(source.id) as { id: string; pinned: number }[]
    let pinnedTaken = hasPinnedNote(database, target.id)
    for (const note of notes) {
      const pinned = note.pinned === 1 && !pinnedTaken ? 1 : 0
      if (pinned === 1) {
        pinnedTaken = true
      }
      database
        .prepare('UPDATE learning_note SET entry_id = ?, pinned = ? WHERE id = ?')
        .run(target.id, pinned, note.id)
    }

    database
      .prepare(
        `UPDATE word_entry
            SET main_form = ?, last_collected_at = MAX(last_collected_at, ?)
          WHERE id = ?`
      )
      .run(mainForm, source.lastCollectedAt, target.id)
    database.prepare('DELETE FROM word_entry WHERE id = ?').run(source.id)

    return {
      movedSentences,
      repeatedSentences,
      movedNotes: notes.length
    }
  })()

  const entry = readEntrySummary(database, target.id)
  return entry ? { status: 'merged', entry, ...counts } : { status: 'missing' }
}

/**
 * 把一条原句拆到另一个已有词条，或按它的词形新建一个词条。
 * 拆走源词条的最后一条原句时，源词条与它的学习内容一起删掉（界面先提示）。
 */
export function moveEntrySentence(
  database: AppDatabase,
  request: MoveEntrySentenceRequest,
  options: { now?: string } = {}
): MoveEntrySentenceResult {
  const stored = readStoredSentence(database, request.entrySentenceId)
  if (!stored) {
    return { status: 'missing' }
  }

  let targetId: string | null
  if (request.target.kind === 'entry') {
    targetId = entryExists(database, request.target.entryId)
      ? request.target.entryId
      : null
  } else {
    const key = resolveEntryKey(database, stored.surface)
    targetId = findEntryIdByKey(database, key)
  }
  if (targetId === null && request.target.kind === 'entry') {
    return { status: 'missing' }
  }
  if (targetId === stored.entry_id) {
    return { status: 'rejected', reason: 'same-entry' }
  }

  if (targetId !== null) {
    const duplicate = database
      .prepare(
        `SELECT 1 FROM entry_sentence
          WHERE entry_id = ? AND article_id = ? AND paragraph_id = ? AND sentence_ordinal = ?`
      )
      .get(targetId, stored.article_id, stored.paragraph_id, stored.sentence_ordinal)
    if (duplicate !== undefined) {
      return { status: 'rejected', reason: 'duplicate' }
    }
  }

  const now = options.now ?? new Date().toISOString()
  const resolvedTarget = database.transaction((): string => {
    let receiving = targetId
    if (receiving === null) {
      receiving = randomUUID()
      database
        .prepare(
          `INSERT INTO word_entry (id, main_form, normalized_key, created_at, last_collected_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          receiving,
          stored.surface,
          resolveEntryKey(database, stored.surface),
          now,
          stored.collected_at
        )
    }

    database
      .prepare('UPDATE entry_sentence SET entry_id = ? WHERE id = ?')
      .run(receiving, stored.id)
    refreshLastCollected(database, receiving)
    refreshLastCollected(database, stored.entry_id)

    const remaining = database
      .prepare('SELECT COUNT(*) AS count FROM entry_sentence WHERE entry_id = ?')
      .get(stored.entry_id) as { count: number }
    if (remaining.count === 0) {
      database.prepare('DELETE FROM word_entry WHERE id = ?').run(stored.entry_id)
    }
    return receiving
  })()

  const to = readEntrySummary(database, resolvedTarget)
  if (!to) {
    return { status: 'missing' }
  }
  return {
    status: 'moved',
    from: readEntrySummary(database, stored.entry_id),
    to
  }
}

/** 重新圈定：只在原句所在的那一句里换范围，原句文字与原文逐字一致。 */
export function reselectEntrySentence(
  database: AppDatabase,
  request: ReselectEntrySentenceRequest
): ReselectEntrySentenceResult {
  const stored = readStoredSentence(database, request.entrySentenceId)
  if (!stored) {
    return { status: 'missing' }
  }

  const paragraph = database
    .prepare('SELECT text FROM paragraph WHERE article_id = ? AND id = ?')
    .get(stored.article_id, stored.paragraph_id) as { text: string } | undefined
  const sentence = database
    .prepare(
      `SELECT char_start, char_end FROM sentence
        WHERE article_id = ? AND paragraph_id = ? AND ordinal = ?`
    )
    .get(stored.article_id, stored.paragraph_id, stored.sentence_ordinal) as
    | { char_start: number; char_end: number }
    | undefined
  if (!paragraph || !sentence) {
    return { status: 'missing' }
  }

  const read = readEntrySelection(paragraph.text, sentence, request.start, request.end)
  if (read.status === 'rejected') {
    return read
  }
  const { surface, start, end } = read

  database
    .prepare('UPDATE entry_sentence SET surface = ?, char_start = ?, char_end = ? WHERE id = ?')
    .run(surface, start, end, request.entrySentenceId)

  const entry = readEntrySummary(database, stored.entry_id)
  const updated = readEntrySentence(database, request.entrySentenceId)
  if (!entry || !updated) {
    return { status: 'missing' }
  }
  return {
    status: 'resaved',
    entry,
    sentence: updated,
    articleId: stored.article_id,
    marks: readArticleCollections(database, stored.article_id)
  }
}
