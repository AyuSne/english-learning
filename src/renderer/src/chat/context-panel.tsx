import type { ThreadContextItem, ThreadContextSummary } from '../../../shared/threads'
import { CONTEXT_KIND_LABEL, contextSummaryText } from './turns'

/**
 * 输入框上方的学习上下文：这次的词、原句、段落与学习内容都摆在这里，
 * 每一项能单独移除；「添加上下文」展开这次还能加的材料，顶部写清条数与字数。
 */
export function ContextPanel({
  items,
  summary,
  candidates,
  pickerOpen,
  onTogglePicker,
  onAdd,
  onRemove
}: {
  items: readonly ThreadContextItem[]
  summary: ThreadContextSummary
  candidates: readonly ThreadContextItem[] | null
  pickerOpen: boolean
  onTogglePicker: () => void
  onAdd: (item: ThreadContextItem) => void
  onRemove: (id: string) => void
}) {
  return (
    <section className="context-panel" aria-label="学习上下文">
      <div className="context-head">
        <span className="context-label">学习上下文</span>
        <span className="context-summary" data-testid="context-summary">
          {contextSummaryText(summary)}
        </span>
        <button
          type="button"
          className="chat-action context-add"
          aria-expanded={pickerOpen}
          onClick={onTogglePicker}
        >
          添加上下文
        </button>
      </div>

      {items.length === 0 ? (
        <p className="context-empty">还没有带上上下文</p>
      ) : (
        <ul className="context-chips">
          {items.map((item) => (
            <li key={item.id} className="context-chip" data-context-id={item.id}>
              <span className="context-kind">{CONTEXT_KIND_LABEL[item.kind]}</span>
              <span className="context-chip-label" title={item.source === '' ? item.text : item.source}>
                {item.label === '' ? item.text : item.label}
              </span>
              <button
                type="button"
                className="context-remove"
                aria-label={`移除上下文：${item.label === '' ? item.text : item.label}`}
                onClick={() => onRemove(item.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen ? (
        <div className="context-picker" role="group" aria-label="可加入的上下文">
          {candidates === null ? (
            <p className="empty-line">正在读取可加的材料…</p>
          ) : candidates.length === 0 ? (
            <p className="empty-line">没有更多可加的材料。</p>
          ) : (
            <ul className="context-candidates">
              {candidates.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="context-candidate"
                    data-context-kind={item.kind}
                    aria-label={`加入上下文：${item.label === '' ? item.text : item.label}`}
                    onClick={() => onAdd(item)}
                  >
                    <span className="context-kind">{CONTEXT_KIND_LABEL[item.kind]}</span>
                    <span className="context-candidate-text">{item.text}</span>
                    {item.source === '' ? null : (
                      <span className="context-candidate-source">{item.source}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
