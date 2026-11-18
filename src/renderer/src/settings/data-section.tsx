import { useState } from 'react'
import type { SettingsOverview } from '../../../shared/settings'
import { openDataDirectory } from '../api'
import { messageOf } from '../errors'

/** 数据：本机资料库在哪、怎么打开；备份与恢复由后续 ticket 接在这里。 */
export function DataSection({
  overview,
  notify
}: {
  overview: SettingsOverview
  notify: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  async function open(): Promise<void> {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      const result = await openDataDirectory()
      notify(result.opened ? '已打开数据目录' : '没能打开数据目录')
    } catch (caught) {
      notify(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-data-title">
      <h2 id="settings-data-title">数据</h2>
      <p className="settings-desc">
        所有文章、词条、原句与学习内容都存在这台机器上。密钥用系统密钥库加密保存，
        不写明文。
      </p>

      <div className="data-card">
        <p className="data-card-title">本机资料库</p>
        <code className="data-path">{overview.dataDirectory}</code>
        <div className="settings-actions">
          <button
            type="button"
            className="button"
            onClick={() => void open()}
            disabled={busy}
          >
            {busy ? '正在打开…' : '打开数据目录'}
          </button>
        </div>
      </div>
    </section>
  )
}
