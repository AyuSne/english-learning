import { randomUUID } from 'node:crypto'
import type {
  CreatePinRequest,
  CreatePinResult,
  DeletePinResult,
  FileAllUnfiledRequest,
  FileAllUnfiledResult,
  MovePinRequest,
  Pin,
  PinBoard,
  PinProvenance,
  PinSourceResult,
  PinTarget,
  PinTargetKind,
  PinTargetView,
  RestorePinInput,
  RestorePinsRequest,
  RestorePinsResult
} from '../../shared/pins'
import type { ChatThreadView, ThreadMain, ThreadTurn } from '../../shared/threads'
import { readThreadView } from '../chat/threads'
import type { AppDatabase } from '../db/database'
import { hasPinnedNote } from '../entries/entry-state'

/**
 * 钉住与钉板。一条钉住是 AI 回答里的一段连续文本的快照，带上出处与落点；
 * 落点是词条时同步写一条学习内容，落点变化时跟着搬，删钉住时连学习内容一起删。
 * 源线程被删不影响钉住本身：出处是抄下来的，入口按 threadAlive 置灰。
 */

type PinRow = {
  id: string
  thread_id: string
  thread_title: string
  answer_id: string
  turn_index: number
  model: string
  captured_text: string
  char_start: number
  char_end: number
  source_sentence_id: string | null
  source_sentence_text: string | null
  target_kind: PinTargetKind
  target_id: string | null
  created_at: string
}

const PIN_COLUMNS = `id, thread_id, thread_title, answer_id, turn_index, model,
  captured_text, char_start, char_end, source_sentence_id, source_sentence_text,
  target_kind, target_id, created_at`

function readPinRow(database: AppDatabase, pinId: string): PinRow | undefined {
  return database
    .prepare(`SELECT ${PIN_COLUMNS} FROM pin WHERE id = ?`)
    .get(pinId) as PinRow | undefined
}

function targetOfRow(row: PinRow): PinTarget {
  if (row.target_kind === 'entry' && row.target_id !== null) {
    return { kind: 'entry', entryId: row.target_id }
  }
  if (row.target_kind === 'article' && row.target_id !== null) {
    return { kind: 'article', articleId: row.target_id }
  }
  return { kind: 'unfiled' }
}

/** 落点写库时只需要 kind 与 id；标签读的时候再解析。 */
function targetIdOf(target: PinTarget): string | null {
  if (target.kind === 'entry') {
    return target.entryId
  }
  if (target.kind === 'article') {
    return target.articleId
  }
  return null
}

function writeTarget(
  database: AppDatabase,
  pinId: string,
  target: PinTarget
): void {
  database
    .prepare('UPDATE pin SET target_kind = ?, target_id = ? WHERE id = ?')
    .run(target.kind, targetIdOf(target), pinId)
}

function entryLabel(database: AppDatabase, entryId: string): string | null {
  const row = database
    .prepare('SELECT main_form FROM word_entry WHERE id = ?')
    .get(entryId) as { main_form: string } | undefined
  return row?.main_form ?? null
}

function articleLabel(database: AppDatabase, articleId: string): string | null {
  const row = database
    .prepare('SELECT title FROM article WHERE id = ?')
    .get(articleId) as { title: string } | undefined
  return row?.title ?? null
}

/**
 * 落点读成界面能直接显示的样子。目标已经不在了（比如词条被合并后删掉）
 * 时按未归档显示，免得卡片挂着一个点不开的标签。
 */
function readTargetView(database: AppDatabase, row: PinRow): PinTargetView {
  const target = targetOfRow(row)
  if (target.kind === 'entry') {
    const label = entryLabel(database, target.entryId)
    return label === null ? { kind: 'unfiled' } : { ...target, label }
  }
  if (target.kind === 'article') {
    const label = articleLabel(database, target.articleId)
    return label === null ? { kind: 'unfiled' } : { ...target, label }
  }
  return target
}

function provenanceOf(row: PinRow): PinProvenance {
  return {
    threadId: row.thread_id,
    threadTitle: row.thread_title,
    answerId: row.answer_id,
    turnIndex: row.turn_index,
    model: row.model,
    sourceSentence:
      row.source_sentence_text === null
        ? null
        : {
            id: row.source_sentence_id ?? '',
            text: row.source_sentence_text
          }
  }
}

