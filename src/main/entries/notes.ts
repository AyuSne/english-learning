import { randomUUID } from 'node:crypto'
import type {
  CreateLearningNoteRequest,
  LearningNote,
  LearningNoteResult,
  MoveLearningNoteRequest,
  PinLearningNoteRequest,
  UpdateLearningNoteRequest
} from '../../shared/entries'
import type { AppDatabase } from '../db/database'
import { PIN_SOURCE_EXISTS_SQL, removePinForNote, retargetPinForNote } from '../pins/pins'
import { entryExists, hasPinnedNote } from './entry-state'

/**
 * 学习内容：词条下的一段材料，只保留最终稿。
 * 来源留给钉住（`source_kind = 'pin'`），手写的都是 `manual`；置顶在同一个词条里只有一条，
 * 由部分唯一索引兜住。钉住带进来的内容与钉住同生共死：删内容即撤钉住，移动内容落点跟着走。
 */

type NoteRow = {
  id: string
  entry_id: string
  body: string
  pinned: number
  source_kind: string
  source_pin_id: string | null
  created_at: string
  updated_at: string
  pin_id: string | null
  pin_thread_id: string | null
  pin_thread_title: string | null
  pin_turn_index: number | null
  pin_model: string | null
  pin_created_at: string | null
  pin_thread_alive: number | null
}

const NOTE_COLUMNS = `ln.id, ln.entry_id, ln.body, ln.pinned, ln.source_kind,
  ln.source_pin_id, ln.created_at, ln.updated_at,
  p.id AS pin_id, p.thread_id AS pin_thread_id, p.thread_title AS pin_thread_title,
  p.turn_index AS pin_turn_index, p.model AS pin_model, p.created_at AS pin_created_at,
  ${PIN_SOURCE_EXISTS_SQL} AS pin_thread_alive`

const NOTE_FROM = `FROM learning_note ln LEFT JOIN pin p ON p.id = ln.source_pin_id`

