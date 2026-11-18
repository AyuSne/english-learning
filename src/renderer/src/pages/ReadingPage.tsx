import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from 'react'
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
import { openReadingView, saveReadingSettings } from '../api'
import { messageOf } from '../errors'
import { readingPointText } from '../library/format'
import { goBack, navigate } from '../navigate'
import { buildReadingBlocks, type ReadingBlock } from '../reading/content'
import { settingsLabel, settingsSourceLabel } from '../reading/settings-text'
import { useReadingPosition } from '../reading/use-reading-position'

type ReadingPageProps = {
  articleId: string | null
}

/**
 * 阅读页：收起全局栏，620 列宽正文居中，长篇匹配在段首标原卷字母。
 * 字号行距与注释开关按篇记住；注释在宽窗口走页边注，窄窗口行内展开。
 * 滚动时把最后读到的段落与句子写回本机库，下次从那里继续。
 */
export function ReadingPage({ articleId }: ReadingPageProps) {
  const [view, setView] = useState<ReadingView | null>(null)
  const [settings, setSettings] = useState<ReadingSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { scrollRef, position, writeError } = useReadingPosition(view)
  const settingsRequest = useRef(0)
  const settingsPanelRef = useRef<HTMLElement>(null)
  const settingsButtonRef = useRef<HTMLDivElement>(null)

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
    openReadingView(articleId).then(
      (value) => {
        if (!active) return
        if (value === null) {
          setLoadError('这篇文章已经不在库里了。')
          return
        }
        setView(value)
        setSettings(value.settings)
      },
      (error: unknown) => {
        if (active) setLoadError(messageOf(error))
      }
    )
    return () => {
      active = false
    }
  }, [articleId])

  // Esc 先关设置，再退回上一页。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (settingsOpen) {
        setSettingsOpen(false)
        return
      }
      goBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

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

  const blocks = useMemo(() => {
    if (!view) return []
    return view.paragraphs.map((paragraph) => ({
      paragraph,
      blocks: buildReadingBlocks(paragraph)
    }))
  }, [view])

  function updatePreferences(patch: Partial<ReadingPreferences>): void {
    if (!view || !settings) return
    const previous = settings
    const preferences: ReadingPreferences = {
      fontSize: patch.fontSize ?? settings.fontSize,
      lineHeight: patch.lineHeight ?? settings.lineHeight,
      annotationsVisible: patch.annotationsVisible ?? settings.annotationsVisible
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
            <div className={bodyClassName}>
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
      <p className="reading-paragraph">
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
              {block.parts.map((part, partIndex) =>
                part.kind === 'text' ? (
                  <span key={partIndex}>{part.text}</span>
                ) : (
                  <span
                    key={partIndex}
                    className="reading-annotated"
                    data-gloss={part.gloss}
                  >
                    {part.text}
                  </span>
                )
              )}
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
