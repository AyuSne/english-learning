import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { ReadingCollectionMark } from '../../../shared/entries'
import type {
  ReadingPreferences,
  ReadingSettings,
  ReadingSettingsResult,
  ReadingView
} from '../../../shared/reading'
import { DEFAULT_READING_PREFERENCES } from '../../../shared/reading'
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
import { buildReadingBlocks } from '../reading/content'
import {
  CollectedPanelView,
  EntryPanelView,
  type EntryPanel,
  type PanelState
} from '../reading/entry-panel'
import { ReadingParagraphView } from '../reading/paragraph'
import { readParagraphSelection, type ReadingSelection } from '../reading/selection'
import { ReadingSettingsPanel } from '../reading/settings-panel'
import { useReadingPosition } from '../reading/use-reading-position'

type ReadingPageProps = {
  articleId: string | null
}

/** 本次圈下的表达：先画麦色底，收下后再补上词条 id，点它可以打开词条卡。 */
type ActiveSelection = ReadingSelection & {
  entryId: string | null
  entryMainForm: string
}

/** 从点击目标找到已收集标记的词条 id；普通正文返回 null。 */
function entryIdOf(target: EventTarget | null): string | null {
  const mark = (target as Element | null)?.closest<HTMLElement>('[data-entry-id]')
  return mark?.dataset.entryId ?? null
}

/**
 * 阅读页：收起全局栏，620 列宽正文居中，长篇匹配在段首标原卷字母。
 * 字号行距、注释与弱高亮按篇记住；滚动时把最后读到的位置写回本机库。
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

  // 点正文别处、栏位按钮或空白都收起词条卡与这次的选中态；点已收集的词不算。
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (target === null) return
      if (panelRef.current?.contains(target)) return
      if (target.closest('.reading-settings') !== null) return
      if (settingsButtonRef.current?.contains(target)) return
      if (entryIdOf(target) !== null) return
      setActiveSelection(null)
      setPanel(null)
      setHint(null)
      setCollectError(null)
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
                entryId: activeSelection.entryId,
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

  function updateEntryPanel(update: (panel: EntryPanel) => EntryPanel): void {
    setPanel((current) =>
      current !== null && current.kind === 'entry' ? update(current) : current
    )
  }

  function openEntryCard(entryId: string): void {
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
        updateEntryPanel((current) =>
          current.entryId === entryId
            ? { ...current, card, error: card === null ? '这个词条已经不在了。' : null }
            : current
        )
      },
      (error: unknown) => {
        updateEntryPanel((current) =>
          current.entryId === entryId ? { ...current, error: messageOf(error) } : current
        )
      }
    )
  }

  function collectCurrentSelection(): void {
    if (!view || collecting.current) return
    const read = readParagraphSelection(view.paragraphs)
    if (read === null) {
      if ((window.getSelection()?.toString().trim().length ?? 0) > 0) {
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
    updateEntryPanel((current) => ({
      ...current,
      deleting: true,
      error: null,
      confirmingDelete: false
    }))
    deleteEntrySentence(entrySentenceId).then(
      (result) => {
        if (result.status === 'missing') {
          updateEntryPanel((current) => ({
            ...current,
            deleting: false,
            error: '这条原句已经不在了。'
          }))
          return
        }

        if (result.articleId === view?.article.id) {
          setCollected(result.marks)
        }
        const entry = result.entry
        if (result.entryDeleted || entry === null) {
          setPanel(null)
          setActiveSelection(null)
          setHint('原句与这个词条已删除。')
          return
        }
        updateEntryPanel((current) =>
          current.card === null
            ? current
            : {
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
        )
      },
      (error: unknown) => {
        updateEntryPanel((current) => ({
          ...current,
          deleting: false,
          error: messageOf(error)
        }))
      }
    )
  }

  function requestDeleteSentence(entrySentenceId: string): void {
    if (panel === null || panel.kind !== 'entry' || panel.card === null) return
    if (panel.card.entry.sentenceCount <= 1) {
      updateEntryPanel((current) => ({ ...current, confirmingDelete: true }))
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
    const entryId = entryIdOf(event.target)
    if (entryId !== null) openEntryCard(entryId)
  }

  const handleBodyKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const entryId = entryIdOf(event.target)
    if (entryId === null) return
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
            updateEntryPanel((current) => ({ ...current, confirmingDelete: false }))
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
