/**
 * 渲染层的计数失效信号。写操作的统一 IPC 边界在成功返回后调用
 * notifyNavCountsChanged；计数的 store 订阅它并重查一次。
 * 这里不 import 任何 IPC 或 React，避免引用环，也方便单独测。
 */

type Listener = () => void

const listeners = new Set<Listener>()

export function subscribeNavCountsInvalidated(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 一次写成功只代表「可能变了」；没有订阅者时什么也不做。 */
export function notifyNavCountsChanged(): void {
  for (const listener of [...listeners]) listener()
}

/** 仅测试用：清掉跨用例残留的订阅。 */
export function resetNavCountsInvalidationForTest(): void {
  listeners.clear()
}
