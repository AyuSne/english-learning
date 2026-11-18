import { randomUUID } from 'node:crypto'
import type {
  ModelProfileSummary,
  ProfileCheckError,
  ProfileVerification
} from '../../shared/settings'
import type { AppDatabase } from '../db/database'
import { readSetting, writeSetting } from '../db/settings'
import type { SecretStore } from './secret-store'

const ACTIVE_PROFILE_KEY = 'chat.activeProfileId'
const MASK_DOTS = '·············'

/** 库里的一行，密钥是密文。明文只在主进程内存里短暂出现。 */
export type ModelProfileRecord = {
  id: string
  name: string
  baseUrl: string
  model: string
  apiKeySecret: string | null
  verification: ProfileVerification
  lastError: ProfileCheckError | null
  lastCheckedAt: string | null
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateModelProfileInput = {
  name: string
  baseUrl: string
  model: string
  apiKey: string | null
  verification: ProfileVerification
  lastError: ProfileCheckError | null
  lastCheckedAt: string | null
  lastVerifiedAt: string | null
}

/** 编辑时只改传进来的字段；`apiKey` 不传就保持原密钥。 */
export type UpdateModelProfileInput = {
  name?: string
  baseUrl?: string
  model?: string
  apiKey?: string | null
  verification?: ProfileVerification
  lastError?: ProfileCheckError | null
  lastCheckedAt?: string | null
  lastVerifiedAt?: string | null
}

type ProfileRow = {
  id: string
  name: string
  base_url: string
  model: string
  api_key_secret: string | null
  verification: string
  last_error: string | null
  last_checked_at: string | null
  last_verified_at: string | null
  created_at: string
  updated_at: string
}

const PROFILE_COLUMNS = `id, name, base_url, model, api_key_secret, verification, last_error,
  last_checked_at, last_verified_at, created_at, updated_at`

function toRecord(row: ProfileRow): ModelProfileRecord {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    model: row.model,
    apiKeySecret: row.api_key_secret,
    verification: row.verification === 'verified' ? 'verified' : 'unverified',
    lastError:
      row.last_error === 'invalid-key' ||
      row.last_error === 'invalid-config' ||
      row.last_error === 'network'
        ? row.last_error
        : null,
    lastCheckedAt: row.last_checked_at,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * 密钥掩码：只留 `sk-` 前缀与末四位，中间固定一串点。
 * 短于五位的密钥连末四位也不留，避免掩码本身泄露全部内容。
 */
export function maskApiKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed === '') {
    return ''
  }
  const visible = trimmed.length > 4 ? trimmed.slice(-4) : ''
  const prefix = trimmed.startsWith('sk-') ? 'sk-' : ''
  return `${prefix}${MASK_DOTS}${visible}`
}

function encryptKey(apiKey: string | null, secrets: SecretStore): string | null {
  const trimmed = apiKey?.trim() ?? ''
  return trimmed === '' ? null : secrets.encrypt(trimmed)
}

function decryptKey(record: ModelProfileRecord, secrets: SecretStore): string {
  if (record.apiKeySecret === null) {
    return ''
  }
  return secrets.decrypt(record.apiKeySecret) ?? ''
}

/** 主进程内部用的明文密钥：只在发请求与显式校验时取，绝不进摘要。 */
export function readProfileApiKey(
  record: ModelProfileRecord,
  secrets: SecretStore
): string {
  return decryptKey(record, secrets)
}

export function readModelProfile(
  database: AppDatabase,
  id: string
): ModelProfileRecord | null {
  const row = database
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM model_profile WHERE id = ?`)
    .get(id) as ProfileRow | undefined
  return row ? toRecord(row) : null
}

/** 按新增顺序列出全部配置。 */
function readModelProfileRecords(database: AppDatabase): ModelProfileRecord[] {
  const rows = database
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM model_profile ORDER BY created_at, rowid`)
    .all() as ProfileRow[]
  return rows.map(toRecord)
}

/**
 * 使用中的配置 id。指向已经不存在的配置时当作没有，
 * 不把用户留在一个不存在的选择上。
 */
export function readActiveProfileId(database: AppDatabase): string | null {
  const stored = readSetting(database, ACTIVE_PROFILE_KEY)?.trim()
  if (!stored) {
    return null
  }
  return readModelProfile(database, stored) === null ? null : stored
}

function writeActiveProfileId(database: AppDatabase, id: string | null): void {
  writeSetting(database, ACTIVE_PROFILE_KEY, id ?? '')
}

function summarizeModelProfiles(
  records: readonly ModelProfileRecord[],
  secrets: SecretStore
): ModelProfileSummary[] {
  return records.map((record) => {
    const key = decryptKey(record, secrets)
    return {
      id: record.id,
      name: record.name,
      baseUrl: record.baseUrl,
      model: record.model,
      apiKeyMask: key === '' ? null : maskApiKey(key),
      verification: record.verification,
      lastError: record.lastError,
      lastCheckedAt: record.lastCheckedAt,
      lastVerifiedAt: record.lastVerifiedAt,
      active: false
    }
  })
}