type ThreadMainRow = {
  main_kind: string
  main_id: string | null
}

function readThreadMain(database: AppDatabase, threadId: string): ThreadMainRow | undefined {
  return database
    .prepare('SELECT main_kind, main_id FROM thread WHERE id = ?')
    .get(threadId) as ThreadMainRow | undefined
}

/** 源线程主对象决定「归位」时的默认落点；线程删了或对象没了都给未归档。 */
function defaultTargetOf(
  database: AppDatabase,
  thread: ThreadMainRow | undefined
): PinTargetView {
  if (thread === undefined || thread.main_id === null) {
    return { kind: 'unfiled' }
  }
  if (thread.main_kind === 'entry') {
    const label = entryLabel(database, thread.main_id)
    return label === null
      ? { kind: 'unfiled' }
      : { kind: 'entry', entryId: thread.main_id, label }
  }
  if (thread.main_kind === 'article') {
    const label = articleLabel(database, thread.main_id)
    return label === null
      ? { kind: 'unfiled' }
      : { kind: 'article', articleId: thread.main_id, label }
  }
  if (thread.main_kind === 'sentence') {
    const stored = database
      .prepare('SELECT entry_id FROM entry_sentence WHERE id = ?')
      .get(thread.main_id) as { entry_id: string } | undefined
    if (!stored) {
      return { kind: 'unfiled' }
    }
    const label = entryLabel(database, stored.entry_id)
    return label === null
      ? { kind: 'unfiled' }
      : { kind: 'entry', entryId: stored.entry_id, label }
  }
  return { kind: 'unfiled' }
}

function toPin(database: AppDatabase, row: PinRow): Pin {
  const thread = readThreadMain(database, row.thread_id)
  return {
    id: row.id,
    capturedText: row.captured_text,
    start: row.char_start,
    end: row.char_end,
    target: readTargetView(database, row),
    defaultTarget: defaultTargetOf(database, thread),
    provenance: provenanceOf(row),
    threadAlive: thread !== undefined,
    createdAt: row.created_at
  }
}

function readPin(database: AppDatabase, pinId: string): Pin | null {
  const row = readPinRow(database, pinId)
  return row ? toPin(database, row) : null
}

/* ---------- 落点与学习内容 ---------- */

function targetExists(database: AppDatabase, target: PinTarget): boolean {
  if (target.kind === 'unfiled') {
    return true
  }
  if (target.kind === 'entry') {
    return (
      database.prepare('SELECT 1 FROM word_entry WHERE id = ?').get(target.entryId) !==
      undefined
    )
  }
  return (
    database.prepare('SELECT 1 FROM article WHERE id = ?').get(target.articleId) !== undefined
  )
}

type NoteLinkRow = { id: string; entry_id: string; pinned: number }

function noteForPin(database: AppDatabase, pinId: string): NoteLinkRow | undefined {
  return database
    .prepare('SELECT id, entry_id, pinned FROM learning_note WHERE source_pin_id = ?')
    .get(pinId) as NoteLinkRow | undefined
}

/** 钉到词条时补上那条学习内容；正文是钉住的快照。 */
function ensureNoteForPin(
  database: AppDatabase,
  pinId: string,
  entryId: string,
  body: string,
  now: string
): void {
  const existing = noteForPin(database, pinId)
  if (existing) {
    if (existing.entry_id !== entryId) {
      moveNoteRow(database, existing, entryId, now)
    }
    return
  }
  database
    .prepare(
      `INSERT INTO learning_note (
         id, entry_id, body, pinned, source_kind, source_pin_id, created_at, updated_at
       ) VALUES (?, ?, ?, 0, 'pin', ?, ?, ?)`
    )
    .run(randomUUID(), entryId, body, pinId, now, now)
}

/** 学习内容跟着钉住换词条；目标已有置顶内容时，搬过去的那条改为不置顶。 */
function moveNoteRow(
  database: AppDatabase,
  note: NoteLinkRow,
  entryId: string,
  now: string
): void {
  const pinned = note.pinned === 1 && !hasPinnedNote(database, entryId) ? 1 : 0
  database
    .prepare('UPDATE learning_note SET entry_id = ?, pinned = ?, updated_at = ? WHERE id = ?')
    .run(entryId, pinned, now, note.id)
}

