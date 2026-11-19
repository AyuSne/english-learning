import { navigateFromGlobal } from '../navigate'
import { NAV_ITEMS } from '../navigation'
import type { Route } from '../routes'

export function GlobalNav({ route }: { route: Route }) {
  return (
    <aside className="globals">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          素
        </span>
        素读
      </div>
      <nav className="nav" aria-label="全局导航">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.route}
            type="button"
            className="nav-item"
            aria-current={item.route === route ? 'page' : undefined}
            onClick={() => navigateFromGlobal(item.route)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="nav-foot">离线可用 · 模型调用按设置</div>
    </aside>
  )
}
