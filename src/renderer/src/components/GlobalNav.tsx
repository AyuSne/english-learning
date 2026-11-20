import { navigateFromGlobal } from '../navigate'
import { NAV_ITEMS } from '../navigation'
import { useNavCounts } from '../nav-counts/use-nav-counts'
import type { Route } from '../routes'

export function GlobalNav({ route }: { route: Route }) {
  const counts = useNavCounts().counts

  return (
    <aside className="globals">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          素
        </span>
        素读
      </div>
      <nav className="nav" aria-label="全局导航">
        {NAV_ITEMS.map((item) => {
          const value = item.count === undefined || counts === null ? null : counts[item.count]
          return (
            <button
              key={item.route}
              type="button"
              className="nav-item"
              aria-label={item.label}
              aria-current={item.route === route ? 'page' : undefined}
              aria-describedby={value === null ? undefined : `nav-count-${item.count}`}
              onClick={() => navigateFromGlobal(item.route)}
            >
              <span className="nav-label">{item.label}</span>
              {value === null ? null : (
                <span className="nav-count" data-nav-count={item.count} aria-hidden="true">
                  {value}
                </span>
              )}
            </button>
          )
        })}
        {/* 数字本身对读屏用户有意义，但不要把「词条 12」并进按钮的可访问名称。 */}
        {NAV_ITEMS.map((item) => {
          if (item.count === undefined || counts === null) return null
          return (
            <span
              key={item.count}
              id={`nav-count-${item.count}`}
              className="visually-hidden"
            >
              {`${item.label} ${counts[item.count]} 个`}
            </span>
          )
        })}
      </nav>
      <div className="nav-foot">离线可用 · 模型调用按设置</div>
    </aside>
  )
}
