import { useSyncExternalStore } from 'react'
import type { ChatStreamUpdate } from '../../../shared/chat'
import type {
  ChatThreadView,
  CreateThreadRequest,
  ThreadContextItem,
  ThreadListItem
} from '../../../shared/threads'
import {
  askThread,
  createThread,
  editThreadQuestion,
  loadThread,
  loadThreads,
  saveThreadAnswer,
  saveThreadContinuation,
  switchThreadAnswer,
  switchThreadQuestion,
  updateThreadContext
} from '../api'
import { messageOf } from '../errors'
import { navigate, replaceRoute } from '../navigate'
import {
  chatSessionReducer,
  initialChatSession,
  type ChatSessionAction,
  type ChatSessionState,
  type LiveGeneration
} from './session'
import { buildMessages, lastTurn, summarizeContext, threadSystemPrompt, type GenerationMode } from './turns'

/**
 * 对话页的状态：线程列表、当前线程、正在生成的一条与改口草稿。
 * 生成事件跟着整个应用走，切到别的页面再回来也不会丢；回答要到结束时才落库。
 */

export type ChatStoreState = {
  threads: readonly ThreadListItem[]
  current: ChatThreadView | null
  currentId: string | null
  session: ChatSessionState
  /** 正在改上一条提问；null 表示没在改。 */
  editing: { questionId: string; text: string } | null
  /** 打开线程与提交问题之间的空隙，避免连按两次发出两条。 */
  busy: boolean
  loading: boolean
  error: string | null
}

const initialState: ChatStoreState = {
  threads: [],
  current: null,
  currentId: null,
  session: initialChatSession,
  editing: null,
  busy: false,
  loading: false,
  error: null
}

let state: ChatStoreState = initialState
const listeners = new Set<() => void>()
let connected = false
let persisting: string | null = null
/** 上下文改动连点时只认最后一次返回；界面先按本地算的摘要往前走。 */
let contextSequence = 0

export function getChatStore(): ChatStoreState {
  return state
}

export function subscribeChat(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of [...listeners]) {
    listener()
  }
}

function set(patch: Partial<ChatStoreState>): void {
  state = { ...state, ...patch }
  emit()
}

function dispatchSession(action: ChatSessionAction): void {
  const session = chatSessionReducer(state.session, action)
  if (session === state.session) {
    return
  }
  state = { ...state, session }
  emit()
}

export function useChatStore(): ChatStoreState {
  return useSyncExternalStore(subscribeChat, getChatStore, getChatStore)
}

/** 还有一条没落完库的回答时，不发新请求，也不切版本。 */
function generationPending(): boolean {
  return state.session.generation !== null
}

/**
 * 事件订阅跟随整个应用生命周期：切到别的页面再回来，正在生成的回答也不会丢。
 */
export function ensureChatEvents(): void {
  if (connected) {
    return
  }
  connected = true
  window.api.subscribe('chat:event', (update: ChatStreamUpdate) => {
    dispatchSession({
      type: 'stream',
      streamId: update.streamId,
      event: update.event,
      now: Date.now()
    })
    void maybePersistGeneration()
  })
}

/* ---------- 打开线程与列表 ---------- */

export function openChatThread(threadId: string | null): void {
  if (threadId === state.currentId && state.current !== null) {
    void refreshThreads()
    return
  }

  state = {
    ...state,
    currentId: threadId,
    current: null,
    editing: null,
    error: null,
    loading: threadId !== null,
    session: { ...state.session, thinkingOpen: null }
  }
  contextSequence += 1
  emit()
  void refreshThreads()

  if (threadId === null) {
    return
  }
  void loadThread(threadId).then(
    (view) => {
      if (state.currentId !== threadId) return
      if (view === null) {
        set({ loading: false, error: '这条线程已经不在了。' })
        return
      }
      set({ current: view, loading: false })
    },
    (error: unknown) => {
      if (state.currentId !== threadId) return
      set({ loading: false, error: messageOf(error) })
    }
  )
}

export function refreshThreads(): Promise<void> {
  return loadThreads().then(
    (listing) => set({ threads: listing.threads }),
    (error: unknown) => set({ error: messageOf(error) })
  )
}

/** 从词条、原句或文章页开一条挂好对象的线程，并切过去。 */
export async function openThreadForMain(
  main: CreateThreadRequest['main']
): Promise<string | null> {
  try {
    const result = await createThread({ main })
    if (result.status !== 'created') {
      set({ error: '这个对象已经不在了，没能开线程。' })
      return null
    }
    state = {
      ...state,
      currentId: result.thread.id,
      current: result.thread,
      loading: false,
      error: null,
      session: { ...state.session, thinkingOpen: null }
    }
    emit()
    navigate('chat', { threadId: result.thread.id })
    return result.thread.id
  } catch (error) {
    set({ error: messageOf(error) })
    return null
  }
}

