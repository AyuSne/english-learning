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
