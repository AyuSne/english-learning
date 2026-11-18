import type { ChatError } from './chat'
import type { ReadingPreferences } from './reading'
import type { ThemePreference } from './types'

/**
 * 设置页的跨层类型。密钥明文只在主进程里出现：渲染层提交新密钥，
 * 但读回来的永远只有掩码，保存与调用都在主进程解密。
 */

/** 一套配置的校验状态。只有「调用成功过」才配得上已验证。 */
export type ProfileVerification = 'verified' | 'unverified'

/** 上次校验没通过的原因；网络不通时不算密钥错。 */
export type ProfileCheckError = 'invalid-key' | 'invalid-config' | 'network'

export type ModelProfileSummary = {
  id: string
  name: string
  baseUrl: string
  model: string
  /** 已保存密钥的掩码；没填、或本机解不开时为 null。 */
  apiKeyMask: string | null
  verification: ProfileVerification
  lastError: ProfileCheckError | null
  /** 上次校验时间；断网也算校验过，界面据此说明为什么还是未验证。 */
  lastCheckedAt: string | null
  lastVerifiedAt: string | null
  /** 切换只影响之后的调用，所以这里只标「使用中」。 */
  active: boolean
}

/** 设置页一次读到的全部本机设置。 */
export type SettingsOverview = {
  profiles: ModelProfileSummary[]
  activeId: string | null
  /** 后续调用会用的模型名；没有可用配置时为空。 */
  activeModel: string
  reading: ReadingPreferences
  theme: ThemePreference
  appVersion: string
  electronVersion: string
  dataDirectory: string
  /** 上次手动备份；没备份过为 null。 */
  lastBackup: BackupSummary | null
  /** 恢复前自动留下的那份快照；没恢复过为 null。 */
  lastSnapshot: BackupSummary | null
  backupDirectory: string
  snapshotDirectory: string
}

export type SaveModelProfileRequest = {
  /** null = 新增；传已存在的 id = 编辑。 */
  id: string | null
  name: string
  baseUrl: string
  model: string
  /** 不传 = 保持原密钥；null = 清除；字符串 = 换新密钥（空白等同于清除）。 */
  apiKey?: string | null
}

/**
 * 保存配置的结果。`overview` 每次都带回，渲染层不用再为一次改动多读一遍。
 * 密钥没通过校验时 `status` 是 rejected，库里那份配置原样保留。
 */
export type SaveModelProfileResult = {
  status: 'saved' | 'rejected' | 'invalid' | 'missing' | 'encryption-unavailable'
  overview: SettingsOverview
  /** saved 时是新配置 id；rejected 时是原样保留的那份（新增被拒时为 null）。 */
  profileId?: string | null
  /** 出错的字段；`apiKey` 来自校验，`name` / `baseUrl` / `model` 来自必填校验。 */
  field?: 'apiKey' | 'name' | 'baseUrl' | 'model'
  error?: ChatError
}

export type ActivateModelProfileResult = {
  status: 'activated' | 'missing'
  overview: SettingsOverview
}

export type DeleteModelProfileResult = {
  status: 'deleted' | 'missing'
  overview: SettingsOverview
}

export type VerifyModelProfileResult = {
  status: 'verified' | 'invalid-key' | 'invalid-config' | 'unverified' | 'missing'
  overview: SettingsOverview
  error?: ChatError
}

export type SaveThemeRequest = {
  theme: ThemePreference
}

export type SaveThemeResult = {
  saved: boolean
  theme: ThemePreference
}

export type OpenDataDirectoryResult = {
  opened: boolean
  path: string
}

/** 手动备份与恢复前自动快照：两者都是整库副本，区别只在谁来触发。 */
export type BackupKind = 'manual' | 'before-restore'

/** 一次备份落成的文件；`exists` 是读设置时按文件系统重新确认的。 */
export type BackupSummary = {
  at: string
  file: string
  bytes: number
  kind: BackupKind
  exists: boolean
}

/** 恢复被拒的原因，界面据此说清楚为什么不能换。 */
export type RestoreRejection =
  | 'missing'
  | 'not-a-database'
  | 'not-a-library'
  | 'too-new'
  | 'damaged'
  | 'same-file'

/** 备份没写成的原因；`same-file` 指目标正好是本机资料库。 */
export type BackupFailure = 'same-file' | 'unknown'

export type CreateBackupResult =
  | { status: 'saved'; backup: BackupSummary; overview: SettingsOverview }
  | { status: 'cancelled'; overview: SettingsOverview }
  | { status: 'failed'; reason: BackupFailure; overview: SettingsOverview }

/** 「从备份恢复」第一步：弹出文件选择，并先看清那个文件能不能用。 */
export type PickRestoreResult =
  | { status: 'picked'; file: string; schemaVersion: number; bytes: number; createdAt: string }
  | { status: 'cancelled' }
  | { status: 'rejected'; reason: RestoreRejection }

/** 第二步：确认后整体替换；失败时是否已经退回恢复前，由 rolledBack 说清。 */
export type RestoreBackupResult =
  | { status: 'restored'; snapshot: BackupSummary; overview: SettingsOverview }
  | { status: 'rejected'; reason: RestoreRejection; overview: SettingsOverview }
  | {
      status: 'failed'
      snapshot: BackupSummary | null
      rolledBack: boolean
      overview: SettingsOverview
    }
