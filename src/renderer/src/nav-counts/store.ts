import type { NavCounts } from '../../../shared/counts'

/**
 * 全局栏计数的状态机。这里只管「什么时候重查、重查回来是什么」，
 * 不碰 React 也不碰 IPC：组件用 useSyncExternalStore 订阅它。
 *
 * 关键约束：
 * - 还没有读到过数字时状态是 loading（counts 为 null），界面不显示 0；
 * - 已经读到过数字后即使重查失败，也保留上一次的真实数字，不退回 0；
 * - 失效信号只表示「可能变了」，在飞期间的多次信号合并成一次补查。
 */

export type NavCountsState =
  | { status: 'loading'; counts: null }
  | { status: 'ready'; counts: NavCounts }
  | { status: 'error'; counts: NavCounts | null; error: string }

export type NavCountsStore = {
  getState(): NavCountsState
  subscribe(listener: () => void): () => void
  refresh(): Promise<void>
  dispose(): void
}

export type NavCountsStoreOptions = {
  load: () => Promise<NavCounts>
  /** 订阅「某次写成功，计数可能变了」；返回退订函数。 */
  subscribeInvalidation?: (listener: () => void) => () => void
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function createNavCountsStore(options: NavCountsStoreOptions): NavCountsStore {
  let state: NavCountsState = { status: 'loading', counts: null }
  const listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  let rerun = false
  let disposed = false

  function setState(next: NavCountsState): void {
    state = next
    for (const listener of [...listeners]) listener()
  }

  async function drain(): Promise<void> {
    do {
      rerun = false
      try {
        const counts = await options.load()
        if (disposed) return
        setState({ status: 'ready', counts })
      } catch (reason) {
        if (disposed) return
        const previous = state.counts
        setState({ status: 'error', counts: previous, error: messageOf(reason) })
      }
    } while (rerun && !disposed)
  }

  const unsubscribeInvalidation = options.subscribeInvalidation?.(() => {
    void refresh()
  })

  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (inFlight !== null) {
      rerun = true
      return inFlight
    }
    const run = drain().finally(() => {
      if (inFlight === run) inFlight = null
    })
    inFlight = run
    return run
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    refresh,
    dispose() {
      disposed = true
      unsubscribeInvalidation?.()
      listeners.clear()
      inFlight = null
    }
  }
}