function toLearningNote(row: NoteRow): LearningNote {
  return {
    id: row.id,
    entryId: row.entry_id,
    body: row.body,
    pinned: row.pinned === 1,
    source: row.source_kind === 'pin' ? 'pin' : 'manual',
    sourcePinId: row.source_pin_id,
    sourcePin:
      row.source_kind === 'pin' && row.pin_id !== null && row.pin_thread_id !== null
        ? {
            id: row.pin_id,
            threadId: row.pin_thread_id,
            threadTitle: row.pin_thread_title ?? '',
            turnIndex: row.pin_turn_index ?? 0,
            model: row.pin_model ?? '',
            capturedAt: row.pin_created_at ?? '',
            threadAlive: row.pin_thread_alive === 1
          }
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function readNoteRow(database: AppDatabase, noteId: string): NoteRow | undefined {
  return database
    .prepare(`SELECT ${NOTE_COLUMNS} ${NOTE_FROM} WHERE ln.id = ?`)
    .get(noteId) as NoteRow | undefined
}

function readNote(database: AppDatabase, noteId: string): LearningNote | null {
  const row = readNoteRow(database, noteId)
  return row ? toLearningNote(row) : null
}

/** 词条下的学习内容：置顶的在最前，其余按写下的时间倒序。 */
export function readLearningNotes(database: AppDatabase, entryId: string): LearningNote[] {
  const rows = database
    .prepare(
      `SELECT ${NOTE_COLUMNS} ${NOTE_FROM}
        WHERE ln.entry_id = ?
        ORDER BY ln.pinned DESC, ln.created_at DESC, ln.id DESC`
    )
    .all(entryId) as NoteRow[]
  return rows.map(toLearningNote)
}

/** 写一条学习内容。正文两端空白去掉，全是空白就不保存。 */
export function createLearningNote(
  database: AppDatabase,
  request: CreateLearningNoteRequest,
  options: { now?: string } = {}
): LearningNoteResult {
  const body = request.body.trim()
  if (body === '') {
    return { status: 'rejected', reason: 'empty' }
  }
  if (!entryExists(database, request.entryId)) {
    return { status: 'rejected', reason: 'entry' }
  }

  const now = options.now ?? new Date().toISOString()
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO learning_note (
         id, entry_id, body, pinned, source_kind, source_pin_id, created_at, updated_at
       ) VALUES (?, ?, ?, 0, 'manual', NULL, ?, ?)`
    )
    .run(id, request.entryId, body, now, now)

  const note = readNote(database, id)
  return note ? { status: 'saved', note } : { status: 'missing' }
}

/** 改一条学习内容，旧稿不保留。 */
export function updateLearningNote(
  database: AppDatabase,
  request: UpdateLearningNoteRequest,
  options: { now?: string } = {}
): LearningNoteResult {
  if (readNoteRow(database, request.noteId) === undefined) {
    return { status: 'missing' }
  }
  const body = request.body.trim()
  if (body === '') {
    return { status: 'rejected', reason: 'empty' }
  }

  const now = options.now ?? new Date().toISOString()
  database
    .prepare('UPDATE learning_note SET body = ?, updated_at = ? WHERE id = ?')
    .run(body, now, request.noteId)

  const note = readNote(database, request.noteId)
  return note ? { status: 'saved', note } : { status: 'missing' }
}

/** 置顶或取消置顶。置顶一条时，同一个词条里原来那条自动让位。 */
export function pinLearningNote(
  database: AppDatabase,
  request: PinLearningNoteRequest,
  options: { now?: string } = {}
): LearningNoteResult {
  const existing = readNoteRow(database, request.noteId)
  if (!existing) {
    return { status: 'missing' }
  }

  const now = options.now ?? new Date().toISOString()
  database.transaction(() => {
    if (request.pinned) {
      database
        .prepare(
          `UPDATE learning_note SET pinned = 0, updated_at = ?
            WHERE entry_id = ? AND id <> ? AND pinned = 1`
        )
        .run(now, existing.entry_id, existing.id)
    }
    database
      .prepare('UPDATE learning_note SET pinned = ?, updated_at = ? WHERE id = ?')
      .run(request.pinned ? 1 : 0, now, existing.id)
  })()

  const note = readNote(database, request.noteId)
  return note ? { status: 'saved', note } : { status: 'missing' }
}

/** 删掉一条学习内容，不留墓碑。从钉住来的内容连钉住一起撤掉，对话里的描边随之消失。 */
export function deleteLearningNote(
  database: AppDatabase,
  request: { noteId: string }
): LearningNoteResult {
  const existing = readNoteRow(database, request.noteId)
  if (!existing) {
    return { status: 'missing' }
  }
  database.transaction(() => {
    database.prepare('DELETE FROM learning_note WHERE id = ?').run(request.noteId)
    if (existing.source_pin_id !== null) {
      removePinForNote(database, existing.source_pin_id)
    }
  })()
  return { status: 'deleted' }
}

/** 把学习内容移到另一个词条；目标已有置顶内容时，移过去的那条改为不置顶。 */
export function moveLearningNote(
  database: AppDatabase,
  request: MoveLearningNoteRequest,
  options: { now?: string } = {}
): LearningNoteResult {
  const existing = readNoteRow(database, request.noteId)
  if (!existing) {
    return { status: 'missing' }
  }
  if (existing.entry_id === request.entryId) {
    return { status: 'rejected', reason: 'same-entry' }
  }
  if (!entryExists(database, request.entryId)) {
    return { status: 'rejected', reason: 'entry' }
  }

  const pinned = existing.pinned === 1 && !hasPinnedNote(database, request.entryId) ? 1 : 0
  const now = options.now ?? new Date().toISOString()

  database.transaction(() => {
    database
      .prepare('UPDATE learning_note SET entry_id = ?, pinned = ?, updated_at = ? WHERE id = ?')
      .run(request.entryId, pinned, now, existing.id)
    if (existing.source_pin_id !== null) {
      retargetPinForNote(database, existing.source_pin_id, request.entryId)
    }
  })()

  const note = readNote(database, request.noteId)
  return note ? { status: 'saved', note } : { status: 'missing' }
}
