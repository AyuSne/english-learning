import type {
  ActivateModelProfileResult,
  DeleteModelProfileResult,
  ProfileCheckError,
  SaveModelProfileRequest,
  SaveModelProfileResult,
  SettingsOverview,
  VerifyModelProfileResult
} from '../../shared/settings'
import type { AppDatabase } from '../db/database'
import { readThemePreference } from '../db/settings'
import { readReadingPreferences } from '../reading/queries'
import { parseHttpUrl } from './base-url'
import {
  activateModelProfile,
  createModelProfile,
  deleteModelProfile,
  listModelProfiles,
  markProfileCheckFailed,
  markProfileCheckedVerified,
  readActiveProfileId,
  readModelProfile,
  readProfileApiKey,
  updateModelProfile,
  type ModelProfileRecord
} from './profiles'
import { SecretStorageUnavailableError, type SecretStore } from './secret-store'
import { failedCheckError, type VerifyOutcome, type VerifyModelProfileInput } from './verify'

/** 发最小请求的动作由调用方注入：生产走网络，测试用可控替身。 */
export type ProfileVerifier = (input: VerifyModelProfileInput) => Promise<VerifyOutcome>

export type OverviewOptions = {
  secrets: SecretStore
  /** 没有本机配置时，环境变量里的模型名仍是后续调用会用的那个。 */
  fallbackModel: string
  appVersion: string
  electronVersion: string
  dataDirectory: string
}

export type OperationOptions = OverviewOptions & {
  verify: ProfileVerifier
  now?: string
}

/** 设置页一次读到的全部值。 */
export function readSettingsOverview(
  database: AppDatabase,
  options: OverviewOptions
): SettingsOverview {
  const profiles = listModelProfiles(database, options.secrets)
  const active = profiles.find((profile) => profile.active) ?? null
  return {
    profiles,
    activeId: active?.id ?? null,
    activeModel: active?.model ?? options.fallbackModel,
    reading: readReadingPreferences(database),
    theme: readThemePreference(database),
    appVersion: options.appVersion,
    electronVersion: options.electronVersion,
    dataDirectory: options.dataDirectory
  }
}

type NormalizedProfile = {
  name: string
  baseUrl: string
  model: string
}

function normalizeProfile(
  request: SaveModelProfileRequest
): { ok: true; value: NormalizedProfile } | { ok: false; field: 'name' | 'baseUrl' | 'model' } {
  const name = request.name.trim()
  if (name === '') {
    return { ok: false, field: 'name' }
  }
  const baseUrl = request.baseUrl.trim()
  if (!isHttpUrl(baseUrl)) {
    return { ok: false, field: 'baseUrl' }
  }
  const model = request.model.trim()
  if (model === '') {
    return { ok: false, field: 'model' }
  }
  return { ok: true, value: { name, baseUrl, model } }
}

function isHttpUrl(value: string): boolean {
  return parseHttpUrl(value) !== null
}

type ProfileState = {
  verification: 'verified' | 'unverified'
  lastError: ProfileCheckError | null
  lastCheckedAt: string | null
  lastVerifiedAt: string | null
}

const emptyState: ProfileState = {
  verification: 'unverified',
  lastError: null,
  lastCheckedAt: null,
  lastVerifiedAt: null
}

function stateOf(record: ModelProfileRecord): ProfileState {
  return {
    verification: record.verification,
    lastError: record.lastError,
    lastCheckedAt: record.lastCheckedAt,
    lastVerifiedAt: record.lastVerifiedAt
  }
}

/**
 * 保存一套配置。填了新密钥就先发一次最小请求：
 *
 * - 校验通过 → 存为「已验证」；
 * - 密钥被拒（401 / 403）→ **不落库**，库里那份配置原样保留；
 * - 地址或模型名不对 → 同样不落库，错误指到对应字段；
 * - 断网、超时、限流或服务繁忙 → 允许保存，标「未验证」，下次成功调用自动转「已验证」。
 *
 * 不填密钥（编辑名称、地址或模型）不会发起校验，原密钥与状态都保留。
 */
