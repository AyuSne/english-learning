import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject
} from 'react'
import type { ReadingCollectionMark, WordEntryCard } from '../../../shared/entries'
import type {
  ReadingParagraph,
  ReadingPreferences,
  ReadingSettings,
  ReadingSettingsResult,
  ReadingView
} from '../../../shared/reading'
import {
  DEFAULT_READING_PREFERENCES,
  READING_FONT_SIZES,
  READING_LINE_HEIGHTS
} from '../../../shared/reading'
import {
  collectSelection,
  deleteEntrySentence,
  loadWordEntryCard,
  openReadingView,
  saveReadingSettings
} from '../api'
import { messageOf } from '../errors'
import { readingPointText } from '../library/format'
import { goBack, navigate } from '../navigate'
import {
  buildReadingBlocks,
  type ReadingBlock,
  type ReadingPart
} from '../reading/content'
import { locateSelection, selectionOffsets, type ReadingSelection } from '../reading/selection'
import { settingsLabel, settingsSourceLabel } from '../reading/settings-text'
import { useReadingPosition } from '../reading/use-reading-position'

type ReadingPageProps = {
  articleId: string | null
}

/** 本次圈下的表达：先画麦色底，收下后再补上词条 id，点它可以打开词条卡。 */
type ActiveSelection = ReadingSelection & {
  entryId: string | null
  entryMainForm: string
}

type CollectedPanel = {
  kind: 'collected'
  entryId: string
  entryMainForm: string
  surface: string
  sentenceText: string
  sentenceCount: number
  articleCount: number
  duplicate: boolean
}

type EntryPanel = {
  kind: 'entry'
  entryId: string
  card: WordEntryCard | null
  error: string | null
  /** 删最后一条原句前先确认，会连词条一起删。 */
  confirmingDelete: boolean
  deleting: boolean
}

type PanelState = CollectedPanel | EntryPanel

/**
 * 阅读页：收起全局栏，620 列宽正文居中，长篇匹配在段首标原卷字母。
 * 字号行距与注释开关按篇记住；注释在宽窗口走页边注，窄窗口行内展开。
 * 滚动时把最后读到的段落与句子写回本机库，下次从那里继续。
 *
 * 圈选一个词或短语就完成选词：当场麦色高亮，落成词条下的一条原句；
 * 已收集的表达在重读时弱高亮，点一下打开词条卡，可从卡里删原句。
 */
