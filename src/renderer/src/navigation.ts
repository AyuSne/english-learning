import type { NavCountKey } from '../../shared/counts'
import type { Route } from './routes'

/**
 * 左侧全局栏的六项。顺序与产品说明一致。
 * `count` 指向全局栏要显示的计数：词条、文章库与对话（未归档钉住）。
 */
export const NAV_ITEMS: readonly {
  route: Route
  label: string
  count?: NavCountKey
}[] = [
  { route: 'home', label: '首页' },
  { route: 'reading', label: '阅读' },
  { route: 'entries', label: '词条', count: 'entries' },
  { route: 'chat', label: '对话', count: 'unfiled' },
  { route: 'library', label: '文章库', count: 'articles' },
  { route: 'settings', label: '设置' }
]