/* ---------- 发送与生成 ---------- */

export function sendChatMessage(raw: string): boolean {
  const text = raw.trim()
  if (
    text === '' ||
    generationPending() ||
    state.busy ||
    state.editing !== null
  ) {
    return false
  }
  set({ busy: true, error: null })
  void submitQuestion(text)
  return true
}

async function submitQuestion(text: string): Promise<void> {
  try {
    let view = state.current
    if (view === null) {
      const created = await createThread({ main: { kind: 'none' } })
      if (created.status !== 'created') {
        set({ busy: false, error: '没能新建线程。' })
        return
      }
      view = created.thread
      set({ current: view, currentId: view.id })
      replaceRoute('chat', { threadId: view.id })
    }

    const asked = await askThread({ threadId: view.id, text, context: view.context })
    if (asked.status !== 'asked') {
      set({
        busy: false,
        error: asked.status === 'rejected' ? '这条提问是空的。' : '这条线程已经不在了。'
      })
      return
    }
    set({ current: asked.thread, busy: false })
    void refreshThreads()
    startGeneration(asked.thread, { kind: 'answer' }, {
      mode: 'answer',
      questionId: asked.questionId,
      answerId: null,
      baseText: '',
      baseThinking: '',
      baseThinkingMs: 0
    })
  } catch (error) {
    set({ busy: false, error: messageOf(error) })
  }
}

export function stopChat(): void {
  const generation = state.session.generation
  if (!generation || generation.status !== 'live') {
    return
  }
  dispatchSession({ type: 'stop', now: Date.now() })
  void window.api.invoke('chat:stop', { streamId: generation.streamId }).catch(() => undefined)
  void maybePersistGeneration()
}

/** 重新生成上一条回答：同一提问下多出一个版本，旧版仍在。 */
export function regenerateLastAnswer(): void {
  const view = state.current
  if (view === null || generationPending() || state.busy) {
    return
  }
  const turn = lastTurn(view)
  if (!turn) {
    return
  }
  startGeneration(view, { kind: 'regenerate', questionId: turn.question.id }, {
    mode: 'answer',
    questionId: turn.question.id,
    answerId: null,
    baseText: '',
    baseThinking: '',
    baseThinkingMs: 0
  })
}

/** 继续生成：新的正文接在当前回答这一路后面，不产生新版本。 */
export function continueLastAnswer(): void {
  const view = state.current
  if (view === null || generationPending() || state.busy) {
    return
  }
  const answer = lastTurn(view)?.answer
  if (!answer) {
    return
  }
  startGeneration(view, { kind: 'continue' }, {
    mode: 'continue',
    questionId: null,
    answerId: answer.id,
    baseText: answer.text,
    baseThinking: answer.thinking,
    baseThinkingMs: answer.thinkingMs
  })
}

function startGeneration(
  view: ChatThreadView,
  mode: GenerationMode,
  target: {
    mode: 'answer' | 'continue'
    questionId: string | null
    answerId: string | null
    baseText: string
    baseThinking: string
    baseThinkingMs: number
  }
): void {
  const streamId = newId()
  dispatchSession({
    type: 'begin',
    threadId: view.id,
    streamId,
    mode: target.mode,
    questionId: target.questionId,
    answerId: target.answerId,
    baseText: target.baseText,
    baseThinking: target.baseThinking,
    baseThinkingMs: target.baseThinkingMs,
    now: Date.now()
  })

  const systemPrompt = threadSystemPrompt(view.context)
  const payload = {
    streamId,
    messages: buildMessages(view, mode),
    ...(systemPrompt === null ? {} : { systemPrompt })
  }
  window.api.invoke('chat:start', payload).then(
    (result) => {
      if (!result.accepted) {
        failStream(streamId)
      }
    },
    () => failStream(streamId)
  )
}

function failStream(streamId: string): void {
  dispatchSession({
    type: 'stream',
    streamId,
    event: { type: 'error', error: { code: 'unknown' } },
    now: Date.now()
  })
  void maybePersistGeneration()
}

/* ---------- 落库 ---------- */

async function maybePersistGeneration(): Promise<void> {
  const generation = state.session.generation
  if (!generation || generation.status !== 'finishing') {
    return
  }
  if (persisting === generation.streamId) {
    return
  }
  persisting = generation.streamId
  try {
    await persistGeneration(generation)
  } finally {
    if (persisting === generation.streamId) {
      persisting = null
    }
  }
}

