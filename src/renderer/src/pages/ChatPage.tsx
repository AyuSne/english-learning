import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { describeChatError } from '../chat/errors'
import {
  ensureChatEvents,
  retryChat,
  sendChatMessage,
  setThinkingOpen,
  stopChat,
  useChatState
} from '../chat/store'
import {
  isStreaming,
  statusLabel,
  thinkingExpanded,
  thinkingSeconds,
  type AssistantItem,
  type ChatState,
  type ThinkingBlock,
  type UserItem
} from '../chat/state'

export function ChatPage() {
  const state = useChatState()
  const streaming = isStreaming(state)
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ensureChatEvents()
  }, [])

  useEffect(() => {
    if (!streaming) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [streaming])

  useEffect(() => {
    const node = scrollRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [state.items])

  useEffect(() => {
    if (!streaming) {
      return
    }
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) {
        return
      }
      event.preventDefault()
      stopChat()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [streaming])

  const submit = (): void => {
    if (sendChatMessage(draft)) {
      setDraft('')
      inputRef.current?.focus()
    }
  }

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }
    if (streaming) {
      // 生成中发送键是停止键，Enter 只换行，输入区不锁。
      return
    }
    event.preventDefault()
    submit()
  }

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="chat-header-inner">
          <h1 className="chat-title">新的学习</h1>
          <p className="chat-subtitle">未挂任何对象 · 从词或文章开始</p>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-column">
          {state.items.length === 0 ? (
            <div className="chat-empty">
              <h2 className="chat-empty-title">今天学点什么？</h2>
              <p className="chat-empty-lede">
                这是一条还没有挂对象的线程：聊完把满意的段落钉住，再决定它归到哪个词条。
              </p>
            </div>
          ) : (
            state.items.map((item) =>
              item.role === 'user' ? (
                <UserMessage key={item.id} item={item} />
              ) : (
                <AssistantMessage
                  key={item.id}
                  item={item}
                  state={state}
                  now={now}
                  onToggleThinking={setThinkingOpen}
                  onRetry={() => retryChat(item.id)}
                />
              )
            )
          )}
        </div>
      </div>

      <div className="chat-composer">
        <div className="composer-inner">
          <div className="composer-box">
            <textarea
              ref={inputRef}
              className="composer-input"
              rows={2}
              aria-label="输入问题"
              placeholder="问点什么… 例如：这两个例句里哪个更常用于书面语？"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <button
              type="button"
              className={streaming ? 'send-button send-button-stop' : 'send-button'}
              aria-label={streaming ? '停止生成' : '发送'}
              onClick={streaming ? stopChat : submit}
            >
              {streaming ? (
                <span className="stop-square" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">↑</span>
              )}
            </button>
          </div>
          <p className="composer-hint">Enter 发送 · Shift+Enter 换行 · Esc 停止</p>
        </div>
      </div>
    </div>
  )
}

function UserMessage({ item }: { item: UserItem }) {
  return <div className="chat-message-user">{item.text}</div>
}

function AssistantMessage({
  item,
  state,
  now,
  onToggleThinking,
  onRetry
}: {
  item: AssistantItem
  state: ChatState
  now: number
  onToggleThinking: (open: boolean) => void
  onRetry: () => void
}) {
  const expanded = thinkingExpanded(state, item)
  const badge = statusLabel(item)
  const presentation = item.error ? describeChatError(item.error) : null

  return (
    <article className="assistant-message" aria-label="学习助手">
      <p className="assistant-label">学习助手</p>

      {item.phase === 'waiting' ? (
        <div className="waiting-dots" role="status" aria-label="正在等待回答">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {item.thinking ? (
        <ThinkingSection
          block={item.thinking}
          phase={item.phase}
          expanded={expanded}
          now={now}
          onToggle={() => onToggleThinking(!expanded)}
        />
      ) : null}

      {item.text !== '' ? <div className="assistant-text">{item.text}</div> : null}
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
          {item.error?.requestId ? (
            <p className="message-error-request">请求 ID：{item.error.requestId}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function ThinkingSection({
  block,
  phase,
  expanded,
  now,
  onToggle
}: {
  block: ThinkingBlock
  phase: AssistantItem['phase']
  expanded: boolean
  now: number
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
        <span>{thinkingLabel(block, phase, now)}</span>
        <span className="thinking-action">{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded ? (
        <div className="thinking-body" data-testid="thinking-body">
          {block.text}
        </div>
      ) : null}
    </div>
  )
}

function thinkingLabel(block: ThinkingBlock, phase: AssistantItem['phase'], now: number): string {
  const seconds = thinkingSeconds(block, now)
  if (phase === 'thinking') {
    return `正在思考… ${seconds} 秒`
  }
  if (phase === 'stopped') {
    return `思考已停止 · ${seconds} 秒`
  }
  return `已思考 ${seconds} 秒`
}
