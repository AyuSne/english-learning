import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ThemePreference } from '../../shared/types'

/**
 * 渲染层的主题偏好。启动时由 App 从 bootstrap 灌进来；设置页保存成功后
 * 调 setThemePreference，整棵界面立刻换色，不用重启。
 */
let preference: ThemePreference = 'light'
const listeners = new Set<() => void>()

function getThemePreference(): ThemePreference {
  return preference
}

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) {
    return
  }
  preference = next
  for (const listener of [...listeners]) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, getThemePreference)
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * 系统的深浅偏好。开着「跟随系统」时 Windows 切了主题，界面不用重启就跟着换。
 * 主进程会把 nativeTheme.themeSource 同步成同一偏好，所以这里的媒体查询与窗口一致。
 */
export function useSystemPrefersDark(): boolean {
  const [dark, setDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setDark(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return dark
}
