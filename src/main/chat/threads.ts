import { randomUUID } from 'node:crypto'
import type { ChatError } from '../../shared/chat'
import type {
  AskThreadRequest,
  ChatThreadView,
  CreateThreadRequest,
  CreateThreadResult,
  EditQuestionRequest,
  QuestionResult,
  SaveAnswerRequest,
  SaveAnswerResult,
  SaveContinuationRequest,
  SwitchAnswerRequest,
  SwitchQuestionRequest,
  SwitchThreadResult,
  ThreadAnswer,
  ThreadContextCandidates,
  ThreadContextItem,
  ThreadContextKind,
  ThreadContextSummary,
  ThreadListItem,
  ThreadListResult,
  ThreadMain,
  ThreadMainKind,
  ThreadTurn,
  ThreadVersion,
  UpdateThreadContextRequest,
  UpdateThreadContextResult
} from '../../shared/threads'
import { paragraphLetter } from '../corpus/letter'
import type { AppDatabase } from '../db/database'

/**
 * 线程是围绕一个词、一条原句或一篇文章展开的对话，也可以什么都不挂。
 * 线程存成不可变条目日志（ADR 0003）：条目只追加，parent_id 构成树，
 * 线程只记一个 leaf_entry_id 表示当前分支。重新生成是同一提问下的兄弟回答，
 * 改口是同一条父条目下的兄弟提问；继续生成接在当前回答的最后一段后面。
 */

type ThreadEntryKind = 'question' | 'answer' | 'continuation'
type AnswerPhase = 'done' | 'stopped' | 'error'

type ThreadRow = {
  id: string
  title: string
  main_kind: string
  main_id: string | null
  context_json: string
  leaf_entry_id: string | null
  created_at: string
  updated_at: string
}

type ThreadEntryRow = {
  row_id: number
  id: string
  parent_id: string | null
  kind: string
  payload: string
  created_at: string
}

type QuestionPayload = {
  text: string
  context: ThreadContextItem[]
}

type AnswerPayload = {
  text: string
  thinking: string
  thinkingMs: number
  phase: AnswerPhase
  error: ChatError | null
}

const CONTEXT_KINDS: readonly ThreadContextKind[] = [
  'word',
  'sentence',
  'paragraph',
  'note',
  'article'
]
const ANSWER_PHASES: readonly AnswerPhase[] = ['done', 'stopped', 'error']
/** 一条线程最多带这么多条上下文，防止界面把整本书塞进去。 */
const CONTEXT_LIMIT = 100
const TITLE_LIMIT = 30

