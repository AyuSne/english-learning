import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { EntrySentence, ReadingCollectionMark } from '../../../shared/entries'
import type { DictionaryLookup } from '../../../shared/dictionary'
import type { CreateThreadRequest } from '../../../shared/threads'
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
  loadEntrySentenceTarget,
  loadWordEntryCard,
  openReadingView,
  reselectEntrySentence,
  saveReadingSettings,
  setEntryLater
} from '../api'
import { lookupDictionaryOrUnavailable } from '../dictionary/lookup'
import { getChatStore, openThreadForMain } from '../chat/store'
import { ErrorBlock } from '../components/error-block'
import { failureText } from '../errors'
import { laterMarkedNotice, laterUnmarkedNotice } from '../later/format'
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
import type { ReadingSource } from '../routes'

type ReadingPageProps = {
  articleId: string | null
  /** 从词条页跳过来时要定位的那条原句。 */
  entrySentenceId: string | null
  /** 定位的同时就把这条原句的范围换掉。 */
  reselect: boolean
  readingFrom: ReadingSource | null
}

/** 本次圈下的表达：先画麦色底，收下后再补上词条 id，点它可以打开词条卡。 */
type ActiveSelection = ReadingSelection & {
  entryId: string | null
  entryMainForm: string
}

/** 从词条页跳过来时的目标：把这一句滚到眼前、底色高亮，或就地换范围。 */
type FocusTarget = {
  entryId: string
  entryMainForm: string
  sentence: EntrySentence
  mode: 'highlight' | 'reselect'
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
export function ReadingPage({ articleId, entrySentenceId, reselect, readingFrom }: ReadingPageProps) {
  const [view, setView] = useState<ReadingView | null>(null)
  const [settings, setSettings] = useState<ReadingSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collected, setCollected] = useState<ReadingCollectionMark[]>([])
  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null)
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [focus, setFocus] = useState<FocusTarget | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [collectError, setCollectError] = useState<string | null>(null)
  const [openingThread, setOpeningThread] = useState(false)

  const { scrollRef, position, writeError, retryWrite } = useReadingPosition(view)
  const settingsRequest = useRef(0)
  /** 保存失败时留住「本来想存的那一份」，重试存的还是它，不是回退后的旧值。 */
  const failedPreferences = useRef<ReadingPreferences | null>(null)
  const settingsPanelRef = useRef<HTMLElement>(null)
  const settingsButtonRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const collectRequest = useRef(0)
  const collecting = useRef(false)

  useEffect(() => {
    if (articleId === null) {
      setView(null)
      setLoadError(null)
      setFocus(null)
      return
    }

    let active = true
    setView(null)
    setLoadError(null)
    setSettingsError(null)
    setCollected([])
    setActiveSelection(null)
    setPanel(null)
    setFocus(null)
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
        if (active) setLoadError(failureText(error, '这篇文章没有打开。'))
      }
    )

    if (entrySentenceId !== null) {
      loadEntrySentenceTarget(entrySentenceId).then(
        (target) => {
          if (!active) return
          if (target === null) {
            setHint('这条原句已经不在了。')
            return
          }
          setFocus({
            entryId: target.entry.id,
            entryMainForm: target.entry.mainForm,
            sentence: target.sentence,
            mode: reselect ? 'reselect' : 'highlight'
          })
        },
        (error: unknown) => {
          if (active) setHint(failureText(error, '这条原句没有读出来。'))
        }
      )
    }

    return () => {
      active = false
    }
  }, [articleId, entrySentenceId, reselect])

  // 从词条跳过来：把那一句滚到眼前。位置恢复了之后再做，免得被「上次读到」盖住。
  useEffect(() => {
    if (view === null || focus === null) return
    const container = scrollRef.current
    if (!container) return
    const target = Array.from(
      container.querySelectorAll<HTMLElement>('.reading-sentence')
    ).find(
      (element) =>
        element.dataset.paragraphId === focus.sentence.paragraphId &&
        element.dataset.sentenceOrdinal === String(focus.sentence.sentenceOrdinal)
    )
    if (!target) return
    const offset =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      container.clientHeight / 3
    container.scrollTop = Math.max(0, container.scrollTop + offset)
  }, [view, focus, scrollRef])

  // Esc 先取消词条定位，再关词条卡，再关设置，最后退回上一页。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (focus !== null) {
        setFocus(null)
        return
      }
      if (panel !== null) {
        setPanel(null)
        setActiveSelection(null)
        return
      }
      if (settingsOpen) {
        setSettingsOpen(false)
        return
      }
      goBack(readingFrom === 'library' || readingFrom === 'entries' ? readingFrom : 'home', {
        entrySentenceId: readingFrom === 'entries' ? entrySentenceId : null
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focus, panel, settingsOpen, readingFrom, entrySentenceId])

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

  // 点正文别处、栏位按钮或空白都收起词条卡与这次的选中态；点已收集的词、定位条或
  // 被定位的那一句不算，底色留着方便对照。
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null
      if (target === null) return
      if (panelRef.current?.contains(target)) return
      if (target.closest('.reading-settings') !== null) return
      if (settingsButtonRef.current?.contains(target)) return
      if (target.closest('.reading-context') !== null) return
      if (target.closest('.reading-sentence-focused') !== null) return
      if (entryIdOf(target) !== null) return
      setActiveSelection(null)
      setPanel(null)
      setHint(null)
      setCollectError(null)
      setFocus(null)
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
    failedPreferences.current = null
    persistPreferences(view.article.id, preferences, previous)
  }

  /** 保存失败后再存一次：重发上一次没写进去的那份值。 */
  function retryPreferences(): void {
    const preferences = failedPreferences.current
    if (!view || !settings || preferences === null) return
    setSettingsError(null)
    persistPreferences(view.article.id, preferences, settings)
  }

  function persistPreferences(
    articleId: string,
    preferences: ReadingPreferences,
    previous: ReadingSettings
  ): void {
    const request = settingsRequest.current + 1
    settingsRequest.current = request
    saveReadingSettings({ articleId, preferences }).then(
      (result: ReadingSettingsResult | null) => {
        if (request !== settingsRequest.current) return
        if (result === null) {
          setSettings(previous)
          failedPreferences.current = preferences
          setSettingsError('这篇的阅读设置没有记住。')
          return
        }
        setSettings(result.settings)
        if (!result.saved) {
          failedPreferences.current = preferences
          setSettingsError('这次阅读设置没有写入本机资料库。')
        } else {
          failedPreferences.current = null
        }
      },
      (error: unknown) => {
        if (request === settingsRequest.current) {
          setSettings(previous)
          failedPreferences.current = preferences
          setSettingsError(failureText(error, '这次阅读设置没有写入本机资料库。'))
        }
      }
    )
  }

  function updateEntryPanel(update: (panel: EntryPanel) => EntryPanel): void {
    setPanel((current) =>
      current !== null && current.kind === 'entry' ? update(current) : current
    )
  }

  /** 选词卡上的词典只认这一次圈下的词形，换词或关面板后到的结果直接丢掉。 */
  function updateCollectedDictionary(
    entryId: string,
    surface: string,
    dictionary: DictionaryLookup
  ): void {
    setPanel((current) =>
      current !== null &&
      current.kind === 'collected' &&
      current.entryId === entryId &&
      current.surface === surface
        ? { ...current, dictionary: { lookup: dictionary, loading: false } }
        : current
    )
  }

  function lookupCollectedWord(entryId: string, surface: string): void {
    lookupDictionaryOrUnavailable(surface).then((dictionary) =>
      updateCollectedDictionary(entryId, surface, dictionary)
    )
  }

  function openEntryCard(entryId: string, entrySentenceId: string | null): void {
    setActiveSelection(null)
    setHint(null)
    setPanel({
      kind: 'entry',
      entryId,
      entrySentenceId,
      card: null,
      error: null,
      confirmingDelete: false,
      deleting: false,
      laterBusy: false,
      laterNotice: null
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
          current.entryId === entryId
            ? { ...current, error: failureText(error, '这个词条没有读出来。') }
            : current
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

    if (focus !== null && focus.mode === 'reselect') {
      if (
        paragraph.id !== focus.sentence.paragraphId ||
        selection.sentenceOrdinal !== focus.sentence.sentenceOrdinal
      ) {
        setHint('重新圈定只在原句所在的这一句里换范围。')
        return
      }
      window.getSelection()?.removeAllRanges()
      collecting.current = true
      setHint(null)
      setCollectError(null)

      const request = collectRequest.current + 1
      collectRequest.current = request
      reselectEntrySentence({
        entrySentenceId: focus.sentence.id,
        start: selection.start,
        end: selection.end
      }).then(
        (result) => {
          if (request !== collectRequest.current) return
          collecting.current = false
          if (result.status === 'resaved') {
            setCollected(result.marks)
            setFocus({
              entryId: result.entry.id,
              entryMainForm: result.entry.mainForm,
              sentence: result.sentence,
              mode: 'highlight'
            })
            setHint(`已重新圈定为「${result.sentence.surface}」。`)
            return
          }
          if (result.status === 'missing') {
            setCollectError('这条原句已经不在了。')
            return
          }
          setCollectError(
            result.reason === 'empty'
              ? '圈中的内容不算一个词，再圈一次试试。'
              : '圈中的范围不在原句里，再圈一次试试。'
          )
        },
        (error: unknown) => {
          if (request !== collectRequest.current) return
          collecting.current = false
          setCollectError(`${failureText(error, '这次没有收进来')} 再圈一次试试。`)
        }
      )
      return
    }

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
          duplicate: result.status === 'duplicate',
          dictionary: { lookup: null, loading: true }
        })
        lookupCollectedWord(result.entry.id, result.sentence.surface)
      },
      (error: unknown) => {
        if (request !== collectRequest.current) return
        collecting.current = false
        setActiveSelection(null)
        setCollectError(failureText(error, '这次没有收进来，再圈一次试试。'))
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
                entrySentenceId:
                  current.entrySentenceId === entrySentenceId ? null : current.entrySentenceId,
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
          error: failureText(error, '这条原句没有删掉，再试一次。')
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

  /** 阅读词条卡上的「稍后看」：只写独立标记，卡片与首页共享同一份持久状态。 */
  function togglePanelLater(): void {
    if (panel === null || panel.kind !== 'entry' || panel.card === null || panel.laterBusy) {
      return
    }
    const entry = panel.card.entry
    const next = entry.laterMarkedAt === null
    updateEntryPanel((current) => ({ ...current, laterBusy: true, laterNotice: null }))
    setEntryLater({ entryId: entry.id, later: next }).then(
      (result) => {
        if (result.status === 'missing') {
          updateEntryPanel((current) => ({
            ...current,
            laterBusy: false,
            error: '这个词条已经不在了。'
          }))
          return
        }
        updateEntryPanel((current) =>
          current.card === null
            ? current
            : {
                ...current,
                laterBusy: false,
                laterNotice: next
                  ? laterMarkedNotice(entry.mainForm)
                  : laterUnmarkedNotice(entry.mainForm),
                card: {
                  ...current.card,
                  entry: {
                    ...current.card.entry,
                    laterMarkedAt: result.status === 'marked' ? result.markedAt : null
                  }
                }
              }
        )
      },
      (error: unknown) => {
        updateEntryPanel((current) => ({
          ...current,
          laterBusy: false,
          error: failureText(error, '稍后看没有改成功，再试一次。')
        }))
      }
    )
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

  async function openReadingThread(
    main: CreateThreadRequest['main'],
    forceNew = false
  ): Promise<void> {
    if (openingThread) return
    setOpeningThread(true)
    setCollectError(null)
    const threadId = await openThreadForMain(main, {
      forceNew,
      ensureSentenceContext: main.kind === 'sentence'
    })
    if (threadId === null) {
      setCollectError(getChatStore().error ?? '没能开线程，再试一次。')
      setOpeningThread(false)
    }
  }

  function sentenceIdOf(target: EventTarget | null, entryId: string): string | null {
    const sentence = (target as Element | null)?.closest<HTMLElement>('.reading-sentence')
    if (!sentence) return null
    return (
      collected.find(
        (mark) =>
          mark.entryId === entryId &&
          mark.paragraphId === sentence.dataset.paragraphId &&
          String(mark.sentenceOrdinal) === sentence.dataset.sentenceOrdinal
      )?.id ?? null
    )
  }

  const handleBodyClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const entryId = entryIdOf(event.target)
    if (entryId !== null) openEntryCard(entryId, sentenceIdOf(event.target, entryId))
  }

  const handleBodyKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const entryId = entryIdOf(event.target)
    if (entryId === null) return
    event.preventDefault()
    openEntryCard(entryId, sentenceIdOf(event.target, entryId))
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

  const backLabels: Record<ReadingSource, string> = {
    library: '文章库',
    home: '首页',
    entries: '词条',
    search: '搜索结果'
  }
  const backLabel = readingFrom === null ? '' : backLabels[readingFrom]
  const backFallback = readingFrom === 'library' || readingFrom === 'entries' ? readingFrom : 'home'

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
        <button
          type="button"
          className="reading-back"
          aria-label={`返回${backLabel}`}
          onClick={() => goBack(backFallback, {
            entrySentenceId: readingFrom === 'entries' ? entrySentenceId : null
          })}
        >
          <span aria-hidden="true">←</span> {backLabel || '返回'}
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
                disabled={openingThread}
                onClick={() =>
                  void openReadingThread({ kind: 'article', articleId: view.article.id })
                }
              >
                与这篇文章对话
              </button>
              <button
                type="button"
                className="reading-tool"
                aria-label="新开一条文章线程"
                disabled={openingThread}
                onClick={() =>
                  void openReadingThread({ kind: 'article', articleId: view.article.id }, true)
                }
              >
                新开一条
              </button>
              <button
                type="button"
                className="reading-tool"
                aria-pressed={settings.annotationsVisible}
                aria-label={settings.annotationsVisible ? '隐藏原文注释' : '显示原文注释'}
                onClick={() =>
                  updatePreferences({ annotationsVisible: !settings.annotationsVisible })
                }
              >
                注释：{settings.annotationsVisible ? '开' : '关'}
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
                    onRetry={retryPreferences}
                    panelRef={settingsPanelRef}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </header>

      {focus === null ? null : (
        <div className="reading-context" role="status">
          <p className="reading-context-text">
            {focus.mode === 'reselect'
              ? `重新圈定「${focus.entryMainForm}」· 在这一句里圈出正确范围`
              : `来自词条 ${focus.entryMainForm}`}
          </p>
          <div className="reading-context-actions">
            {focus.mode === 'reselect' ? (
              <button
                type="button"
                className="reading-tool"
                onClick={() => setFocus({ ...focus, mode: 'highlight' })}
              >
                取消重新圈定
              </button>
            ) : null}
            <button
              type="button"
              className="reading-tool"
              onClick={() => navigate('entries', { entryId: focus.entryId })}
            >
              回词条
            </button>
          </div>
        </div>
      )}

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
              <ErrorBlock
                className="reading-write-error"
                message={writeError}
                actionLabel="重试保存"
                onAction={retryWrite}
              />
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
                  focusedSentenceOrdinal={
                    focus !== null && focus.sentence.paragraphId === paragraph.id
                      ? focus.sentence.sentenceOrdinal
                      : null
                  }
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
          onOpenEntry={() => navigate('entries', { entryId: panel.entryId })}
          onClose={closePanel}
        />
      ) : (
        <EntryPanelView
          panel={panel}
          panelRef={panelRef}
          onClose={closePanel}
          onOpenEntry={() => navigate('entries', { entryId: panel.entryId })}
          onAsk={() => {
            if (panel.entrySentenceId !== null) {
              void openReadingThread({ kind: 'sentence', entrySentenceId: panel.entrySentenceId })
            }
          }}
          onAskNew={() => {
            if (panel.entrySentenceId !== null) {
              void openReadingThread({ kind: 'sentence', entrySentenceId: panel.entrySentenceId }, true)
            }
          }}
          openingThread={openingThread}
          onToggleLater={togglePanelLater}
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