export async function saveModelProfile(
  database: AppDatabase,
  request: SaveModelProfileRequest,
  options: OperationOptions
): Promise<SaveModelProfileResult> {
  const now = options.now ?? new Date().toISOString()
  const overview = () => readSettingsOverview(database, options)
  const normalized = normalizeProfile(request)
  if (!normalized.ok) {
    return { status: 'invalid', field: normalized.field, overview: overview() }
  }

  const existing = request.id === null ? null : readModelProfile(database, request.id)
  if (request.id !== null && existing === null) {
    return { status: 'missing', overview: overview() }
  }

  const keyGiven = request.apiKey !== undefined
  const normalizedKey = keyGiven ? (request.apiKey ?? '').trim() : ''
  const hasReplacement = keyGiven && normalizedKey !== ''

  let state: ProfileState
  if (hasReplacement) {
    const outcome = await options.verify({
      baseUrl: normalized.value.baseUrl,
      model: normalized.value.model,
      apiKey: normalizedKey
    })
    const failure = outcome.status === 'verified' ? null : failedCheckError(outcome)
    if (outcome.status === 'invalid-key' || outcome.status === 'invalid-config') {
      return {
        status: 'rejected',
        // 地址与模型名一起构成连接，服务端不告诉我们哪一个错，就不指到单个字段。
        ...(outcome.status === 'invalid-key' ? { field: 'apiKey' as const } : {}),
        error: outcome.error,
        profileId: existing?.id ?? null,
        overview: overview()
      }
    }
    state =
      failure === null
        ? {
            verification: 'verified',
            lastError: null,
            lastCheckedAt: now,
            lastVerifiedAt: now
          }
        : {
            verification: 'unverified',
            lastError: failure,
            lastCheckedAt: now,
            lastVerifiedAt: null
          }
  } else if (keyGiven) {
    // 用户明确清空密钥：没有密钥就谈不上已验证。
    state = emptyState
  } else {
    state = existing === null ? emptyState : stateOf(existing)
  }

  const keyPatch = hasReplacement ? normalizedKey : null

  try {
    if (existing === null) {
      const profileId = createModelProfile(
        database,
        {
          ...normalized.value,
          apiKey: keyPatch,
          ...state
        },
        { secrets: options.secrets, now }
      )
      return { status: 'saved', profileId, overview: overview() }
    }

    updateModelProfile(
      database,
      existing.id,
      {
        ...normalized.value,
        ...(keyGiven ? { apiKey: keyPatch } : {}),
        ...state
      },
      { secrets: options.secrets, now }
    )
    return { status: 'saved', profileId: existing.id, overview: overview() }
  } catch (error) {
    if (error instanceof SecretStorageUnavailableError) {
      return { status: 'encryption-unavailable', overview: overview() }
    }
    throw error
  }
}

/**
 * 「测试当前连接」：拿库里已保存的密钥再验一遍。
 * 暂时验不了（断网 / 限流 / 服务繁忙）时不改动状态，免得把已验证的配置降级。
 */
export async function verifySavedModelProfile(
  database: AppDatabase,
  profileId: string | null,
  options: OperationOptions
): Promise<VerifyModelProfileResult> {
  const now = options.now ?? new Date().toISOString()
  const overview = () => readSettingsOverview(database, options)
  const id = profileId ?? readActiveProfileId(database)
  const record = id === null ? null : readModelProfile(database, id)
  if (record === null) {
    return { status: 'missing', overview: overview() }
  }

  const apiKey = readProfileApiKey(record, options.secrets)
  const outcome = await options.verify({
    baseUrl: record.baseUrl,
    model: record.model,
    apiKey
  })

  if (outcome.status === 'verified') {
    markProfileCheckedVerified(database, record.id, now)
  } else if (outcome.status !== 'unverified') {
    // 断网 / 限流 / 服务繁忙只是暂时验不了，不把原来的状态降级。
    markProfileCheckFailed(database, record.id, failedCheckError(outcome), now)
  }

  return {
    status: outcome.status,
    overview: overview(),
    ...(outcome.status === 'verified' ? {} : { error: outcome.error })
  }
}

/** 切换「使用中」并带回整份设置，界面不用再读一遍。 */
export function activateProfile(
  database: AppDatabase,
  profileId: string,
  options: OverviewOptions
): ActivateModelProfileResult {
  const activated = activateModelProfile(database, profileId)
  return {
    status: activated ? 'activated' : 'missing',
    overview: readSettingsOverview(database, options)
  }
}

/** 删除一套配置并带回整份设置；删掉使用中的那套时不会有别的配置顶上来。 */
export function deleteProfile(
  database: AppDatabase,
  profileId: string,
  options: OverviewOptions
): DeleteModelProfileResult {
  const deleted = deleteModelProfile(database, profileId)
  return {
    status: deleted ? 'deleted' : 'missing',
    overview: readSettingsOverview(database, options)
  }
}