function nowOf(options: { now?: string }): string {
  return options.now ?? new Date().toISOString()
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function parseContextJson(raw: string): ThreadContextItem[] {
  try {
    return sanitizeContextItems(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

function isContextKind(value: unknown): value is ThreadContextKind {
  return typeof value === 'string' && (CONTEXT_KINDS as readonly string[]).includes(value)
}

/**
 * 上下文条目跨层传来，写库前只留认得的部分：种类要对、字要非空、id 要唯一。
 * 同一个 id 只留第一条，保持加入顺序。
 */
export function sanitizeContextItems(value: unknown): ThreadContextItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const items: ThreadContextItem[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const record = candidate as Record<string, unknown>
    const { id, kind, label, text, source } = record
    if (typeof id !== 'string' || id === '' || !isContextKind(kind)) continue
    if (typeof text !== 'string' || text.trim() === '') continue
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      kind,
      label: typeof label === 'string' ? label : '',
      text,
      source: typeof source === 'string' ? source : ''
    })
    if (items.length >= CONTEXT_LIMIT) break
  }
  return items
}

/** 「N 条原句 · 约 M 字」：原句条数只数 sentence 条目，字数据正文码点。 */
export function summarizeContext(items: readonly ThreadContextItem[]): ThreadContextSummary {
  let sentenceCount = 0
  let charCount = 0
  for (const item of items) {
    if (item.kind === 'sentence') {
      sentenceCount += 1
    }
    charCount += Array.from(item.text).length
  }
  return { sentenceCount, charCount }
}

/* ---------- 主对象 ---------- */

type EntryMainRow = {
  id: string
  main_form: string
  sentence_count: number
  article_count: number
}

type SentenceMainRow = {
  id: string
  entry_id: string
  surface: string
  article_id: string
  paragraph_id: string
  sentence_ordinal: number
  sentence_text: string
  article_title: string
  article_kind: string
  paragraph_ordinal: number
}

type ArticleMainRow = {
  id: string
  title: string
  session_label: string
  set_label: string
  kind_label: string
  word_count: number
}

function readEntryMain(database: AppDatabase, entryId: string): ThreadMain {
  const row = database
    .prepare(
      `SELECT we.id, we.main_form,
              (SELECT COUNT(*) FROM entry_sentence es WHERE es.entry_id = we.id) AS sentence_count,
              (SELECT COUNT(DISTINCT es.article_id) FROM entry_sentence es
                WHERE es.entry_id = we.id) AS article_count
         FROM word_entry we WHERE we.id = ?`
    )
    .get(entryId) as EntryMainRow | undefined
  return row
    ? {
        kind: 'entry',
        entryId: row.id,
        mainForm: row.main_form,
        sentenceCount: row.sentence_count,
        articleCount: row.article_count
      }
    : { kind: 'none' }
}

function readSentenceMain(database: AppDatabase, entrySentenceId: string): ThreadMain {
  const row = database
    .prepare(
      `SELECT es.id, es.entry_id, es.surface, es.article_id, es.paragraph_id,
              es.sentence_ordinal, s.text AS sentence_text, a.title AS article_title,
              a.kind AS article_kind, p.ordinal AS paragraph_ordinal, we.main_form
         FROM entry_sentence es
         JOIN word_entry we ON we.id = es.entry_id
         JOIN article a ON a.id = es.article_id
         JOIN paragraph p ON p.article_id = es.article_id AND p.id = es.paragraph_id
         JOIN sentence s
           ON s.article_id = es.article_id
          AND s.paragraph_id = es.paragraph_id
          AND s.ordinal = es.sentence_ordinal
        WHERE es.id = ?`
    )
    .get(entrySentenceId) as (SentenceMainRow & { main_form: string }) | undefined
  if (!row) {
    return { kind: 'none' }
  }
  return {
    kind: 'sentence',
    entryId: row.entry_id,
    entrySentenceId: row.id,
    mainForm: row.main_form,
    surface: row.surface,
    sentenceText: row.sentence_text,
    articleId: row.article_id,
    articleTitle: row.article_title,
    paragraphId: row.paragraph_id,
    paragraphOrdinal: row.paragraph_ordinal + 1,
    paragraphLetter: paragraphLetter(
      row.article_kind as 'long_match' | 'careful_reading',
      row.paragraph_id,
      row.paragraph_ordinal
    ),
    sentenceOrdinal: row.sentence_ordinal
  }
}

function readArticleMain(database: AppDatabase, articleId: string): ThreadMain {
  const row = database
    .prepare(
      `SELECT id, title, session_label, set_label, kind_label, word_count
         FROM article WHERE id = ?`
    )
    .get(articleId) as ArticleMainRow | undefined
  return row
    ? {
        kind: 'article',
        articleId: row.id,
        title: row.title,
        sessionLabel: row.session_label,
        setLabel: row.set_label,
        kindLabel: row.kind_label,
        wordCount: row.word_count
      }
    : { kind: 'none' }
}

function describeMain(
  database: AppDatabase,
  mainKind: ThreadMainKind,
  mainId: string | null
): ThreadMain {
  if (mainId === null) {
    return { kind: 'none' }
  }
  if (mainKind === 'entry') {
    return readEntryMain(database, mainId)
  }
  if (mainKind === 'sentence') {
    return readSentenceMain(database, mainId)
  }
  if (mainKind === 'article') {
    return readArticleMain(database, mainId)
  }
  return { kind: 'none' }
}

function mainIdOf(request: CreateThreadRequest['main']): string | null {
  if (request.kind === 'entry') return request.entryId
  if (request.kind === 'sentence') return request.entrySentenceId
  if (request.kind === 'article') return request.articleId
  return null
}

function mainLabelOf(main: ThreadMain): string {
  switch (main.kind) {
    case 'none':
      return '未挂对象'
    case 'entry':
      return `词条 ${main.mainForm}`
    case 'sentence':
      return `原句 · ${main.surface} · 段 ${
        main.paragraphLetter ?? main.paragraphOrdinal
      } · 第 ${main.sentenceOrdinal + 1} 句`
    case 'article':
      return `文章 · ${main.title}`
  }
}

function titleOf(main: ThreadMain): string {
  switch (main.kind) {
    case 'none':
      return '新的学习'
    case 'entry':
      return main.mainForm
    case 'sentence':
      return `${main.surface} · 原句`
    case 'article':
      return main.title
  }
}

function titleFromQuestion(text: string): string {
  const characters = Array.from(text.trim())
  if (characters.length <= TITLE_LIMIT) {
    return characters.join('')
  }
  return `${characters.slice(0, TITLE_LIMIT).join('')}…`
}

/* ---------- 上下文条目 ---------- */

function wordItem(database: AppDatabase, entryId: string): ThreadContextItem | null {
  const main = readEntryMain(database, entryId)
  if (main.kind !== 'entry') {
    return null
  }
  return {
    id: `word:${main.entryId}`,
    kind: 'word',
    label: main.mainForm,
    text: main.mainForm,
    source: `已收 ${main.sentenceCount} 条原句 · ${main.articleCount} 篇`
  }
}

type SentenceItemRow = {
  id: string
  surface: string
  article_id: string
  paragraph_id: string
  sentence_ordinal: number
  sentence_text: string
  article_title: string
  article_kind: string
  paragraph_ordinal: number
}

const SENTENCE_ITEM_SELECT = `es.id, es.surface, es.article_id, es.paragraph_id,
  es.sentence_ordinal, s.text AS sentence_text, a.title AS article_title,
  a.kind AS article_kind, p.ordinal AS paragraph_ordinal`

const SENTENCE_ITEM_JOINS = `JOIN article a ON a.id = es.article_id
  JOIN paragraph p ON p.article_id = es.article_id AND p.id = es.paragraph_id
  JOIN sentence s
    ON s.article_id = es.article_id
   AND s.paragraph_id = es.paragraph_id
   AND s.ordinal = es.sentence_ordinal`

function toSentenceItem(row: SentenceItemRow): ThreadContextItem {
  const letter = paragraphLetter(
    row.article_kind as 'long_match' | 'careful_reading',
    row.paragraph_id,
    row.paragraph_ordinal
  )
  const paragraph = letter ?? String(row.paragraph_ordinal + 1)
  return {
    id: `sentence:${row.id}`,
    kind: 'sentence',
    label: row.surface,
    text: row.sentence_text,
    source: `${row.article_title} · 段 ${paragraph} · 第 ${row.sentence_ordinal + 1} 句`
  }
}

function sentenceItemsOfEntry(database: AppDatabase, entryId: string): ThreadContextItem[] {
  const rows = database
    .prepare(
      `SELECT ${SENTENCE_ITEM_SELECT}
         FROM entry_sentence es
         ${SENTENCE_ITEM_JOINS}
        WHERE es.entry_id = ?
        ORDER BY es.collected_at DESC, es.rowid DESC`
    )
    .all(entryId) as SentenceItemRow[]
  return rows.map(toSentenceItem)
}

function sentenceItemsOfArticle(database: AppDatabase, articleId: string): ThreadContextItem[] {
  const rows = database
    .prepare(
      `SELECT ${SENTENCE_ITEM_SELECT}
         FROM entry_sentence es
         ${SENTENCE_ITEM_JOINS}
        WHERE es.article_id = ?
        ORDER BY es.collected_at DESC, es.rowid DESC`
    )
    .all(articleId) as SentenceItemRow[]
  return rows.map(toSentenceItem)
}

type ParagraphItemRow = {
  id: string
  ordinal: number
  text: string
  article_id: string
  article_title: string
  article_kind: string
}

function toParagraphItem(row: ParagraphItemRow): ThreadContextItem {
  const letter = paragraphLetter(
    row.article_kind as 'long_match' | 'careful_reading',
    row.id,
    row.ordinal
  )
  const paragraph = letter ?? String(row.ordinal + 1)
  return {
    id: `paragraph:${row.article_id}:${row.id}`,
    kind: 'paragraph',
    label: `段 ${paragraph}`,
    text: row.text,
    source: row.article_title
  }
}

function paragraphItemsOfEntry(database: AppDatabase, entryId: string): ThreadContextItem[] {
  const rows = database
    .prepare(
      `SELECT p.id, p.ordinal, p.text, es.article_id, a.title AS article_title,
              a.kind AS article_kind
         FROM entry_sentence es
         JOIN paragraph p ON p.article_id = es.article_id AND p.id = es.paragraph_id
         JOIN article a ON a.id = es.article_id
        WHERE es.entry_id = ?
        GROUP BY es.article_id, es.paragraph_id
        ORDER BY a.title, p.ordinal`
    )
    .all(entryId) as ParagraphItemRow[]
  return rows.map(toParagraphItem)
}

function paragraphItemsOfArticle(database: AppDatabase, articleId: string): ThreadContextItem[] {
  const rows = database
    .prepare(
      `SELECT p.id, p.ordinal, p.text, p.article_id, a.title AS article_title,
              a.kind AS article_kind
         FROM paragraph p
         JOIN article a ON a.id = p.article_id
        WHERE p.article_id = ?
        ORDER BY p.ordinal`
    )
    .all(articleId) as ParagraphItemRow[]
  return rows.map(toParagraphItem)
}

type NoteItemRow = { id: string; body: string; main_form: string }

function toNoteItem(row: NoteItemRow): ThreadContextItem {
  return {
    id: `note:${row.id}`,
    kind: 'note',
    label: row.main_form,
    text: row.body,
    source: `词条 ${row.main_form} 的学习内容`
  }
}

function noteItemsOfEntry(database: AppDatabase, entryId: string): ThreadContextItem[] {
  const rows = database
    .prepare(
      `SELECT ln.id, ln.body, we.main_form
         FROM learning_note ln
         JOIN word_entry we ON we.id = ln.entry_id
        WHERE ln.entry_id = ?
        ORDER BY ln.pinned DESC, ln.created_at DESC, ln.id DESC`
    )
    .all(entryId) as NoteItemRow[]
  return rows.map(toNoteItem)
}

function noteItemsOfArticle(database: AppDatabase, articleId: string): ThreadContextItem[] {
  const rows = database
    .prepare(
      `SELECT ln.id, ln.body, we.main_form, ln.pinned, ln.created_at
         FROM learning_note ln
         JOIN word_entry we ON we.id = ln.entry_id
         JOIN entry_sentence es ON es.entry_id = ln.entry_id
        WHERE es.article_id = ?
        GROUP BY ln.id
        ORDER BY ln.pinned DESC, ln.created_at DESC, ln.id DESC`
    )
    .all(articleId) as NoteItemRow[]
  return rows.map(toNoteItem)
}

function articleItem(database: AppDatabase, articleId: string): ThreadContextItem | null {
  const main = readArticleMain(database, articleId)
  if (main.kind !== 'article') {
    return null
  }
  return {
    id: `article:${main.articleId}`,
    kind: 'article',
    label: main.title,
    text: main.title,
    source: `${main.sessionLabel} · ${main.setLabel} · ${main.kindLabel} · ${main.wordCount} 词`
  }
}

/** 文章挂上时默认带上最近读到的那一段（没读过就从第一段起）。 */
function lastReadParagraphItem(
  database: AppDatabase,
  articleId: string
): ThreadContextItem | null {
  const article = database
    .prepare('SELECT last_paragraph_id FROM article WHERE id = ?')
    .get(articleId) as { last_paragraph_id: string | null } | undefined
  const preferred = article?.last_paragraph_id ?? null
  const row = preferred
    ? (database
        .prepare(
          `SELECT p.id, p.ordinal, p.text, p.article_id, a.title AS article_title,
                  a.kind AS article_kind
             FROM paragraph p JOIN article a ON a.id = p.article_id
            WHERE p.article_id = ? AND p.id = ?`
        )
        .get(articleId, preferred) as ParagraphItemRow | undefined)
    : undefined
  if (row) {
    return toParagraphItem(row)
  }
  const first = database
    .prepare(
      `SELECT p.id, p.ordinal, p.text, p.article_id, a.title AS article_title,
              a.kind AS article_kind
         FROM paragraph p JOIN article a ON a.id = p.article_id
        WHERE p.article_id = ?
        ORDER BY p.ordinal
        LIMIT 1`
    )
    .get(articleId) as ParagraphItemRow | undefined
  return first ? toParagraphItem(first) : null
}

/**
 * 挂上主对象时预填的上下文：词条带主词形与最近收的那句原句，
 * 原句带词与它自己，文章带篇名与最近读到的一段；空白线程什么都不带。
 */
function defaultContext(database: AppDatabase, main: ThreadMain): ThreadContextItem[] {
  const items: (ThreadContextItem | null)[] = []
  if (main.kind === 'entry') {
    items.push(wordItem(database, main.entryId))
    items.push(sentenceItemsOfEntry(database, main.entryId)[0] ?? null)
  } else if (main.kind === 'sentence') {
    items.push(wordItem(database, main.entryId))
    const sentence = database
      .prepare(`SELECT ${SENTENCE_ITEM_SELECT} FROM entry_sentence es ${SENTENCE_ITEM_JOINS} WHERE es.id = ?`)
      .get(main.entrySentenceId) as SentenceItemRow | undefined
    items.push(sentence ? toSentenceItem(sentence) : null)
  } else if (main.kind === 'article') {
    items.push(articleItem(database, main.articleId))
    items.push(lastReadParagraphItem(database, main.articleId))
  }
  return items.filter((item): item is ThreadContextItem => item !== null)
}

/* ---------- 线程读写 ---------- */

function readThreadRow(database: AppDatabase, threadId: string): ThreadRow | undefined {
  return database
    .prepare(
      `SELECT id, title, main_kind, main_id, context_json, leaf_entry_id, created_at, updated_at
         FROM thread WHERE id = ?`
    )
    .get(threadId) as ThreadRow | undefined
}

function readThreadEntries(database: AppDatabase, threadId: string): ThreadEntryRow[] {
  return database
    .prepare(
      `SELECT rowid AS row_id, id, parent_id, kind, payload, created_at
         FROM thread_entry
        WHERE thread_id = ?
        ORDER BY created_at, rowid`
    )
    .all(threadId) as ThreadEntryRow[]
}

function questionPayloadOf(row: ThreadEntryRow): QuestionPayload {
  const payload = parseJson(row.payload)
  return {
    text: typeof payload.text === 'string' ? payload.text : '',
    context: sanitizeContextItems(payload.context)
  }
}

function answerPayloadOf(row: ThreadEntryRow): AnswerPayload {
  const payload = parseJson(row.payload)
  const phase =
    typeof payload.phase === 'string' &&
    (ANSWER_PHASES as readonly string[]).includes(payload.phase)
      ? (payload.phase as AnswerPhase)
      : 'done'
  const error = payload.error
  const thinkingMs =
    typeof payload.thinkingMs === 'number' && Number.isFinite(payload.thinkingMs)
      ? Math.max(0, Math.round(payload.thinkingMs))
      : 0
  return {
    text: typeof payload.text === 'string' ? payload.text : '',
    thinking: typeof payload.thinking === 'string' ? payload.thinking : '',
    thinkingMs,
    phase,
    error:
      typeof error === 'object' && error !== null
        ? (error as ChatError)
        : null
  }
}

function versionsOf(
  rows: readonly ThreadEntryRow[],
  parentId: string | null,
  kind: ThreadEntryKind,
  selectedId: string
): ThreadVersion[] {
  return rows
    .filter((row) => row.parent_id === parentId && row.kind === kind)
    .map((row) => ({ id: row.id, selected: row.id === selectedId }))
}

function buildAnswer(
  rows: readonly ThreadEntryRow[],
  answerRows: readonly ThreadEntryRow[],
  questionId: string
): ThreadAnswer | null {
  const root = answerRows[0]
  if (!root) {
    return null
  }
  const continuations = answerRows.slice(1).filter((row) => row.kind === 'continuation')
  const segments = [root, ...continuations].map(answerPayloadOf)
  const last = segments[segments.length - 1] as AnswerPayload
  return {
    id: root.id,
    versions: versionsOf(rows, questionId, 'answer', root.id),
    text: segments.map((segment) => segment.text).join(''),
    thinking: segments
      .map((segment) => segment.thinking)
      .filter((text) => text !== '')
      .join('\n\n'),
    thinkingMs: segments.reduce((total, segment) => total + segment.thinkingMs, 0),
    phase: last.phase,
    error: last.error,
    createdAt: root.created_at,
    continuationIds: continuations.map((row) => row.id)
  }
}

function buildTurns(rows: readonly ThreadEntryRow[], path: readonly ThreadEntryRow[]): ThreadTurn[] {
  const turns: ThreadTurn[] = []
  let question: ThreadEntryRow | null = null
  let answers: ThreadEntryRow[] = []

  const flush = (): void => {
    if (!question) return
    const questionRow = question
    turns.push({
      question: {
        id: questionRow.id,
        text: questionPayloadOf(questionRow).text,
        createdAt: questionRow.created_at,
        versions: versionsOf(
          rows,
          questionRow.parent_id,
          'question',
          questionRow.id
        )
      },
      answer: buildAnswer(rows, answers, questionRow.id)
    })
  }

  for (const row of path) {
    if (row.kind === 'question') {
      flush()
      question = row
      answers = []
      continue
    }
    if (row.kind === 'answer' || row.kind === 'continuation') {
      answers.push(row)
    }
  }
  flush()
  return turns
}

/** 从叶子沿 parent 走到根，再翻过来；叶子的父指针缺失时当成空线程。 */
function pathToLeaf(rows: readonly ThreadEntryRow[], leafId: string | null): ThreadEntryRow[] {
  if (leafId === null) {
    return []
  }
  const byId = new Map(rows.map((row) => [row.id, row]))
  const path: ThreadEntryRow[] = []
  const seen = new Set<string>()
  let cursor = byId.get(leafId)
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id)
    path.push(cursor)
    cursor = cursor.parent_id === null ? undefined : byId.get(cursor.parent_id)
  }
  path.reverse()
  return path
}

