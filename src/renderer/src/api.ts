import type { AppBootstrap } from '../../shared/types'

export function loadBootstrap(): Promise<AppBootstrap> {
  return window.api.invoke('app:bootstrap')
}
