/**
 * 覆盖层里的 Tab 循环。全局搜索与词条页学习内容抽屉共用同一套规则：
 * 收集可见可聚焦元素，Tab 到最后一个回到第一个，Shift+Tab 反向。
 * 规则只写一处，改边界行为不会两个覆盖层各漏一次。
 */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/** 覆盖层内当前可见的可聚焦元素，按 DOM 顺序。 */
export function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null
  )
}

/**
 * 这一次 Tab 应该把焦点送到哪里：在边界或焦点已经跑出覆盖层时返回循环目标，
 * 其余情况返回 null，让浏览器按正常顺序走。
 */
export function trapTabTarget(
  focusables: readonly HTMLElement[],
  active: Element | null,
  shiftKey: boolean,
  activeInside: boolean
): HTMLElement | null {
  if (focusables.length === 0) return null
  const first = focusables[0] as HTMLElement
  const last = focusables[focusables.length - 1] as HTMLElement
  if (shiftKey) {
    return active === first || !activeInside ? last : null
  }
  return active === last || !activeInside ? first : null
}
