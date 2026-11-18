import { useId, type RefObject } from 'react'
import type { ReadingPreferences, ReadingSettings } from '../../../shared/reading'
import {
  READING_FONT_SIZES,
  READING_LINE_HEIGHTS
} from '../../../shared/reading'
import { settingsLabel, settingsSourceLabel } from './settings-text'

/** 阅读设置面板：字号、行距、注释与弱高亮，附带当前值来自本篇还是全局。 */
export function ReadingSettingsPanel({
  settings,
  error,
  onChange,
  onRetry,
  panelRef
}: {
  settings: ReadingSettings
  error: string | null
  onChange: (patch: Partial<ReadingPreferences>) => void
  onRetry: () => void
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
        <div className="reading-settings-error" role="alert">
          <p className="reading-settings-error-text">{error}</p>
          <button type="button" className="button button-small" onClick={onRetry}>
            再存一次
          </button>
        </div>
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
