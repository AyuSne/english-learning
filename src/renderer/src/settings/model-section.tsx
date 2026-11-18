import { useState, type FormEvent } from 'react'
import type {
  ModelProfileSummary,
  SettingsOverview
} from '../../../shared/settings'
import {
  activateModelProfile,
  deleteModelProfile,
  saveModelProfile,
  verifyModelProfile
} from '../api'
import { messageOf } from '../errors'
import {
  checkText,
  profileSaveErrorText,
  verificationText,
  verifyResultText
} from './format'

type Draft = {
  id: string | null
  name: string
  baseUrl: string
  model: string
  apiKeyMask: string | null
  /** 编辑已保存的配置时先只显示掩码；点「重新输入」才出现输入框。 */
  keyEditing: boolean
  apiKey: string
}

const NEW_DRAFT: Draft = {
  id: null,
  name: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  apiKeyMask: null,
  keyEditing: true,
  apiKey: ''
}

type FormError = { field: 'name' | 'baseUrl' | 'model' | 'apiKey' | null; message: string }

/** 模型服务：多套配置的列表、切换、编辑、删除与连接测试。 */
export function ModelSection({
  overview,
  onChange,
  notify
}: {
  overview: SettingsOverview
  onChange: (overview: SettingsOverview) => void
  notify: (message: string) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<FormError | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  function beginNew(): void {
    setError(null)
    setDraft({ ...NEW_DRAFT })
  }

  function beginEdit(profile: ModelProfileSummary): void {
    setError(null)
    setDeleting(null)
    setDraft({
      id: profile.id,
      name: profile.name,
      baseUrl: profile.baseUrl,
      model: profile.model,
      apiKeyMask: profile.apiKeyMask,
      keyEditing: false,
      apiKey: ''
    })
  }

  function closeDraft(): void {
    if (busy) {
      return
    }
    setDraft(null)
    setError(null)
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (draft === null || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await saveModelProfile({
        id: draft.id,
        name: draft.name,
        baseUrl: draft.baseUrl,
        model: draft.model,
        ...(draft.keyEditing ? { apiKey: draft.apiKey } : {})
      })
      onChange(result.overview)
      const failure = profileSaveErrorText(result)
      if (failure === null) {
        setDraft(null)
        notify('已保存')
        return
      }
      setError({ field: result.field ?? null, message: failure })
    } catch (caught) {
      setError({ field: null, message: messageOf(caught) })
    } finally {
      setBusy(false)
    }
  }

  async function activate(id: string): Promise<void> {
    try {
      const result = await activateModelProfile(id)
      onChange(result.overview)
      notify(result.status === 'activated' ? '已切换，下一次调用起生效' : '这套配置已经不在了')
    } catch (caught) {
      notify(messageOf(caught))
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      const result = await deleteModelProfile(id)
      setDeleting(null)
      onChange(result.overview)
      notify(result.status === 'deleted' ? '已删除' : '这套配置已经不在了')
    } catch (caught) {
      notify(messageOf(caught))
    }
  }

  async function testActive(): Promise<void> {
    if (testing) {
      return
    }
    setTesting(true)
    try {
      const result = await verifyModelProfile(null)
      onChange(result.overview)
      notify(verifyResultText(result.status))
    } catch (caught) {
      notify(messageOf(caught))
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className="settings-section" aria-labelledby="settings-model-title">
      <h2 id="settings-model-title">模型服务</h2>
      <p className="settings-desc">
        填写 OpenAI 兼容接口。可以保存多套，随时切换；切换只影响之后的调用。
      </p>

      {overview.profiles.length === 0 ? (
        <p className="settings-empty">还没有配置。新增一套之后就能开始对话。</p>
      ) : (
        <ul className="profile-list">
          {overview.profiles.map((profile) => (
            <li
              key={profile.id}
              className={profile.active ? 'profile-card is-active' : 'profile-card'}
            >
              <div className="profile-head">
                <b className="profile-name">{profile.name}</b>
                {profile.active ? <span className="profile-chip is-current">使用中</span> : null}
                <span
                  className={
                    profile.verification === 'verified'
                      ? 'profile-chip is-verified'
                      : 'profile-chip'
                  }
                >
                  {verificationText(profile)}
                </span>
                <div className="profile-actions">
                  {profile.active ? null : (
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`切换到 ${profile.name}`}
                      onClick={() => void activate(profile.id)}
                    >
                      切换
                    </button>
                  )}
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`编辑 ${profile.name}`}
                    onClick={() => beginEdit(profile)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="link-button is-danger"
                    aria-label={`删除 ${profile.name}`}
                    onClick={() => setDeleting(profile.id)}
                  >
                    删除
                  </button>
                </div>
              </div>

              <dl className="profile-facts">
                <div>
                  <dt>接口地址</dt>
                  <dd>
                    <code>{profile.baseUrl}</code>
                  </dd>
                </div>
                <div>
                  <dt>模型名</dt>
                  <dd>
                    <code>{profile.model}</code>
                  </dd>
                </div>
                <div>
                  <dt>密钥</dt>
                  <dd>
                    <code>{profile.apiKeyMask ?? '未填写'}</code>
                  </dd>
                </div>
              </dl>
              <p className="profile-check">{checkText(profile)}</p>

              {deleting === profile.id ? (
                <div className="profile-confirm" role="alert">
                  <span>删除「{profile.name}」？</span>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setDeleting(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => void remove(profile.id)}
                  >
                    确认删除
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="settings-actions">
        <button type="button" className="button" onClick={beginNew}>
          ＋ 新增一套
        </button>
        <button
          type="button"
          className="button"
          onClick={() => void testActive()}
          disabled={overview.activeId === null || testing}
        >
          {testing ? '正在测试…' : '测试当前连接'}
        </button>
      </div>

      {draft === null ? null : (
        <form className="profile-form" onSubmit={(event) => void submit(event)}>
          <h3>{draft.id === null ? '新增一套配置' : `编辑「${draft.name || '配置'}」`}</h3>

          <label className="settings-field">
            <span>名称</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="DeepSeek 官方"
            />
          </label>
          {error?.field === 'name' ? (
            <p className="field-error" role="alert">
              {error.message}
            </p>
          ) : null}

          <label className="settings-field">
            <span>接口地址</span>
            <input
              value={draft.baseUrl}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              placeholder="https://api.deepseek.com"
            />
          </label>
          {error?.field === 'baseUrl' ? (
            <p className="field-error" role="alert">
              {error.message}
            </p>
          ) : null}

          <label className="settings-field">
            <span>模型名</span>
            <input
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              placeholder="deepseek-flash"
            />
          </label>
          {error?.field === 'model' ? (
            <p className="field-error" role="alert">
              {error.message}
            </p>
          ) : null}

          <div className="settings-field">
            <span>API 密钥</span>
            {draft.keyEditing ? (
              <>
                <input
                  type="password"
                  aria-label="API 密钥"
                  value={draft.apiKey}
                  onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                  placeholder="sk-…（本地模型可以留空）"
                  autoComplete="off"
                />
                <p className="field-hint">
                  保存前会发一次最小请求校验；断网时可以先存成「未验证」，下次调用成功会自动改成「已验证」。
                </p>
                {draft.apiKeyMask === null ? null : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      setDraft({ ...draft, keyEditing: false, apiKey: '' })
                    }
                  >
                    取消重输
                  </button>
                )}
              </>
            ) : (
              <div className="key-mask-row">
                <code>{draft.apiKeyMask ?? '未填写'}</code>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => setDraft({ ...draft, keyEditing: true })}
                >
                  重新输入
                </button>
              </div>
            )}
            {error?.field === 'apiKey' ? (
              <p className="field-error" role="alert">
                {error.message}
              </p>
            ) : null}
          </div>

          {error !== null && error.field === null ? (
            <p className="field-error" role="alert">
              {error.message}
            </p>
          ) : null}

          <div className="settings-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              {busy
                ? '正在保存…'
                : draft.keyEditing
                  ? '保存并校验'
                  : '保存'}
            </button>
            <button
              type="button"
              className="button"
              onClick={closeDraft}
              disabled={busy}
            >
              取消
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