/** 钉住离开词条时撤掉那条学习内容；其他落点本来就没有学习内容。 */
function dropNoteForPin(database: AppDatabase, pinId: string): void {
  database.prepare('DELETE FROM learning_note WHERE source_pin_id = ?').run(pinId)
}

/** 落点变化时同步学习内容：到词条补一条，离开词条删掉，词条之间搬过去。 */
function syncNoteTarget(
  database: AppDatabase,
  pinId: string,
  row: PinRow,
  target: PinTarget,
  now: string
): void {
  if (target.kind === 'entry') {
    ensureNoteForPin(database, pinId, target.entryId, row.captured_text, now)
  } else {
    dropNoteForPin(database, pinId)
  }
}

/* ---------- 出处 ---------- */

function readSourceSentence(
  view: ChatThreadView
): { id: string; text: string } | null {
  const main: ThreadMain = view.main
  if (main.kind === 'sentence') {
    return { id: main.entrySentenceId, text: main.sentenceText }
  }
  const item = view.context.find((candidate) => candidate.kind === 'sentence')
  if (!item) {
    return null
  }
  return { id: item.id.replace(/^sentence:/, ''), text: item.text }
}

function findTurn(view: ChatThreadView, answerId: string): ThreadTurn | null {
  return (
    view.turns.find((turn) => turn.answer !== null && turn.answer.id === answerId) ?? null
  )
}

/**
 * 一条钉住的出处：线程名与第几轮都按钉住那一刻的对话记。
 * 回答正文用整版（根回答 + 继续生成）的快照，片段区间就在这段文字上。
 */
function buildProvenance(
  view: ChatThreadView,
  turn: ThreadTurn,
  answerId: string,
  model: string
): PinProvenance {
  const index = view.turns.indexOf(turn)
  return {
    threadId: view.id,
    threadTitle: view.title,
    answerId,
    turnIndex: index + 1,
    model,
    sourceSentence: readSourceSentence(view)
  }
}

/* ---------- 写入 ---------- */

/** 把当前配置的模型名带进出处；没配置时留空，界面不显示这一段。 */
function modelOf(options: { model?: string }): string {
  return options.model?.trim() ?? ''
}

function nowOf(options: { now?: string }): string {
  return options.now ?? new Date().toISOString()
}

