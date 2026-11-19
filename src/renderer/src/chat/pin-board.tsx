import type { Pin, PinBoard, PinTargetKind } from '../../../shared/pins'
import { pinExcerpt, pinProvenanceText, targetLabel } from './pin-text'

export type PinTab = 'thread' | 'unfiled'
type FileTargetKind = Exclude<PinTargetKind, 'unfiled'>

/**
 * 右侧钉板抽屉。默认收成 44px 窄条并显示未归档条数，点开占 336px。
 * 「这条线程」只列已归位的钉住，「未归档」是全局暂存；两边卡片给的动作不同。
 */
export function PinBoardPanel({
  board,
  open,
  tab,
  threadEntryId,
  busyPinId,
  freshPinIds,
  onToggle,
  onSelectTab,
  onOpenSource,
  onChangeTarget,
  onDelete,
  onFile,
  onFileAll,
  onViewEntry
}: {
  board: PinBoard
  open: boolean
  tab: PinTab
  /** 这条线程挂的词条；页脚「在词条中查看」在没有钉到词条时用它。 */
  threadEntryId: string | null
  busyPinId: string | null
  freshPinIds: readonly string[]
  onToggle: () => void
  onSelectTab: (tab: PinTab) => void
  onOpenSource: (pin: Pin) => void
  onChangeTarget: (pin: Pin) => void
  onDelete: (pin: Pin) => void
  onFile: (pin: Pin, kind: FileTargetKind) => void
  onFileAll: () => void
  onViewEntry: (entryId: string) => void
}) {
  if (!open) {
    return (
      <aside className="pin-board pin-board-collapsed" aria-label="钉板">
        <button
          type="button"
          className="pin-board-handle"
          aria-label={`打开钉板，未归档 ${board.unfiledCount} 条`}
          aria-expanded={false}
          onClick={onToggle}
        >
          <span className="pin-board-count">{board.unfiledCount}</span>
          <span className="pin-board-label">钉板</span>
        </button>
      </aside>
    )
  }

  const pins = tab === 'thread' ? board.threadPins : board.unfiledPins
  const entryTarget =
    board.threadPins.find((pin) => pin.target.kind === 'entry')?.target ?? null
  const viewEntryId =
    entryTarget?.kind === 'entry' ? entryTarget.entryId : threadEntryId

  return (
    <aside className="pin-board pin-board-open" aria-label="钉板">
      <header className="pin-board-head">
        <div className="pin-board-tabs" role="tablist" aria-label="钉板分类">
          <button
            type="button"
            role="tab"
            className="pin-board-tab"
            aria-selected={tab === 'thread'}
            onClick={() => onSelectTab('thread')}
          >
            这条线程
          </button>
          <button
            type="button"
            role="tab"
            className="pin-board-tab"
            aria-selected={tab === 'unfiled'}
            onClick={() => onSelectTab('unfiled')}
          >
            未归档 {board.unfiledCount}
          </button>
        </div>
        <button
          type="button"
          className="pin-board-fold"
          aria-label="收起钉板"
          aria-expanded
          onClick={onToggle}
        >
          →
        </button>
      </header>

      <div className="pin-board-list" role="tabpanel">
        {pins.length === 0 ? (
          <p className="pin-board-empty">
            {tab === 'unfiled' ? '没有未归档' : '这条线程还没有钉住'}
          </p>
        ) : (
          pins.map((pin) => (
            <PinCard
              key={pin.id}
              pin={pin}
              tab={tab}
              busy={busyPinId === pin.id}
              fresh={freshPinIds.includes(pin.id)}
              onOpenSource={onOpenSource}
              onChangeTarget={onChangeTarget}
              onDelete={onDelete}
              onFile={onFile}
            />
          ))
        )}
      </div>

      <footer className="pin-board-foot">
        <span className="pin-board-foot-text">
          {tab === 'thread'
            ? `这条线程已钉 ${board.threadPins.length} 条`
            : `未归档 ${board.unfiledCount} 条 · 不计入收集`}
        </span>
        {tab === 'thread' ? (
          viewEntryId === null ? null : (
            <button
              type="button"
              className="button button-small"
              onClick={() => onViewEntry(viewEntryId)}
            >
              在词条中查看
            </button>
          )
        ) : (
          <button
            type="button"
            className="button button-small"
            disabled={board.unfiledCount === 0}
            onClick={onFileAll}
          >
            全部归位
          </button>
        )}
      </footer>
    </aside>
  )
}

function PinCard({
  pin,
  tab,
  busy,
  fresh,
  onOpenSource,
  onChangeTarget,
  onDelete,
  onFile
}: {
  pin: Pin
  tab: PinTab
  busy: boolean
  fresh: boolean
  onOpenSource: (pin: Pin) => void
  onChangeTarget: (pin: Pin) => void
  onDelete: (pin: Pin) => void
  onFile: (pin: Pin, kind: FileTargetKind) => void
}) {
  return (
    <article
      className="pin-card"
      data-pin-id={pin.id}
      data-fresh={fresh ? 'true' : 'false'}
    >
      <p className="pin-card-excerpt" title={pin.capturedText}>
        {pinExcerpt(pin.capturedText)}
      </p>
      <p className="pin-card-provenance">
        <span>{pinProvenanceText(pin)}</span>
        <span className="pin-card-target">{targetLabel(pin.target)}</span>
      </p>
      {pin.provenance.sourceSentence === null ? null : (
        <p className="pin-card-source" title={pin.provenance.sourceSentence.text}>
          当时原句：{pin.provenance.sourceSentence.text}
        </p>
      )}
      {pin.threadAlive ? null : (
        <p className="pin-card-dead">源对话已删除 · 内容按快照保留</p>
      )}
      <div className="pin-card-actions">
        {tab === 'thread' ? (
          <>
            <button
              type="button"
              className="pin-card-action"
              disabled={busy || !pin.threadAlive}
              title={pin.threadAlive ? undefined : '源对话已删除'}
              onClick={() => onOpenSource(pin)}
            >
              看原对话
            </button>
            <button
              type="button"
              className="pin-card-action"
              disabled={busy}
              onClick={() => onChangeTarget(pin)}
            >
              换落点
            </button>
            <button
              type="button"
              className="pin-card-action pin-card-danger"
              disabled={busy}
              onClick={() => onDelete(pin)}
            >
              删除
            </button>
          </>
        ) : (
          <>
            {!pin.threadAlive && (
              <button type="button" className="pin-card-action" disabled title="源对话已删除">
                看原对话
              </button>
            )}
            <button
              type="button"
              className="pin-card-action"
              disabled={busy}
              onClick={() => onFile(pin, 'entry')}
            >
              归到词条
            </button>
            <button
              type="button"
              className="pin-card-action"
              disabled={busy}
              onClick={() => onFile(pin, 'article')}
            >
              归到文章
            </button>
            <button
              type="button"
              className="pin-card-action pin-card-danger"
              disabled={busy}
              onClick={() => onDelete(pin)}
            >
              丢弃
            </button>
          </>
        )}
      </div>
    </article>
  )
}