async function persistGeneration(generation: LiveGeneration): Promise<void> {
  const phase = generation.terminal ?? (generation.error ? 'error' : 'done')
  // 落库的是这一段新写出来的内容；继续生成时底稿已经在库里，不再重复带上。
  const text = generation.text
  const thinking = generation.thinking
  const thinkingMs =
    generation.thinkingStartedAt !== null && generation.thinkingEndedAt !== null
      ? Math.max(0, generation.thinkingEndedAt - generation.thinkingStartedAt)
      : 0

  try {
    const result =
      generation.mode === 'continue'
        ? await saveThreadContinuation({
            threadId: generation.threadId,
            answerId: generation.answerId ?? '',
            text,
            thinking,
            thinkingMs,
            phase,
            error: generation.error
          })
        : await saveThreadAnswer({
            threadId: generation.threadId,
            questionId: generation.questionId ?? '',
            text,
            thinking,
            thinkingMs,
            phase,
            error: generation.error
          })

    if (result.status === 'saved') {
      if (state.currentId === generation.threadId) {
        set({ current: result.thread })
      }
      void refreshThreads()
    } else {
      set({ error: '这条回答没能保存。' })
    }
  } catch (error) {
    set({ error: messageOf(error) })
  } finally {
    dispatchSession({ type: 'clear', streamId: generation.streamId })
  }
}

/* ---------- 版本与改口 ---------- */

/** 切到另一版回答；旧版里接下去的问与答留在库里，切回来还在。 */
export function switchAnswerVersion(questionId: string, answerId: string): void {
  const view = state.current
  if (view === null || generationPending() || state.busy) {
    return
  }
  void switchThreadAnswer({
    threadId: view.id,
    questionId,
    answerId
  }).then(
    (result) => {
      if (result.status === 'switched' && state.currentId === view.id) {
        set({ current: result.thread })
      }
    },
    (error: unknown) => set({ error: messageOf(error) })
  )
}

export function switchQuestionVersion(questionId: string): void {
  const view = state.current
  if (view === null || generationPending() || state.busy) {
    return
  }
  void switchThreadQuestion({ threadId: view.id, questionId }).then(
    (result) => {
      if (result.status === 'switched' && state.currentId === view.id) {
        set({ current: result.thread })
      }
    },
    (error: unknown) => set({ error: messageOf(error) })
  )
}

export function beginEditLastQuestion(): void {
  const view = state.current
  const turn = view === null ? null : lastTurn(view)
  if (turn === null || generationPending() || state.busy) {
    return
  }
  set({ editing: { questionId: turn.question.id, text: turn.question.text } })
}

export function cancelEdit(): void {
  if (state.editing === null) {
    return
  }
  set({ editing: null })
}

export function submitEdit(raw: string): boolean {
  const view = state.current
  const editing = state.editing
  const text = raw.trim()
  if (
    view === null ||
    editing === null ||
    text === '' ||
    generationPending() ||
    state.busy
  ) {
    return false
  }
  set({ busy: true, error: null })
  void (async () => {
    try {
      const result = await editThreadQuestion({
        threadId: view.id,
        questionId: editing.questionId,
        text,
        context: view.context
      })
      if (result.status !== 'asked') {
        set({
          busy: false,
          error: result.status === 'rejected' ? '这条提问是空的。' : '这条线程已经不在了。'
        })
        return
      }
      set({ current: result.thread, editing: null, busy: false })
      void refreshThreads()
      startGeneration(result.thread, { kind: 'answer' }, {
        mode: 'answer',
        questionId: result.questionId,
        answerId: null,
        baseText: '',
        baseThinking: '',
        baseThinkingMs: 0
      })
    } catch (error) {
      set({ busy: false, error: messageOf(error) })
    }
  })()
  return true
}

/* ---------- 上下文 ---------- */

export function addContextItem(item: ThreadContextItem): void {
  const view = state.current
  if (view === null || view.context.some((existing) => existing.id === item.id)) {
    return
  }
  changeContext(view, [...view.context, item])
}

export function removeContextItem(id: string): void {
  const view = state.current
  if (view === null) {
    return
  }
  changeContext(
    view,
    view.context.filter((item) => item.id !== id)
  )
}

function changeContext(view: ChatThreadView, items: ThreadContextItem[]): void {
  const sequence = ++contextSequence
  // 先按本地算的摘要显示，连点两下增删也不会互相盖掉；服务端返回后再对齐。
  set({ current: { ...view, context: items, contextSummary: summarizeContext(items) } })
  void updateThreadContext({ threadId: view.id, items }).then(
    (result) => {
      if (sequence !== contextSequence || state.currentId !== view.id) {
        return
      }
      if (result.status === 'saved') {
        set({ current: result.thread })
      }
    },
    (error: unknown) => {
      if (sequence === contextSequence) {
        set({ error: messageOf(error) })
      }
    }
  )
}

export function setThinkingOpen(open: boolean): void {
  dispatchSession({ type: 'toggle-thinking', open })
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
