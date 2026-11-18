import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type {
  ThreadAnswer,
  ThreadContextItem,
  ThreadTurn,
  ThreadVersion
} from '../../../shared/threads'
import { loadThreadContextCandidates } from '../api'
import { describeChatError } from '../chat/errors'
import { ContextPanel } from '../chat/context-panel'
import {
  liveAnswerText,
  liveAnswerThinking,
  liveThinkingSeconds,
  thinkingExpanded,
  thinkingExpandedFor,
  type ChatSessionState,
  type LiveGeneration
} from '../chat/session'
import {
  addContextItem,
  beginEditLastQuestion,
  cancelEdit,
  continueLastAnswer,
  ensureChatEvents,
  openChatThread,
  regenerateLastAnswer,
  removeContextItem,
  sendChatMessage,
  setThinkingOpen,
  stopChat,
  submitEdit,
  switchAnswerVersion,
  switchQuestionVersion,
  useChatStore
} from '../chat/store'
import {
  BLANK_THREAD_SUBTITLE,
  selectedVersionIndex,
  threadHeaderText
} from '../chat/turns'
import { navigate } from '../navigate'

/**
 * 对话页：左边线程列表，中间这一路的对话，底部是带上下文的输入框。
 * 回答可以重新生成出新版本再切回旧的；改上一条提问会走新分支，原回答留在库里；
 * 继续生成接在同一版回答后面。
 */
