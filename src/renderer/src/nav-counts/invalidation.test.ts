import { describe, expect, it, vi } from 'vitest'
import {
  notifyNavCountsChanged,
  resetNavCountsInvalidationForTest,
  subscribeNavCountsInvalidated
} from './invalidation'

/**
 * 计数失效信号是渲染层里唯一的「可能变了」广播：写成功后发一次，
 * 订阅者各自决定怎么重查；没有订阅者时发信号也不能出错。
 */
describe('nav counts invalidation', () => {
  it('通知每个订阅者，退订后不再通知', () => {
    resetNavCountsInvalidationForTest()
    const first = vi.fn()
    const second = vi.fn()
    const offFirst = subscribeNavCountsInvalidated(first)
    subscribeNavCountsInvalidated(second)

    notifyNavCountsChanged()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    offFirst()
    notifyNavCountsChanged()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    resetNavCountsInvalidationForTest()
  })

  it('没有订阅者时发信号是空操作', () => {
    resetNavCountsInvalidationForTest()
    expect(() => notifyNavCountsChanged()).not.toThrow()
  })
})
