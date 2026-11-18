import type { Route } from './routes'

/**
 * 左侧全局栏的六项。顺序与产品说明一致。
 */
export const NAV_ITEMS: readonly { route: Route; label: string }[] = [
  { route: 'home', label: '首页' },
  { route: 'reading', label: '阅读' },
  { route: 'entries', label: '词条' },
  { route: 'chat', label: '对话' },
  { route: 'library', label: '文章库' },
  { route: 'settings', label: '设置' }
]