export function ChatPage({ threadId }: { threadId: string | null }) {
  const store = useChatStore()
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [candidates, setCandidates] = useState<ThreadContextItem[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const generation = store.session.generation
  const liveHere = generation !== null && generation.threadId === store.currentId
  const generatingHere = liveHere && generation.status === 'live'
  const generatingElsewhere =
    generation !== null && generation.status === 'live' && generation.threadId !== store.currentId

  useEffect(() => {
    ensureChatEvents()
  }, [])

  useEffect(() => {
    openChatThread(threadId)
    setDraft('')
    setPickerOpen(false)
    setRailOpen(false)
    setCandidates(null)
  }, [threadId])

  useEffect(() => {
    if (!generatingHere) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [generatingHere])

  const liveText = liveHere && generation ? liveAnswerText(generation) : ''
  const liveThinking = liveHere && generation ? liveAnswerThinking(generation) : ''

  useEffect(() => {
    const node = scrollRef.current
    if (!node) {
      return
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    if (distance < 160) {
      node.scrollTop = node.scrollHeight
    }
  }, [store.current?.turns, liveText, liveThinking, store.loading])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) {
        return
      }
      if (store.editing !== null) {
        event.preventDefault()
        cancelEdit()
        setDraft('')
        return
      }
      if (pickerOpen) {
        event.preventDefault()
        setPickerOpen(false)
        return
      }
      if (railOpen) {
        event.preventDefault()
        setRailOpen(false)
        return
      }
      if (generatingHere) {
        event.preventDefault()
        stopChat()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [generatingHere, pickerOpen, railOpen, store.editing])

  const submit = (): void => {
    if (store.editing !== null) {
      if (submitEdit(draft)) {
        setDraft('')
        inputRef.current?.focus()
      }
      return
    }
    if (sendChatMessage(draft)) {
      setDraft('')
      inputRef.current?.focus()
    }
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    if (generatingHere) {
      // 生成中发送键是停止键，Enter 只换行，输入区不锁。
      return
    }
    if (generatingElsewhere) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    submit()
  }

  const togglePicker = (): void => {
    if (pickerOpen) {
      setPickerOpen(false)
      return
    }
    if (store.current === null) {
      return
    }
    setPickerOpen(true)
    setCandidates(null)
    loadThreadContextCandidates(store.current.id).then(
      (result) => setCandidates(result.items),
      () => setCandidates([])
    )
  }

  const addItem = (item: ThreadContextItem): void => {
    addContextItem(item)
    setCandidates((current) => current?.filter((candidate) => candidate.id !== item.id) ?? current)
  }

  const removeItem = (id: string): void => {
    const removed = store.current?.context.find((item) => item.id === id)
    removeContextItem(id)
    if (removed === undefined) {
      return
    }
    setCandidates((current) => {
      if (current === null || current.some((item) => item.id === removed.id)) {
        return current
      }
      return [...current, removed]
    })
  }

  const editing = store.editing
  const current = store.current
  const title = current === null ? '新的学习' : current.title
  const subtitle = current === null ? BLANK_THREAD_SUBTITLE : threadHeaderText(current)
  const canSend = draft.trim() !== '' && !store.busy && generation === null

  return (
    <div className="chat-page">
      <aside
        className="chat-rail"
        aria-label="线程列表"
        data-open={railOpen ? 'true' : 'false'}
      >
        <div className="chat-rail-head">
          <button
            type="button"
            className="button button-primary chat-new"
            onClick={() => {
              setRailOpen(false)
              navigate('chat')
            }}
          >
            新的学习
          </button>
        </div>
        {store.threads.length === 0 ? (
          <p className="empty-line chat-rail-empty">还没有线程</p>
        ) : (
          <ul className="thread-list">
            {store.threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className="thread-row"
                  aria-current={thread.id === store.currentId ? 'page' : undefined}
                  onClick={() => {
                    setRailOpen(false)
                    navigate('chat', { threadId: thread.id })
                  }}
                >
                  <span className="thread-row-title">{thread.title}</span>
                  <span className="thread-row-meta">
                    {thread.mainLabel} · {thread.turnCount} 轮
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header-inner">
            <button
              type="button"
              className="chat-rail-toggle chat-action"
              aria-label="线程列表"
              aria-expanded={railOpen}
              onClick={() => setRailOpen((open) => !open)}
            >
              线程
            </button>
            <h1 className="chat-title">{title}</h1>
            <p className="chat-subtitle">{subtitle}</p>
          </div>
        </header>

        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-column">
            {store.error === null ? null : (
              <p className="chat-error" role="alert">
                {store.error}
              </p>
            )}

            {store.loading && current === null ? (
              <p className="empty-line">正在打开这条线程…</p>
            ) : current === null || current.turns.length === 0 ? (
              <div className="chat-empty">
                <h2 className="chat-empty-title">
                  {current === null || current.main.kind === 'none'
                    ? '今天学点什么？'
                    : '从这条线索问起'}
                </h2>
                <p className="chat-empty-lede">
                  {current === null || current.main.kind === 'none'
                    ? '这是一条还没有挂对象的线程：聊完把满意的段落钉住，再决定它归到哪个词条。'
                    : '上下文已经放在输入框上方，直接问就行；问完可以把满意的段落钉到这条线索上。'}
                </p>
                {current === null || current.main.kind === 'none' ? (
                  <div className="chat-starters">
                    <button
                      type="button"
                      className="button"
                      onClick={() => navigate('entries')}
                    >
                      从一个词开始
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() => navigate('library')}
                    >
                      从一篇文章开始
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              current.turns.map((turn, index) => (
                <ChatTurnView
                  key={turn.question.id}
                  turn={turn}
                  isLast={index === current.turns.length - 1}
                  session={store.session}
                  live={
                    liveHere && generation !== null && index === current.turns.length - 1
                      ? generation
                      : null
                  }
                  now={now}
                  disabled={generatingHere || generatingElsewhere || store.busy || editing !== null}
                  onSwitchQuestion={switchQuestionVersion}
                  onSwitchAnswer={switchAnswerVersion}
                  onEdit={() => {
                    beginEditLastQuestion()
                    setDraft(turn.question.text)
                    inputRef.current?.focus()
                  }}
                  onRegenerate={regenerateLastAnswer}
                  onContinue={continueLastAnswer}
                  onRetry={regenerateLastAnswer}
                  onToggleThinking={setThinkingOpen}
                />
              ))
            )}
          </div>
        </div>

        <div className="chat-composer">
          <div className="composer-inner">
            {current === null ? null : (
              <ContextPanel
                items={current.context}
                summary={current.contextSummary}
                candidates={candidates}
                pickerOpen={pickerOpen}
                onTogglePicker={togglePicker}
                onAdd={addItem}
                onRemove={removeItem}
              />
            )}

            {editing === null ? null : (
              <div className="edit-banner" role="status">
                <span>正在编辑这一条提问 · 发送后会新建分支，原来的回答保留</span>
                <button
                  type="button"
                  className="chat-action"
                  onClick={() => {
                    cancelEdit()
                    setDraft('')
                  }}
                >
                  取消
                </button>
              </div>
            )}

            <div className="composer-box">
              <textarea
                ref={inputRef}
                className="composer-input"
                rows={2}
                aria-label="输入问题"
                placeholder={
                  editing === null
                    ? '问点什么… 例如：这两个例句里哪个更常用于书面语？'
                    : '改一下这条提问，发送后会走新的分支'
                }
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onComposerKeyDown}
              />
              <button
                type="button"
                className={generatingHere ? 'send-button send-button-stop' : 'send-button'}
                aria-label={generatingHere ? '停止生成' : '发送'}
                disabled={generatingHere ? false : !canSend}
                onClick={generatingHere ? stopChat : submit}
              >
                {generatingHere ? (
                  <span className="stop-square" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true">↑</span>
                )}
              </button>
            </div>
            <p className="composer-hint">
              {generatingElsewhere
                ? '另一条线程正在生成，等它结束再发。'
                : 'Enter 发送 · Shift+Enter 换行 · Esc 停止'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 一轮对话 ---------- */

function ChatTurnView({
  turn,
  isLast,
  session,
  live,
  now,
  disabled,
  onSwitchQuestion,
  onSwitchAnswer,
  onEdit,
  onRegenerate,
  onContinue,
  onRetry,
  onToggleThinking
}: {
  turn: ThreadTurn
  isLast: boolean
  session: ChatSessionState
  live: LiveGeneration | null
  now: number
  disabled: boolean
  onSwitchQuestion: (questionId: string) => void
  onSwitchAnswer: (questionId: string, answerId: string) => void
  onEdit: () => void
  onRegenerate: () => void
  onContinue: () => void
  onRetry: () => void
  onToggleThinking: (open: boolean) => void
}) {
  return (
    <div className="chat-turn">
      <UserMessage
        text={turn.question.text}
        versions={turn.question.versions}
        showActions={isLast && live === null && !disabled}
        onSwitch={onSwitchQuestion}
        onEdit={onEdit}
      />

      {live !== null ? (
        <LiveAnswer
          generation={live}
          session={session}
          now={now}
          onToggleThinking={onToggleThinking}
        />
      ) : turn.answer !== null ? (
        <AnswerCard
          answer={turn.answer}
          isLast={isLast}
          session={session}
          disabled={disabled}
          onSwitchVersion={(answerId) => onSwitchAnswer(turn.question.id, answerId)}
          onRegenerate={onRegenerate}
          onContinue={onContinue}
          onRetry={onRetry}
          onToggleThinking={onToggleThinking}
        />
      ) : (
        <div className="chat-unanswered">
          <span>这条还没有回答。</span>
          {isLast && !disabled ? (
            <button type="button" className="chat-action" onClick={onRegenerate}>
              生成回答
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function UserMessage({
  text,
  versions,
  showActions,
  onSwitch,
  onEdit
}: {
  text: string
  versions: readonly ThreadVersion[]
  showActions: boolean
  onSwitch: (questionId: string) => void
  onEdit: () => void
}) {
  return (
    <div className="chat-message-user-wrap">
      <div className="chat-message-user">{text}</div>
      {showActions ? (
        <div className="user-actions">
          {versions.length > 1 ? (
            <VersionNav
              versions={versions}
              label="提问版本"
              previousLabel="上一个提问版本"
              nextLabel="下一个提问版本"
              onSelect={onSwitch}
            />
          ) : null}
          <button type="button" className="chat-action" aria-label="编辑上一条提问" onClick={onEdit}>
            编辑
          </button>
        </div>
      ) : null}
    </div>
  )
}

function VersionNav({
  versions,
  label,
  previousLabel,
  nextLabel,
  onSelect
}: {
  versions: readonly ThreadVersion[]
  label: string
  previousLabel: string
  nextLabel: string
  onSelect: (id: string) => void
}) {
  const index = selectedVersionIndex(versions)
  if (index === 0) {
    return null
  }
  const previous = versions[(index - 2 + versions.length) % versions.length]
  const next = versions[index % versions.length]
  return (
    <div className="version-nav" role="group" aria-label={label}>
      <button
        type="button"
        className="version-step"
        aria-label={previousLabel}
        onClick={() => previous && onSelect(previous.id)}
      >
        ‹
      </button>
      <span className="version-index">
        {index}/{versions.length}
      </span>
      <button
        type="button"
        className="version-step"
        aria-label={nextLabel}
        onClick={() => next && onSelect(next.id)}
      >
        ›
      </button>
    </div>
  )
}

function AnswerCard({
  answer,
  isLast,
  session,
  disabled,
  onSwitchVersion,
  onRegenerate,
  onContinue,
  onRetry,
  onToggleThinking
}: {
  answer: ThreadAnswer
  isLast: boolean
  session: ChatSessionState
  disabled: boolean
  onSwitchVersion: (answerId: string) => void
  onRegenerate: () => void
  onContinue: () => void
  onRetry: () => void
  onToggleThinking: (open: boolean) => void
}) {
  const expanded = thinkingExpandedFor(session, {
    hasThinking: answer.thinking !== '',
    active: false
  })
  const presentation = answer.error ? describeChatError(answer.error) : null
  const badge = statusLabel(answer)
  const seconds = Math.floor(answer.thinkingMs / 1000)

  return (
    <article className="assistant-message" aria-label="学习助手">
      <div className="assistant-head">
        <p className="assistant-label">学习助手</p>
        {answer.versions.length > 1 ? (
          <div className="answer-versions" role="group" aria-label="回答版本">
            {answer.versions.map((version, index) => (
              <button
                key={version.id}
                type="button"
                className="version-tab"
                aria-pressed={version.selected}
                aria-label={`版本 ${index + 1}`}
                onClick={() => onSwitchVersion(version.id)}
              >
                v{index + 1}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {answer.thinking !== '' ? (
        <ThinkingSection
          text={answer.thinking}
          label={`已思考 ${seconds} 秒`}
          expanded={expanded}
          onToggle={() => onToggleThinking(!expanded)}
        />
      ) : null}

      {answer.text !== '' ? <div className="assistant-text">{answer.text}</div> : null}
      {badge ? <span className="status-chip">{badge}</span> : null}

      {presentation ? (
        <div className="message-error" role="alert">
          <p className="message-error-title">{presentation.title}</p>
          <p className="message-error-detail">{presentation.detail}</p>
          {presentation.action ? (
            <p className="message-error-action">下一步：{presentation.action}</p>
          ) : null}
          {presentation.retryable ? (
            <div className="message-error-actions">
              <button type="button" className="button button-small" onClick={onRetry}>
                重试
              </button>
            </div>
          ) : null}
          {answer.error?.requestId ? (
            <p className="message-error-request">请求 ID：{answer.error.requestId}</p>
          ) : null}
        </div>
      ) : null}

      {isLast && !disabled ? (
        <div className="assistant-actions">
          <button type="button" className="chat-action" onClick={onRegenerate}>
            重新生成
          </button>
          {answer.text.trim() === '' ? null : (
            <button type="button" className="chat-action" onClick={onContinue}>
              继续生成
            </button>
          )}
        </div>
      ) : null}
    </article>
  )
}

function LiveAnswer({
  generation,
  session,
  now,
  onToggleThinking
}: {
  generation: LiveGeneration
  session: ChatSessionState
  now: number
  onToggleThinking: (open: boolean) => void
}) {
  const text = liveAnswerText(generation)
  const thinking = liveAnswerThinking(generation)
  const expanded = thinkingExpanded(session, generation)
  const seconds = liveThinkingSeconds(generation, now)
  const waiting = generation.phase === 'waiting' && text === ''

  return (
    <article className="assistant-message" aria-label="学习助手">
      <p className="assistant-label">学习助手</p>

      {waiting ? (
        <div className="waiting-dots" role="status" aria-label="正在等待回答">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {thinking === '' ? null : (
        <ThinkingSection
          text={thinking}
          label={
            generation.phase === 'thinking'
              ? `正在思考… ${seconds} 秒`
              : `已思考 ${seconds} 秒`
          }
          expanded={expanded}
          onToggle={() => onToggleThinking(!expanded)}
        />
      )}

      {text === '' ? null : <div className="assistant-text">{text}</div>}
    </article>
  )
}

function ThinkingSection({
  text,
  label,
  expanded,
  onToggle
}: {
  text: string
  label: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="thinking">
      <button
        type="button"
        className="thinking-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="thinking-dot" aria-hidden="true" />
        <span>{label}</span>
        <span className="thinking-action">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded ? (
        <div className="thinking-body" data-testid="thinking-body">
          {text}
        </div>
      ) : null}
    </div>
  )
}

function statusLabel(answer: ThreadAnswer): string | null {
  if (answer.phase === 'stopped') {
    return '已停止 · 未完成'
  }
  if (answer.phase === 'error' && answer.text.trim() !== '') {
    return '未完成'
  }
  return null
}
