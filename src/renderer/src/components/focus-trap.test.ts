import { describe, expect, it } from 'vitest'
import { trapTabTarget } from './focus-trap'

/**
 * Tab 循环只做边界判断：在最后一个继续 Tab、在第一个反向 Shift+Tab、
 * 焦点已经跑到容器外时拉回来，其余交给浏览器。
 */

const first = { id: 'first' } as unknown as HTMLElement
const middle = { id: 'middle' } as unknown as HTMLElement
const last = { id: 'last' } as unknown as HTMLElement
const outside = { id: 'outside' } as unknown as HTMLElement
const focusables = [first, middle, last]

describe('trapTabTarget', () => {
  it('正向在最后一个回到第一个，其余不拦', () => {
    expect(trapTabTarget(focusables, last, false, true)).toBe(first)
    expect(trapTabTarget(focusables, first, false, true)).toBeNull()
    expect(trapTabTarget(focusables, middle, false, true)).toBeNull()
  })

  it('反向在第一个跳到最后一个', () => {
    expect(trapTabTarget(focusables, first, true, true)).toBe(last)
    expect(trapTabTarget(focusables, last, true, true)).toBeNull()
  })

  it('焦点已经跑出容器时拉回边界', () => {
    expect(trapTabTarget(focusables, outside, false, false)).toBe(first)
    expect(trapTabTarget(focusables, outside, true, false)).toBe(last)
  })

  it('没有可聚焦元素时什么都不做', () => {
    expect(trapTabTarget([], outside, false, false)).toBeNull()
  })
})