export function createPin(
  database: AppDatabase,
  request: CreatePinRequest,
  options: { now?: string; model?: string } = {}
): CreatePinResult {
  const view = readThreadView(database, request.threadId)
  if (!view) {
    return { status: 'rejected', reason: 'thread' }
  }
  const turn = findTurn(view, request.answerId)
  if (!turn) {
    return { status: 'rejected', reason: 'answer' }
  }
  const text = turn.answer?.text ?? ''
  const start = Math.trunc(request.start)
  const end = Math.trunc(request.end)
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= end ||
    end > text.length
  ) {
    return { status: 'rejected', reason: 'range' }
  }
  const capturedText = text.slice(start, end)
  if (capturedText.trim() === '') {
    return { status: 'rejected', reason: 'range' }
  }
  if (!targetExists(database, request.target)) {
    return { status: 'rejected', reason: 'target' }
  }

  const now = nowOf(options)
  const provenance = buildProvenance(
    view,
    turn,
    request.answerId,
    turn.answer?.model !== undefined && turn.answer.model !== ''
      ? turn.answer.model
      : modelOf(options)
  )
  const pinId = randomUUID()

  database.transaction(() => {
    database
      .prepare(
        `INSERT INTO pin (
           id, thread_id, thread_title, answer_id, turn_index, model,
           captured_text, char_start, char_end, source_sentence_id,
           source_sentence_text, target_kind, target_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        pinId,
        provenance.threadId,
        provenance.threadTitle,
        provenance.answerId,
        provenance.turnIndex,
        provenance.model,
        capturedText,
        start,
        end,
        provenance.sourceSentence?.id ?? null,
        provenance.sourceSentence?.text ?? null,
        request.target.kind,
        targetIdOf(request.target),
        now
      )
    if (request.target.kind === 'entry') {
      ensureNoteForPin(database, pinId, request.target.entryId, capturedText, now)
    }
  })()

  const row = readPinRow(database, pinId)
  if (!row) {
    return { status: 'rejected', reason: 'answer' }
  }
  return { status: 'pinned', pin: toPin(database, row) }
}

function sameTarget(a: PinTarget, b: PinTarget): boolean {
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'entry' && b.kind === 'entry') {
    return a.entryId === b.entryId
  }
  if (a.kind === 'article' && b.kind === 'article') {
    return a.articleId === b.articleId
  }
  return true
}

export function movePin(
  database: AppDatabase,
  request: MovePinRequest,
  options: { now?: string } = {}
):
  | { status: 'saved'; pin: Pin }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'target' } {
  const row = readPinRow(database, request.pinId)
  if (!row) {
    return { status: 'missing' }
  }
  if (!targetExists(database, request.target)) {
    return { status: 'rejected', reason: 'target' }
  }
  if (sameTarget(targetOfRow(row), request.target)) {
    return { status: 'saved', pin: toPin(database, row) }
  }

  const now = nowOf(options)
  database.transaction(() => {
    writeTarget(database, row.id, request.target)
    const updated = readPinRow(database, row.id)
    if (updated) {
      syncNoteTarget(database, row.id, updated, request.target, now)
    }
  })()

  const updated = readPinRow(database, row.id)
  return updated ? { status: 'saved', pin: toPin(database, updated) } : { status: 'missing' }
}

export function deletePin(database: AppDatabase, request: { pinId: string }): DeletePinResult {
  const row = readPinRow(database, request.pinId)
  if (!row) {
    return { status: 'missing' }
  }
  database.transaction(() => {
    dropNoteForPin(database, row.id)
    database.prepare('DELETE FROM pin WHERE id = ?').run(row.id)
  })()
  return { status: 'deleted', pinId: row.id }
}

/** 未归档一次全部归位；返回归位后的卡片，撤销就是逐条移回未归档。 */
export function fileAllUnfiled(
  database: AppDatabase,
  request: FileAllUnfiledRequest,
  options: { now?: string } = {}
): FileAllUnfiledResult {
  if (!targetExists(database, request.target)) {
    return { status: 'rejected', reason: 'target' }
  }
  const rows = database
    .prepare(
      `SELECT ${PIN_COLUMNS} FROM pin
        WHERE target_kind = 'unfiled'
        ORDER BY created_at, rowid`
    )
    .all() as PinRow[]
  if (rows.length === 0) {
    return { status: 'filed', filed: [] }
  }

  const now = nowOf(options)
  database.transaction(() => {
    for (const row of rows) {
      writeTarget(database, row.id, request.target)
      const updated = readPinRow(database, row.id)
      if (updated) {
        syncNoteTarget(database, row.id, updated, request.target, now)
      }
    }
  })()

  const filed = rows
    .map((row) => readPin(database, row.id))
    .filter((pin): pin is Pin => pin !== null)
  return { status: 'filed', filed }
}

/** 撤销「丢弃」：按原 id、原落点与原出处放回去，落到词条时补回学习内容。 */
export function restorePins(
  database: AppDatabase,
  request: RestorePinsRequest,
  options: { now?: string } = {}
): RestorePinsResult {
  for (const pin of request.pins) {
    if (!targetExists(database, pin.target)) {
      return { status: 'rejected', reason: 'target' }
    }
  }
  const now = nowOf(options)
  database.transaction(() => {
    for (const pin of request.pins) {
      const existing = readPinRow(database, pin.id)
      if (existing) {
        continue
      }
      insertRestoredPin(database, pin, now)
      if (pin.target.kind === 'entry') {
        ensureNoteForPin(database, pin.id, pin.target.entryId, pin.capturedText, now)
      }
    }
  })()

  const restored = request.pins
    .map((pin) => readPin(database, pin.id))
    .filter((pin): pin is Pin => pin !== null)
  return { status: 'restored', pins: restored }
}

function insertRestoredPin(database: AppDatabase, pin: RestorePinInput, now: string): void {
  database
    .prepare(
      `INSERT INTO pin (
         id, thread_id, thread_title, answer_id, turn_index, model,
         captured_text, char_start, char_end, source_sentence_id,
         source_sentence_text, target_kind, target_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      pin.id,
      pin.provenance.threadId,
      pin.provenance.threadTitle,
      pin.provenance.answerId,
      pin.provenance.turnIndex,
      pin.provenance.model,
      pin.capturedText,
      pin.start,
      pin.end,
      pin.provenance.sourceSentence?.id ?? null,
      pin.provenance.sourceSentence?.text ?? null,
      pin.target.kind,
      targetIdOf(pin.target),
      pin.createdAt || now
    )
}

/* ---------- 读取 ---------- */

function readPinsWhere(
  database: AppDatabase,
  where: string,
  parameter: string | null
): Pin[] {
  const statement = database.prepare(
    `SELECT ${PIN_COLUMNS} FROM pin
      WHERE ${where}
      ORDER BY created_at DESC, rowid DESC`
  )
  const rows = (parameter === null ? statement.all() : statement.all(parameter)) as PinRow[]
  return rows.map((row) => toPin(database, row))
}

/**
 * 钉板的两份列表：这条线程已归位的钉住，以及全局未归档。
 * 未归档单独一份，是为了不让「待决定落点」的东西混进这条线程的收集里；
 * 目标已经不在了的钉住也算未归档，读和计数不能各说各话。
 */
export function readPinBoard(database: AppDatabase, threadId: string | null): PinBoard {
  const threadRows = threadId === null ? [] : readPinsWhere(database, 'thread_id = ?', threadId)
  const threadPins = threadRows.filter((pin) => pin.target.kind !== 'unfiled')

  const unfiled = new Map<string, Pin>()
  for (const pin of readPinsWhere(database, "target_kind = 'unfiled'", null)) {
    unfiled.set(pin.id, pin)
  }
  for (const pin of threadRows) {
    if (pin.target.kind === 'unfiled') {
      unfiled.set(pin.id, pin)
    }
  }
  const unfiledPins = [...unfiled.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  )

  return {
    threadId,
    threadPins,
    unfiledPins,
    unfiledCount: unfiledPins.length
  }
}

/** 学习内容卡上的来源行：钉住还在不在、源线程还在不在。 */
export function readPinSource(database: AppDatabase, pinId: string): PinSourceResult {
  const row = readPinRow(database, pinId)
  if (!row) {
    return null
  }
  const pin = toPin(database, row)
  const thread = readThreadView(database, row.thread_id)
  if (!thread) {
    return { pin, thread: null, onBranch: false, questionId: null }
  }
  const onBranch = thread.turns.some(
    (turn) => turn.answer !== null && turn.answer.id === row.answer_id
  )
  if (onBranch) {
    return { pin, thread, onBranch, questionId: null }
  }
  const parent = database
    .prepare(
      `SELECT parent_id FROM thread_entry
        WHERE id = ? AND thread_id = ? AND kind = 'answer'`
    )
    .get(row.answer_id, row.thread_id) as { parent_id: string | null } | undefined
  return {
    pin,
    thread,
    onBranch,
    questionId: parent?.parent_id ?? null
  }
}

/**
 * 词条被删或合并后让钉住的落点跟上：合并时迁到目标词条，删除时退成未归档。
 * 学习内容由各自的事务处理，这里只改落点。
 */
export function reassignPinsFromEntry(
  database: AppDatabase,
  fromEntryId: string,
  toEntryId: string | null
): void {
  if (toEntryId === null) {
    database
      .prepare(
        `UPDATE pin SET target_kind = 'unfiled', target_id = NULL
          WHERE target_kind = 'entry' AND target_id = ?`
      )
      .run(fromEntryId)
    return
  }
  database
    .prepare(
      `UPDATE pin SET target_id = ?
        WHERE target_kind = 'entry' AND target_id = ?`
    )
    .run(toEntryId, fromEntryId)
}

/** 学习内容被删时连带撤掉钉住本身；返回是否确实删了。 */
export function removePinForNote(database: AppDatabase, pinId: string): boolean {
  return database.prepare('DELETE FROM pin WHERE id = ?').run(pinId).changes > 0
}

/** 学习内容被移到别的词条时，钉住的落点跟着走。 */
export function retargetPinForNote(
  database: AppDatabase,
  pinId: string,
  entryId: string
): void {
  database
    .prepare(
      `UPDATE pin SET target_kind = 'entry', target_id = ?
        WHERE id = ? AND target_kind = 'entry'`
    )
    .run(entryId, pinId)
}
