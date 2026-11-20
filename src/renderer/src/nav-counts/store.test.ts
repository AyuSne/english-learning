import { describe, expect, it, vi } from 'vitest'
import type { NavCounts } from '../../../shared/counts'
import { createNavCountsStore } from './store'

/**
 * 全局栏计数 store：加载中必须是「还没有数字」而不是 0；
 * 写成功的失效信号要能重查，连续多次失效只补查一次，不轮询。
 */

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const ZERO: NavCounts = { entries: 0, articles: 2, unfiled: 0 }

describe('createNavCountsStore', () => {
  it('初始是加载态、没有数字；读到后变成 ready', async () => {
    const store = createNavCountsStore({ load: async () => ZERO })
    expect(store.getState()).toEqual({ status: 'loading', counts: null })

    await store.refresh()
    expect(store.getState()).toEqual({ status: 'ready', counts: ZERO })
  })

  it('失效信号触发重查；在飞期间的多次失效合并成一次补查', async () => {
    let notify: () => void = () => undefined
    const pending: ReturnType<typeof deferred<NavCounts>>[] = []
    const load = vi.fn(() => {
      const next = deferred<NavCounts>()
      pending.push(next)
      return next.promise
    })
    const store = createNavCountsStore({
      load,
      subscribeInvalidation: (listener) => {
        notify = listener
        return () => {
          notify = () => undefined
        }
      }
    })

    const first = store.refresh()
    expect(load).toHaveBeenCalledTimes(1)

    // 第一次还没回来时连发三次失效：只应多查一次。
    notify()
    notify()
    notify()
    pending[0]!.resolve(ZERO)
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(store.getState()).toEqual({ status: 'ready', counts: ZERO })

    pending[1]!.resolve({ entries: 1, articles: 2, unfiled: 3 })
    await first
    expect(store.getState()).toEqual({
      status: 'ready',
      counts: { entries: 1, articles: 2, unfiled: 3 }
    })
  })

  it('首次读取失败时保留加载态语义：不把 0 当结果，重试成功后恢复', async () => {
    const load = vi
      .fn<() => Promise<NavCounts>>()
      .mockRejectedValueOnce(new Error('读不出来'))
      .mockResolvedValueOnce({ entries: 3, articles: 2, unfiled: 1 })
    let notify: () => void = () => undefined
    const store = createNavCountsStore({
      load,
      subscribeInvalidation: (listener) => {
        notify = listener
        return () => undefined
      }
    })

    await store.refresh()
    expect(store.getState()).toMatchObject({ status: 'error', counts: null })

    notify()
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(store.getState()).toEqual({
        status: 'ready',
        counts: { entries: 3, articles: 2, unfiled: 1 }
      })
    )
  })

  it('已有数字后重查失败，仍保留上一次的真实数字', async () => {
    const load = vi
      .fn<() => Promise<NavCounts>>()
      .mockResolvedValueOnce(ZERO)
      .mockRejectedValueOnce(new Error('网络没有，但这是本机库'))
    let notify: () => void = () => undefined
    const store = createNavCountsStore({
      load,
      subscribeInvalidation: (listener) => {
        notify = listener
        return () => undefined
      }
    })
    await store.refresh()

    notify()
    await vi.waitFor(() =>
      expect(store.getState()).toMatchObject({ status: 'error', counts: ZERO })
    )
  })

  it('订阅者收到状态变化；dispose 后退订，不再响应失效', async () => {
    const load = vi.fn(async () => ZERO)
    let invalidationListener: (() => void) | null = null
    const store = createNavCountsStore({
      load,
      subscribeInvalidation: (listener) => {
        invalidationListener = listener
        return () => {
          invalidationListener = null
        }
      }
    })
    const listener = vi.fn()
    store.subscribe(listener)
    await store.refresh()
    expect(listener).toHaveBeenCalled()

    store.dispose()
    expect(invalidationListener).toBeNull()
    listener.mockClear()
    await store.refresh()
    expect(listener).not.toHaveBeenCalled()
  })
})