export function ReadingPage({ articleId }: ReadingPageProps) {
  const [view, setView] = useState<ReadingView | null>(null)
  const [settings, setSettings] = useState<ReadingSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collected, setCollected] = useState<ReadingCollectionMark[]>([])
  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null)
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [collectError, setCollectError] = useState<string | null>(null)

  const { scrollRef, position, writeError } = useReadingPosition(view)
  const settingsRequest = useRef(0)
  const settingsPanelRef = useRef<HTMLElement>(null)
  const settingsButtonRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const collectRequest = useRef(0)
  const collecting = useRef(false)

  useEffect(() => {
    if (articleId === null) {
      setView(null)
      setLoadError(null)
      return
    }

    let active = true
    setView(null)
    setLoadError(null)
    setSettingsError(null)
    setCollected([])
    setActiveSelection(null)
    setPanel(null)
    setHint(null)
    setCollectError(null)
    openReadingView(articleId).then(
      (value) => {
        if (!active) return
        if (value === null) {
          setLoadError('这篇文章已经不在库里了。')
          return
        }
        setView(value)
        setSettings(value.settings)
        setCollected(value.collected)
      },
      (error: unknown) => {
        if (active) setLoadError(messageOf(error))
      }
    )
    return () => {
      active = false
    }
  }, [articleId])

  // Esc 先关词条卡，再关设置，最后退回上一页。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (panel !== null) {
        setPanel(null)
        setActiveSelection(null)
        return
      }
      if (settingsOpen) {
        setSettingsOpen(false)
        return
      }
      goBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel, settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (settingsPanelRef.current?.contains(target)) return
      if (settingsButtonRef.current?.contains(target)) return
      setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [settingsOpen])

  // 点正文别处、栏位按钮或空白都收起词条卡与这次的选中态。
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (target === null) return
      if (panelRef.current?.contains(target)) return
      if (target.closest('.reading-settings') !== null) return
      if (settingsButtonRef.current?.contains(target)) return
      const mark = target.closest<HTMLElement>('[data-entry-id]')
      if (mark !== null && (mark.dataset.entryId ?? '') !== '') return
      setActiveSelection(null)
      setPanel(null)
      setHint(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    if (hint === null) return
    const timer = window.setTimeout(() => setHint(null), 4000)
    return () => window.clearTimeout(timer)
  }, [hint])

  const blocks = useMemo(() => {
    if (!view) return []
    return view.paragraphs.map((paragraph) => {
      const highlights = [
        ...(settings?.weakHighlight === false
          ? []
          : collected
              .filter((mark) => mark.paragraphId === paragraph.id)
              .map((mark) => ({
                entryId: mark.entryId,
                label: mark.entryMainForm,
                start: mark.start,
                end: mark.end
              }))),
        ...(activeSelection === null || activeSelection.paragraphId !== paragraph.id
          ? []
          : [
              {
                entryId: activeSelection.entryId ?? '',
                label: activeSelection.entryMainForm,
                start: activeSelection.start,
                end: activeSelection.end,
                selected: true
              }
            ])
      ]
      return {
        paragraph,
        blocks: buildReadingBlocks(paragraph, highlights)
      }
    })
  }, [view, collected, activeSelection, settings?.weakHighlight])

  function updatePreferences(patch: Partial<ReadingPreferences>): void {
    if (!view || !settings) return
    const previous = settings
    const preferences: ReadingPreferences = {
      fontSize: patch.fontSize ?? settings.fontSize,
      lineHeight: patch.lineHeight ?? settings.lineHeight,
      annotationsVisible: patch.annotationsVisible ?? settings.annotationsVisible,
      weakHighlight: patch.weakHighlight ?? settings.weakHighlight
    }
    setSettings({ ...preferences, source: 'article' })
    setSettingsError(null)

    const request = settingsRequest.current + 1
    settingsRequest.current = request
    saveReadingSettings({ articleId: view.article.id, preferences }).then(
      (result: ReadingSettingsResult | null) => {
        if (request !== settingsRequest.current) return
        if (result === null) {
          setSettings(previous)
          setSettingsError('这篇的阅读设置没有记住。')
          return
        }
        setSettings(result.settings)
        if (!result.saved) {
          setSettingsError('这次阅读设置没有写入本机资料库。')
        }
      },
      (error: unknown) => {
        if (request === settingsRequest.current) {
          setSettings(previous)
          setSettingsError(messageOf(error))
        }
      }
    )
  }

  function openEntryCard(entryId: string): void {
    if (entryId === '') return
    setActiveSelection(null)
    setHint(null)
    setPanel({
      kind: 'entry',
      entryId,
      card: null,
      error: null,
      confirmingDelete: false,
      deleting: false
    })
    loadWordEntryCard(entryId).then(
      (card) => {
        setPanel((current) =>
          current !== null && current.kind === 'entry' && current.entryId === entryId
            ? {
                ...current,
                card,
                error: card === null ? '这个词条已经不在了。' : null
              }
            : current
        )
      },
      (error: unknown) => {
        setPanel((current) =>
          current !== null && current.kind === 'entry' && current.entryId === entryId
            ? { ...current, error: messageOf(error) }
            : current
        )
      }
    )
  }

  function readSelection(): { paragraph: ReadingParagraph; selection: ReadingSelection } | null {
    if (!view) return null
    const browserSelection = window.getSelection()
    if (!browserSelection || browserSelection.rangeCount === 0 || browserSelection.isCollapsed) {
      return null
    }
    const range = browserSelection.getRangeAt(0)
    const startElement =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement
    const paragraphElement = startElement?.closest<HTMLElement>('.reading-paragraph') ?? null
    if (paragraphElement === null) return null
    const paragraphId = paragraphElement.dataset.paragraphId
    const paragraph = view.paragraphs.find((candidate) => candidate.id === paragraphId)
    if (!paragraph) return null
    const offsets = selectionOffsets(paragraphElement)
    if (offsets === null) return null
    const selection = locateSelection(paragraph, offsets.start, offsets.end)
    return selection === null ? null : { paragraph, selection }
  }

  function collectCurrentSelection(): void {
    if (!view || collecting.current) return
    const read = readSelection()
    if (read === null) {
      if (
        window.getSelection()?.isCollapsed === false &&
        (window.getSelection()?.toString().trim().length ?? 0) > 0
      ) {
        setHint('一次圈一个词或短语（同一句内）。')
      }
      return
    }

    const { paragraph, selection } = read
    window.getSelection()?.removeAllRanges()
    collecting.current = true
    setHint(null)
    setCollectError(null)
    setPanel(null)
    setActiveSelection({
      ...selection,
      entryId: null,
      entryMainForm: selection.surface
    })

    const request = collectRequest.current + 1
    collectRequest.current = request
    collectSelection({
      articleId: view.article.id,
      paragraphId: paragraph.id,
      sentenceOrdinal: selection.sentenceOrdinal,
      start: selection.start,
      end: selection.end
    }).then(
      (result) => {
        if (request !== collectRequest.current) return
        collecting.current = false
        if (result.status === 'rejected') {
          setActiveSelection(null)
          setCollectError('这次没有收进来，再圈一次试试。')
          return
        }
        setCollected(result.marks)
        setActiveSelection((current) =>
          current !== null &&
          current.paragraphId === selection.paragraphId &&
          current.start === selection.start &&
          current.end === selection.end
            ? { ...current, entryId: result.entry.id, entryMainForm: result.entry.mainForm }
            : current
        )
        setPanel({
          kind: 'collected',
          entryId: result.entry.id,
          entryMainForm: result.entry.mainForm,
          surface: result.sentence.surface,
          sentenceText: result.sentence.sentenceText,
          sentenceCount: result.entry.sentenceCount,
          articleCount: result.entry.articleCount,
          duplicate: result.status === 'duplicate'
        })
      },
      (error: unknown) => {
        if (request !== collectRequest.current) return
        collecting.current = false
        setActiveSelection(null)
        setCollectError(messageOf(error))
      }
    )
  }

  function removeSentence(entrySentenceId: string): void {
    setPanel((current) =>
      current !== null && current.kind === 'entry'
        ? { ...current, deleting: true, error: null, confirmingDelete: false }
        : current
    )
    deleteEntrySentence(entrySentenceId).then(
      (result) => {
        if (result.status === 'missing') {
          setPanel((current) =>
            current !== null && current.kind === 'entry'
              ? { ...current, deleting: false, error: '这条原句已经不在了。' }
              : current
          )
          return
        }

        setCollected(result.marks)
        const entry = result.entry
        if (result.entryDeleted || entry === null) {
          setPanel(null)
          setActiveSelection(null)
          setHint('原句与这个词条已删除。')
          return
        }
        setPanel((current) =>
          current !== null && current.kind === 'entry' && current.card !== null
            ? {
                ...current,
                entryId: entry.id,
                deleting: false,
                error: null,
                confirmingDelete: false,
                card: {
                  entry,
                  sentences: current.card.sentences.filter(
                    (sentence) => sentence.id !== entrySentenceId
                  )
                }
              }
            : current
        )
      },
      (error: unknown) => {
        setPanel((current) =>
          current !== null && current.kind === 'entry'
            ? { ...current, deleting: false, error: messageOf(error) }
            : current
        )
      }
    )
  }

  function requestDeleteSentence(entrySentenceId: string): void {
    if (panel === null || panel.kind !== 'entry' || panel.card === null) return
    if (panel.card.entry.sentenceCount <= 1) {
      setPanel({ ...panel, confirmingDelete: true })
      return
    }
    removeSentence(entrySentenceId)
  }

  function confirmDeleteLast(): void {
    if (panel === null || panel.kind !== 'entry' || panel.card === null) return
    const last = panel.card.sentences[0]
    if (last) removeSentence(last.id)
  }

  function closePanel(): void {
    setPanel(null)
    setActiveSelection(null)
  }

  const handleBodyClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const mark = (event.target as Element).closest<HTMLElement>('[data-entry-id]')
    const entryId = mark?.dataset.entryId ?? ''
    if (entryId !== '') openEntryCard(entryId)
  }

  const handleBodyKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const mark = (event.target as Element).closest<HTMLElement>('[data-entry-id]')
    const entryId = mark?.dataset.entryId ?? ''
    if (entryId === '') return
    event.preventDefault()
    openEntryCard(entryId)
  }

  const hasLetters = view?.article.kind === 'long_match'
  const annotationCount = view
    ? view.paragraphs.reduce((total, paragraph) => total + paragraph.annotations.length, 0)
    : 0
  const bodyClassName = [
    'reading-body',
    hasLetters ? 'reading-body-letters' : '',
    annotationCount > 0 ? 'reading-body-with-notes' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className="reading"
      data-annotations={settings?.annotationsVisible === false ? 'hidden' : 'visible'}
      data-weak-highlight={settings?.weakHighlight === false ? 'off' : 'on'}
      data-reading-page="true"
      style={
        {
          '--reading-font-size': `${settings?.fontSize ?? DEFAULT_READING_PREFERENCES.fontSize}px`,
          '--reading-line-height':
            settings?.lineHeight ?? DEFAULT_READING_PREFERENCES.lineHeight
        } as CSSProperties
      }
    >
      <header className="reading-bar">
        <button type="button" className="reading-back" aria-label="返回" onClick={() => goBack()}>
          ←
        </button>
        <div className="reading-bar-text">
          <h1 className="reading-bar-title">{view?.article.title ?? '阅读'}</h1>
        </div>
        <div className="reading-bar-actions">
          {view && settings ? (
            <>
              <button
                type="button"
                className="reading-tool"
                aria-pressed={settings.annotationsVisible}
                aria-label={settings.annotationsVisible ? '隐藏原文注释' : '显示原文注释'}
                onClick={() =>
                  updatePreferences({ annotationsVisible: !settings.annotationsVisible })
                }
              >
                注释
              </button>
              <div className="reading-settings-anchor" ref={settingsButtonRef}>
                <button
                  type="button"
                  className="reading-tool"
                  aria-expanded={settingsOpen}
                  aria-haspopup="true"
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  阅读设置
                </button>
                {settingsOpen ? (
                  <ReadingSettingsPanel
                    settings={settings}
                    error={settingsError}
                    onChange={updatePreferences}
                    panelRef={settingsPanelRef}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </header>

      {articleId === null ? (
        <div className="reading-empty">
          <p className="eyebrow">还没有打开文章</p>
          <h2 className="reading-empty-title">先挑一篇</h2>
          <p className="reading-empty-line">文章按场次收在文章库里，打开就能接着上次读。</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate('library')}
          >
            从文章库挑一篇
          </button>
        </div>
      ) : loadError !== null ? (
        <div className="reading-empty" role="alert">
          <p className="eyebrow">打不开这篇</p>
          <h2 className="reading-empty-title">{loadError}</h2>
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate('library')}
          >
            从文章库挑一篇
          </button>
        </div>
      ) : view === null ? (
        <div className="reading-empty" aria-busy="true">
          <p className="reading-empty-line">正在打开文章…</p>
        </div>
      ) : (
        <div className="reading-scroll" ref={scrollRef}>
          <div className="reading-sheet">
            {writeError === null ? null : (
              <p className="reading-write-error" role="alert">
                {writeError}
              </p>
            )}
            <div
              className={bodyClassName}
              onMouseUp={collectCurrentSelection}
              onKeyUp={(event) => {
                if (event.shiftKey || event.key === 'Shift') collectCurrentSelection()
              }}
              onClick={handleBodyClick}
              onKeyDown={handleBodyKeyDown}
            >
              {blocks.map(({ paragraph, blocks: paragraphBlocks }) => (
                <ReadingParagraphView
                  key={paragraph.id}
                  paragraph={paragraph}
                  blocks={paragraphBlocks}
                />
              ))}
              <footer className="reading-foot">
                <span>{position ? `读到 ${readingPointText(position)}` : '还没开始读'}</span>
                <span>位置自动记住</span>
              </footer>
            </div>
          </div>
        </div>
      )}

      {panel === null ? null : panel.kind === 'collected' ? (
        <CollectedPanelView
          panel={panel}
          panelRef={panelRef}
          onOpenEntry={() => openEntryCard(panel.entryId)}
          onClose={closePanel}
        />
      ) : (
        <EntryPanelView
          panel={panel}
          panelRef={panelRef}
          onClose={closePanel}
          onDelete={requestDeleteSentence}
          onConfirmDeleteLast={confirmDeleteLast}
          onCancelConfirm={() =>
            setPanel((current) =>
              current !== null && current.kind === 'entry'
                ? { ...current, confirmingDelete: false }
                : current
            )
          }
        />
      )}

      {hint === null ? null : (
        <p className="reading-toast" role="status">
          {hint}
        </p>
      )}
      {collectError === null ? null : (
        <p className="reading-toast reading-toast-error" role="alert">
          {collectError}
        </p>
      )}
    </div>
  )
}

function ReadingParagraphView({
  paragraph,
  blocks
}: {
  paragraph: ReadingParagraph
  blocks: readonly ReadingBlock[]
}) {
  return (
    <div className="reading-row">
      {paragraph.letter === null ? null : (
        <span className="reading-letter" aria-hidden="true">
          {paragraph.letter}
        </span>
      )}
      <p className="reading-paragraph" data-paragraph-id={paragraph.id}>
        {blocks.map((block, index) =>
          block.kind === 'gap' ? (
            <span key={index}>{block.text}</span>
          ) : (
            <span
              key={index}
              className="reading-sentence"
              data-paragraph-id={paragraph.id}
              data-paragraph-ordinal={paragraph.ordinal}
              data-sentence-ordinal={block.ordinal}
            >
              {block.parts.map((part, partIndex) => (
                <ReadingPartView key={partIndex} part={part} />
              ))}
            </span>
          )
        )}
      </p>
      {paragraph.annotations.length === 0 ? null : (
        <aside className="reading-notes" aria-label="原文注释">
          {paragraph.annotations.map((annotation) => (
            <p className="reading-note" key={`${annotation.start}-${annotation.end}`}>
              <span className="reading-note-word">{annotation.surface}</span>
              <span className="reading-note-gloss">{annotation.gloss}</span>
            </p>
          ))}
        </aside>
      )}
    </div>
  )
}

function ReadingPartView({ part }: { part: ReadingPart }) {
  const mark = part.mark
  const className = [
    part.kind === 'annotation' ? 'reading-annotated' : '',
    mark === undefined ? '' : mark.selected ? 'reading-selected' : 'reading-collected'
  ]
    .filter(Boolean)
    .join(' ')

  const interactive = mark !== undefined && mark.entryId !== ''
  const markProps = interactive
    ? {
        'data-entry-id': mark.entryId,
        role: 'button',
        tabIndex: 0,
        'aria-label': `查看词条 ${mark.label}`
      }
    : {}

  if (part.kind === 'annotation') {
    return (
      <span className={className || undefined} data-gloss={part.gloss} {...markProps}>
        {part.text}
      </span>
    )
  }
  return (
    <span className={className || undefined} {...markProps}>
      {part.text}
    </span>
  )
}

function CollectedPanelView({
  panel,
  panelRef,
  onOpenEntry,
  onClose
}: {
  panel: CollectedPanel
  panelRef: RefObject<HTMLElement | null>
  onOpenEntry: () => void
  onClose: () => void
}) {
  return (
    <aside className="reading-panel" aria-label="选词结果" ref={panelRef}>
      <header className="reading-panel-head">
        <p className="reading-panel-eyebrow">
          {panel.duplicate ? '这条原句已经收过' : '已收下'}
        </p>
        <button type="button" className="reading-panel-close" aria-label="关闭" onClick={onClose}>
          ×
        </button>
      </header>
      <p className="reading-panel-word">{panel.surface}</p>
      <p className="reading-panel-entry">词条 {panel.entryMainForm}</p>
      <blockquote className="reading-panel-sentence">{panel.sentenceText}</blockquote>
      <p className="reading-panel-meta">
        已有 {panel.sentenceCount} 条原句 · 来自 {panel.articleCount} 篇文章
      </p>
      <div className="reading-panel-actions">
        <button type="button" className="button" onClick={onOpenEntry}>
          查看词条
        </button>
      </div>
    </aside>
  )
}

function EntryPanelView({
  panel,
  panelRef,
  onClose,
  onDelete,
  onConfirmDeleteLast,
  onCancelConfirm
}: {
  panel: EntryPanel
  panelRef: RefObject<HTMLElement | null>
  onClose: () => void
  onDelete: (entrySentenceId: string) => void
  onConfirmDeleteLast: () => void
  onCancelConfirm: () => void
}) {
  return (
    <aside className="reading-panel" aria-label="词条" ref={panelRef}>
      <header className="reading-panel-head">
        <p className="reading-panel-eyebrow">词条</p>
        <button type="button" className="reading-panel-close" aria-label="关闭" onClick={onClose}>
          ×
        </button>
      </header>

      {panel.card === null ? (
        panel.error === null ? (
          <p className="reading-panel-loading" aria-busy="true">
            正在打开词条…
          </p>
        ) : (
          <p className="reading-panel-error" role="alert">
            {panel.error}
          </p>
        )
      ) : (
        <>
          <h2 className="reading-panel-word">{panel.card.entry.mainForm}</h2>
          <p className="reading-panel-meta">
            已收集 {panel.card.entry.sentenceCount} 条原句 · 来自{' '}
            {panel.card.entry.articleCount} 篇文章
          </p>
          {panel.card.entry.variants.length === 0 ? null : (
            <p className="reading-panel-variants">
              变体：{panel.card.entry.variants.join('、')}
            </p>
          )}

          <ul className="reading-panel-sentences">
            {panel.card.sentences.map((sentence) => (
              <li className="reading-panel-sentence-row" key={sentence.id}>
                <blockquote className="reading-panel-sentence">
                  {sentence.sentenceText}
                </blockquote>
                <p className="reading-panel-source">
                  {sentence.articleTitle} · 第 {sentence.paragraphOrdinal} 段 ·{' '}
                  {sentence.surface}
                </p>
                <button
                  type="button"
                  className="reading-panel-delete"
                  aria-label="删除这条原句"
                  disabled={panel.deleting}
                  onClick={() => onDelete(sentence.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>

          {panel.confirmingDelete ? (
            <div className="reading-panel-confirm" role="alert">
              <p>这是最后一条原句。删掉后「{panel.card.entry.mainForm}」词条也会一起删除。</p>
              <div className="reading-panel-actions">
                <button type="button" className="button" onClick={onCancelConfirm}>
                  取消
                </button>
                <button
                  type="button"
                  className="button reading-button-danger"
                  onClick={onConfirmDeleteLast}
                >
                  删除词条与原句
                </button>
              </div>
            </div>
          ) : null}

          {panel.error === null ? null : (
            <p className="reading-panel-error" role="alert">
              {panel.error}
            </p>
          )}
        </>
      )}
    </aside>
  )
}

function ReadingSettingsPanel({
  settings,
  error,
  onChange,
  panelRef
}: {
  settings: ReadingSettings
  error: string | null
  onChange: (patch: Partial<ReadingPreferences>) => void
  panelRef: RefObject<HTMLElement | null>
}) {
  return (
    <section className="reading-settings" aria-label="阅读设置" ref={panelRef}>
      <p className="reading-settings-eyebrow">本篇阅读</p>

      <ReadingSettingGroup
        label="字号"
        options={READING_FONT_SIZES}
        selected={settings.fontSize}
        onSelect={(fontSize) => onChange({ fontSize })}
      />
      <ReadingSettingGroup
        label="行距"
        options={READING_LINE_HEIGHTS}
        selected={settings.lineHeight}
        format={(height) => height.toFixed(1)}
        onSelect={(lineHeight) => onChange({ lineHeight })}
      />

      <label className="reading-toggle">
        <input
          type="checkbox"
          checked={settings.annotationsVisible}
          onChange={(event) => onChange({ annotationsVisible: event.target.checked })}
        />
        显示原文注释
      </label>

      <label className="reading-toggle">
        <input
          type="checkbox"
          checked={settings.weakHighlight}
          onChange={(event) => onChange({ weakHighlight: event.target.checked })}
        />
        已收集的词弱高亮
      </label>

      <p className="reading-settings-note">
        {settingsLabel(settings)} · {settingsSourceLabel(settings.source)}
      </p>
      {error === null ? null : (
        <p className="reading-settings-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function ReadingSettingGroup<T extends number>({
  label,
  options,
  selected,
  format,
  onSelect
}: {
  label: string
  options: readonly T[]
  selected: T
  format?: (value: T) => string
  onSelect: (value: T) => void
}) {
  const labelId = useId()
  return (
    <div className="reading-setting">
      <span className="reading-setting-label" id={labelId}>
        {label}
      </span>
      <div className="reading-segments" role="group" aria-labelledby={labelId}>
        {options.map((value) => (
          <button
            type="button"
            key={value}
            className="reading-segment"
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
          >
            {format ? format(value) : value}
          </button>
        ))}
      </div>
    </div>
  )
}
