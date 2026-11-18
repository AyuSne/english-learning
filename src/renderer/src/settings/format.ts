import type { ReadingPreferences } from '../../../shared/reading'
import type {
  ModelProfileSummary,
  SaveModelProfileResult,
  VerifyModelProfileResult
} from '../../../shared/settings'
import type { ThemePreference } from '../../../shared/types'

/** 设置页的显示逻辑：把配置状态与表单结果翻成中文。 */

export function verificationText(profile: ModelProfileSummary): '已验证' | '未验证' {
  return profile.verification === 'verified' ? '已验证' : '未验证'
}

/** 卡片上那句「上次校验 …」。 */
export function checkText(profile: ModelProfileSummary): string {
  if (profile.lastCheckedAt === null && profile.lastVerifiedAt === null) {
    return '还没校验过'
  }
  if (profile.verification === 'verified') {
    // 成功调用也会自动转已验证，这时用真正证实密钥可用的那个时刻。
    const moment = formatMoment(profile.lastVerifiedAt ?? profile.lastCheckedAt ?? '')
    return moment === '' ? '已验证' : `上次校验 ${moment} 通过`
  }
  const moment = formatMoment(profile.lastCheckedAt ?? '')
  const reason =
    profile.lastError === 'invalid-key'
      ? '密钥无效'
      : profile.lastError === 'invalid-config'
        ? '接口地址或模型名不对'
        : '未能完成'
  return `上次校验 ${moment} 未通过 · ${reason}`
}

/** 时间按本机时区写成 年-月-日 时:分；坏值不假装成时间。 */
export function formatMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day} ${hour}:${minute}`
}

export function themeText(theme: ThemePreference): string {
  return theme === 'dark' ? '深色' : theme === 'system' ? '跟随系统' : '浅色'
}

export function readingDefaultsText(preferences: ReadingPreferences): string {
  const annotations = preferences.annotationsVisible ? '注释显示' : '注释隐藏'
  const weak = preferences.weakHighlight ? '弱高亮开' : '弱高亮关'
  return `字号 ${preferences.fontSize} · 行距 ${preferences.lineHeight.toFixed(1)} · ${annotations} · ${weak}`
}

export function verifyResultText(
  status: VerifyModelProfileResult['status']
): string {
  switch (status) {
    case 'verified':
      return '连接正常'
    case 'invalid-key':
      return '密钥无效'
    case 'invalid-config':
      return '接口地址或模型名不对'
    case 'unverified':
      return '暂时连不上，稍后再试'
    case 'missing':
      return '这套配置已经不在了'
  }
}

/** 保存配置失败时给表单的一句话；成功返回 null。 */
export function profileSaveErrorText(result: SaveModelProfileResult): string | null {
  switch (result.status) {
    case 'saved':
      return null
    case 'invalid':
      return result.field === 'name'
        ? '名称不能为空'
        : result.field === 'baseUrl'
          ? '接口地址要以 http:// 或 https:// 开头'
          : '模型名不能为空'
    case 'rejected':
      if (result.field === 'apiKey') {
        return result.profileId === null || result.profileId === undefined
          ? '密钥无效，没有保存。'
          : '密钥无效，没有保存；原密钥仍然保留。'
      }
      return '接口地址或模型名不对，没有保存。'
    case 'encryption-unavailable':
      return '本机无法加密保存密钥。'
    case 'missing':
      return '这套配置已经不在了。'
  }
}
