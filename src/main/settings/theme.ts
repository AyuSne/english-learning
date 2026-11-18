import type { SaveThemeResult } from '../../shared/settings'
import { isThemePreference, type ThemePreference } from '../../shared/types'
import type { AppDatabase } from '../db/database'
import { readThemePreference, writeThemePreference } from '../db/settings'

/**
 * 记下主题偏好。只有三档认识的值才写入；不认识的值原样返回当前偏好，
 * 不让一次坏输入把设置清成默认。
 */
export function saveThemePreference(
  database: AppDatabase,
  theme: ThemePreference
): SaveThemeResult {
  if (!isThemePreference(theme)) {
    return { saved: false, theme: readThemePreference(database) }
  }
  writeThemePreference(database, theme)
  return { saved: true, theme }
}