export function readThreadView(database: AppDatabase, threadId: string): ChatThreadView | null {
  const thread = readThreadRow(database, threadId)
  if (!thread) {
    return null
  }
  const rows = readThreadEntries(database, threadId)
  const context = parseContextJson(thread.context_json)
  const main = describeMain(
    database,
    thread.main_kind as ThreadMainKind,
    thread.main_id
  )
  return {
    id: thread.id,
    title: thread.title,
    main,
    context,
    contextSummary: summarizeContext(context),
    turns: buildTurns(rows, pathToLeaf(rows, thread.leaf_entry_id)),
    createdAt: thread.created_at,
    updatedAt: thread.updated_at
  }
}

export function listThreads(database: AppDatabase): ThreadListResult {
  // 轮数只数当前这一支上的提问；改口留下的旧提问不算，免得一条线程显示成两轮。
  const rows = database
    .prepare(
      `WITH RECURSIVE branch(thread_id, id, parent_id, kind) AS (
         SELECT t.id, e.id, e.parent_id, e.kind
           FROM thread t
           JOIN thread_entry e ON e.id = t.leaf_entry_id
         UNION
         SELECT b.thread_id, e.id, e.parent_id, e.kind
           FROM branch b
           JOIN thread_entry e ON e.id = b.parent_id
       )
       SELECT t.id, t.title, t.main_kind, t.main_id, t.created_at, t.updated_at,
              (SELECT COUNT(*) FROM branch b
                WHERE b.thread_id = t.id AND b.kind = 'question') AS turn_count
         FROM thread t
        ORDER BY t.updated_at DESC, t.id DESC`
    )
    .all() as (Pick<ThreadRow, 'id' | 'title' | 'main_kind' | 'main_id' | 'created_at' | 'updated_at'> & {
    turn_count: number
  })[]

  const threads: ThreadListItem[] = rows.map((row) => {
    const main = describeMain(database, row.main_kind as ThreadMainKind, row.main_id)
    return {
      id: row.id,
      title: row.title,
      mainKind: main.kind,
      mainLabel: mainLabelOf(main),
      turnCount: row.turn_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  })
  return { threads }
}

function insertEntry(
  database: AppDatabase,
  input: {
    id?: string
    threadId: string
    parentId: string | null
    kind: ThreadEntryKind
    payload: QuestionPayload | AnswerPayload
    now: string
  }
): string {
  const id = input.id ?? randomUUID()
  database
    .prepare(
      `INSERT INTO thread_entry (id, thread_id, parent_id, kind, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.threadId, input.parentId, input.kind, JSON.stringify(input.payload), input.now)
  return id
}

function setLeaf(database: AppDatabase, threadId: string, leafId: string | null, now: string): void {
  database
    .prepare('UPDATE thread SET leaf_entry_id = ?, updated_at = ? WHERE id = ?')
    .run(leafId, now, threadId)
}

export function createThread(
  database: AppDatabase,
  request: CreateThreadRequest,
  options: { now?: string } = {}
): CreateThreadResult {
  const now = nowOf(options)
  const main = describeMain(database, request.main.kind, mainIdOf(request.main))
  if (request.main.kind !== 'none' && main.kind === 'none') {
    return { status: 'rejected', reason: 'missing-main' }
  }

  const context = defaultContext(database, main)
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO thread (id, title, main_kind, main_id, context_json, leaf_entry_id,
                           created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(id, titleOf(main), main.kind, mainIdOf(request.main), JSON.stringify(context), now, now)

  const thread = readThreadView(database, id)
  if (!thread) {
    return { status: 'rejected', reason: 'missing-main' }
  }
  return { status: 'created', thread }
}

export function updateThreadContext(
  database: AppDatabase,
  request: UpdateThreadContextRequest,
  options: { now?: string } = {}
): UpdateThreadContextResult {
  if (!readThreadRow(database, request.threadId)) {
    return { status: 'missing' }
  }
  const items = sanitizeContextItems(request.items)
  database
    .prepare('UPDATE thread SET context_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(items), nowOf(options), request.threadId)
  const thread = readThreadView(database, request.threadId)
  return thread ? { status: 'saved', thread } : { status: 'missing' }
}

function insertQuestion(
  database: AppDatabase,
  input: {
    thread: ThreadRow
    parentId: string | null
    text: string
    context: ThreadContextItem[]
    now: string
  }
): QuestionResult {
  const context = input.context
  const firstQuestion =
    database
      .prepare(
        `SELECT 1 FROM thread_entry
          WHERE thread_id = ? AND kind = 'question' LIMIT 1`
      )
      .get(input.thread.id) === undefined
  const id = insertEntry(database, {
    threadId: input.thread.id,
    parentId: input.parentId,
    kind: 'question',
    payload: { text: input.text, context },
    now: input.now
  })
  const title =
    input.thread.main_kind === 'none' && firstQuestion
      ? titleFromQuestion(input.text)
      : input.thread.title
  database
    .prepare(
      `UPDATE thread
          SET leaf_entry_id = ?, context_json = ?, title = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(id, JSON.stringify(context), title, input.now, input.thread.id)
  const thread = readThreadView(database, input.thread.id)
  return thread ? { status: 'asked', questionId: id, thread } : { status: 'missing' }
}

export function askQuestion(
  database: AppDatabase,
  request: AskThreadRequest,
  options: { now?: string } = {}
): QuestionResult {
  const thread = readThreadRow(database, request.threadId)
  if (!thread) {
    return { status: 'missing' }
  }
  const text = request.text.trim()
  if (text === '') {
    return { status: 'rejected', reason: 'empty' }
  }
  const context =
    request.context === undefined
      ? parseContextJson(thread.context_json)
      : sanitizeContextItems(request.context)

  return insertQuestion(database, {
    thread,
    parentId: validParent(database, thread.id, thread.leaf_entry_id),
    text,
    context,
    now: nowOf(options)
  })
}

function validParent(
  database: AppDatabase,
  threadId: string,
  entryId: string | null
): string | null {
  if (entryId === null) {
    return null
  }
  const row = database
    .prepare('SELECT id FROM thread_entry WHERE id = ? AND thread_id = ?')
    .get(entryId, threadId) as { id: string } | undefined
  return row ? row.id : null
}

function readEntryRow(
  database: AppDatabase,
  threadId: string,
  entryId: string
): ThreadEntryRow | undefined {
  return database
    .prepare(
      `SELECT rowid AS row_id, id, parent_id, kind, payload, created_at
         FROM thread_entry WHERE id = ? AND thread_id = ?`
    )
    .get(entryId, threadId) as ThreadEntryRow | undefined
}

function answerPayloadOfRequest(
  text: string,
  thinking: string,
  thinkingMs: number | undefined,
  phase: AnswerPhase,
  error: ChatError | null | undefined
): AnswerPayload {
  return {
    text,
    thinking,
    thinkingMs: thinkingMs === undefined ? 0 : Math.max(0, Math.round(thinkingMs)),
    phase,
    error: error ?? null
  }
}

export function saveAnswer(
  database: AppDatabase,
  request: SaveAnswerRequest,
  options: { now?: string } = {}
): SaveAnswerResult {
  const thread = readThreadRow(database, request.threadId)
  if (!thread) {
    return { status: 'missing' }
  }
  const question = readEntryRow(database, request.threadId, request.questionId)
  if (!question || question.kind !== 'question') {
    return { status: 'rejected', reason: 'question' }
  }

  const now = nowOf(options)
  const id = insertEntry(database, {
    threadId: request.threadId,
    parentId: question.id,
    kind: 'answer',
    payload: answerPayloadOfRequest(
      request.text,
      request.thinking,
      request.thinkingMs,
      request.phase,
      request.error
    ),
    now
  })
  setLeaf(database, request.threadId, id, now)
  const view = readThreadView(database, request.threadId)
  return view ? { status: 'saved', thread: view } : { status: 'missing' }
}

/**
 * 从一条条目往下走到这一支的最后：默认取最新子条目（切分支用），
 * 只取 continuation 时用于找继续生成的尾巴。环状数据停在原地。
 */
function descendToLatestChild(
  database: AppDatabase,
  threadId: string,
  startId: string,
  kind?: ThreadEntryKind
): string {
  const latest =
    kind === undefined
      ? database.prepare(
          `SELECT id FROM thread_entry
            WHERE thread_id = ? AND parent_id = ?
            ORDER BY created_at DESC, rowid DESC LIMIT 1`
        )
      : database.prepare(
          `SELECT id FROM thread_entry
            WHERE thread_id = ? AND parent_id = ? AND kind = ?
            ORDER BY created_at DESC, rowid DESC LIMIT 1`
        )
  let cursor = startId
  const seen = new Set<string>()
  for (;;) {
    if (seen.has(cursor)) return cursor
    seen.add(cursor)
    const child = (
      kind === undefined ? latest.get(threadId, cursor) : latest.get(threadId, cursor, kind)
    ) as { id: string } | undefined
    if (!child) {
      return cursor
    }
    cursor = child.id
  }
}

/** 继续生成接在当前回答这一路的最后一段后面，不产生新的版本。 */
export function saveContinuation(
  database: AppDatabase,
  request: SaveContinuationRequest,
  options: { now?: string } = {}
): SaveAnswerResult {
  const thread = readThreadRow(database, request.threadId)
  if (!thread) {
    return { status: 'missing' }
  }
  const answer = readEntryRow(database, request.threadId, request.answerId)
  if (!answer || answer.kind !== 'answer') {
    return { status: 'rejected', reason: 'answer' }
  }

  const now = nowOf(options)
  const parentId = descendToLatestChild(database, request.threadId, answer.id, 'continuation')
  const id = insertEntry(database, {
    threadId: request.threadId,
    parentId,
    kind: 'continuation',
    payload: answerPayloadOfRequest(
      request.text,
      request.thinking,
      request.thinkingMs,
      request.phase,
      request.error
    ),
    now
  })
  setLeaf(database, request.threadId, id, now)
  const view = readThreadView(database, request.threadId)
  return view ? { status: 'saved', thread: view } : { status: 'missing' }
}

export function editQuestion(
  database: AppDatabase,
  request: EditQuestionRequest,
  options: { now?: string } = {}
): QuestionResult {
  const thread = readThreadRow(database, request.threadId)
  if (!thread) {
    return { status: 'missing' }
  }
  const original = readEntryRow(database, request.threadId, request.questionId)
  if (!original || original.kind !== 'question') {
    return { status: 'missing' }
  }
  const text = request.text.trim()
  if (text === '') {
    return { status: 'rejected', reason: 'empty' }
  }
  const context =
    request.context === undefined
      ? parseContextJson(thread.context_json)
      : sanitizeContextItems(request.context)

  // 新提问挂在原来那条的父条目下：同一位置多出一个版本，原回答整支仍在库里。
  return insertQuestion(database, {
    thread,
    parentId: original.parent_id,
    text,
    context,
    now: nowOf(options)
  })
}

export function switchQuestion(
  database: AppDatabase,
  request: SwitchQuestionRequest,
  options: { now?: string } = {}
): SwitchThreadResult {
  const thread = readThreadRow(database, request.threadId)
  if (!thread) {
    return { status: 'missing' }
  }
  const question = readEntryRow(database, request.threadId, request.questionId)
  if (!question || question.kind !== 'question') {
    return { status: 'rejected', reason: 'question' }
  }
  setLeaf(
    database,
    request.threadId,
    descendToLatestChild(database, request.threadId, question.id),
    nowOf(options)
  )
  const view = readThreadView(database, request.threadId)
  return view ? { status: 'switched', thread: view } : { status: 'missing' }
}

export function switchAnswer(
  database: AppDatabase,
  request: SwitchAnswerRequest,
  options: { now?: string } = {}
): SwitchThreadResult {
  const thread = readThreadRow(database, request.threadId)
  if (!thread) {
    return { status: 'missing' }
  }
  const answer = readEntryRow(database, request.threadId, request.answerId)
  if (!answer || answer.kind !== 'answer' || answer.parent_id !== request.questionId) {
    return { status: 'rejected', reason: 'answer' }
  }
  setLeaf(
    database,
    request.threadId,
    descendToLatestChild(database, request.threadId, answer.id),
    nowOf(options)
  )
  const view = readThreadView(database, request.threadId)
  return view ? { status: 'switched', thread: view } : { status: 'missing' }
}

/**
 * 这次还能往上下文里加什么：词条与原句线程给这个词的原句、所在段落与学习内容，
 * 文章线程给这篇的原句、全部段落与这些词的学习内容。已经带上的不再列出。
 */
export function readContextCandidates(
  database: AppDatabase,
  threadId: string
): ThreadContextCandidates {
  const thread = readThreadRow(database, threadId)
  if (!thread) {
    return { items: [] }
  }
  const main = describeMain(database, thread.main_kind as ThreadMainKind, thread.main_id)
  const included = new Set(
    parseContextJson(thread.context_json).map((item) => item.id)
  )

  const candidates: ThreadContextItem[] = []
  const seen = new Set<string>()
  const push = (item: ThreadContextItem | null): void => {
    if (!item || included.has(item.id) || seen.has(item.id)) return
    seen.add(item.id)
    candidates.push(item)
  }

  if (main.kind === 'entry' || main.kind === 'sentence') {
    push(wordItem(database, main.entryId))
    for (const item of sentenceItemsOfEntry(database, main.entryId)) push(item)
    for (const item of paragraphItemsOfEntry(database, main.entryId)) push(item)
    for (const item of noteItemsOfEntry(database, main.entryId)) push(item)
  } else if (main.kind === 'article') {
    push(articleItem(database, main.articleId))
    for (const item of sentenceItemsOfArticle(database, main.articleId)) push(item)
    for (const item of paragraphItemsOfArticle(database, main.articleId)) push(item)
    for (const item of noteItemsOfArticle(database, main.articleId)) push(item)
  }

  return { items: candidates }
}