/** 给界面看的列表：掩码、校验状态与哪一套在使用中。 */
export function listModelProfiles(
  database: AppDatabase,
  secrets: SecretStore
): ModelProfileSummary[] {
  const activeId = readActiveProfileId(database)
  return summarizeModelProfiles(readModelProfileRecords(database), secrets).map((profile) => ({
    ...profile,
    active: profile.id === activeId
  }))
}

/** 使用中的配置与它的明文密钥；没有配置时返回 null。 */
export function readActiveProfile(
  database: AppDatabase,
  secrets: SecretStore
): { profile: ModelProfileRecord; apiKey: string } | null {
  const id = readActiveProfileId(database)
  if (id === null) {
    return null
  }
  const profile = readModelProfile(database, id)
  if (profile === null) {
    return null
  }
  return { profile, apiKey: readProfileApiKey(profile, secrets) }
}

/** 新增一套配置。还没有使用中的配置时，新的这套直接成为使用中。 */
export function createModelProfile(
  database: AppDatabase,
  input: CreateModelProfileInput,
  options: { secrets: SecretStore; now?: string }
): string {
  const now = options.now ?? new Date().toISOString()
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO model_profile (
         id, name, base_url, model, api_key_secret, verification, last_error,
         last_checked_at, last_verified_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.name,
      input.baseUrl,
      input.model,
      encryptKey(input.apiKey, options.secrets),
      input.verification,
      input.lastError,
      input.lastCheckedAt,
      input.lastVerifiedAt,
      now,
      now
    )

  if (readActiveProfileId(database) === null) {
    writeActiveProfileId(database, id)
  }
  return id
}

/** 编辑一套配置；不存在时返回 false。 */
export function updateModelProfile(
  database: AppDatabase,
  id: string,
  input: UpdateModelProfileInput,
  options: { secrets: SecretStore; now?: string }
): boolean {
  const current = readModelProfile(database, id)
  if (current === null) {
    return false
  }
  const now = options.now ?? new Date().toISOString()
  const apiKeySecret =
    input.apiKey === undefined
      ? current.apiKeySecret
      : encryptKey(input.apiKey, options.secrets)

  database
    .prepare(
      `UPDATE model_profile SET
         name = ?, base_url = ?, model = ?, api_key_secret = ?, verification = ?,
         last_error = ?, last_checked_at = ?, last_verified_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.name ?? current.name,
      input.baseUrl ?? current.baseUrl,
      input.model ?? current.model,
      apiKeySecret,
      input.verification ?? current.verification,
      input.lastError === undefined ? current.lastError : input.lastError,
      input.lastCheckedAt === undefined ? current.lastCheckedAt : input.lastCheckedAt,
      input.lastVerifiedAt === undefined ? current.lastVerifiedAt : input.lastVerifiedAt,
      now,
      id
    )
  return true
}

/**
 * 删除一套配置。删掉的正好是使用中的那套时，把「使用中」清空，
 * 让用户自己挑下一套；不静默替他选一套。
 */
export function deleteModelProfile(database: AppDatabase, id: string): boolean {
  const record = readModelProfile(database, id)
  if (record === null) {
    return false
  }
  const wasActive = readActiveProfileId(database) === id
  database.prepare('DELETE FROM model_profile WHERE id = ?').run(id)

  if (wasActive) {
    writeActiveProfileId(database, null)
  }
  return true
}

/** 切换使用中的配置；这套不存在时不改。 */
export function activateModelProfile(database: AppDatabase, id: string): boolean {
  if (readModelProfile(database, id) === null) {
    return false
  }
  writeActiveProfileId(database, id)
  return true
}

/**
 * 一次成功调用之后自动转「已验证」。这里不写上次校验时间：
 * 那是对「测试连接」这类显式校验的记时，成功调用只证明密钥此刻可用。
 */
export function markProfileVerified(
  database: AppDatabase,
  id: string,
  now = new Date().toISOString()
): void {
  database
    .prepare(
      `UPDATE model_profile SET verification = 'verified', last_error = NULL,
         last_verified_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(now, now, id)
}

/** 显式校验失败：记下时间与原因，状态回到未验证。 */
export function markProfileCheckFailed(
  database: AppDatabase,
  id: string,
  error: ProfileCheckError,
  now = new Date().toISOString()
): void {
  database
    .prepare(
      `UPDATE model_profile SET verification = 'unverified', last_error = ?,
         last_checked_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(error, now, now, id)
}

/** 显式校验通过：记下时间与结果，清掉上次的错误。 */
export function markProfileCheckedVerified(
  database: AppDatabase,
  id: string,
  now = new Date().toISOString()
): void {
  database
    .prepare(
      `UPDATE model_profile SET verification = 'verified', last_error = NULL,
         last_checked_at = ?, last_verified_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(now, now, now, id)
}
