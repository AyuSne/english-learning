import { describe, expect, it } from 'vitest'
import type { ChatStreamUpdate } from '../shared/chat'
import type { AppBootstrap } from '../shared/types'
import { createBridge, type IpcRendererLike } from './bridge'

const bootstrap: AppBootstrap = {
  appVersion: '0.1.0',
  isPackaged: false,
  schemaVersion: 3,
  theme: 'light',
  chatModel: 'deepseek-flash',
  corpusImport: { total: 0, imported: 0, updated: 0, skipped: 0, failed: [] }
}

function fakeRenderer(): {
  ipc: IpcRendererLike
  listeners: Map<string, (event: unknown, payload: unknown) => void>
  invocations: Array<{ channel: string; payload: unknown }>
} {
  const listeners = new Map<string, (event: unknown, payload: unknown) => void>()
  const invocations: Array<{ channel: string; payload: unknown }> = []
  return {
    listeners,
    invocations,
    ipc: {
      async invoke(channel, payload) {
        invocations.push({ channel, payload })
        return bootstrap
      },
      on(channel, listener) {
        listeners.set(channel, listener)
      },
      removeListener(channel, listener) {
        if (listeners.get(channel) === listener) {
          listeners.delete(channel)
        }
      }
    }
  }
}

describe('createBridge', () => {
  it('把已知 channel 的请求转给主进程并返回结果', async () => {
    const { ipc, invocations } = fakeRenderer()

    const bridge = createBridge(ipc)

    await expect(bridge.invoke('app:bootstrap')).resolves.toEqual(bootstrap)
    expect(invocations).toEqual([{ channel: 'app:bootstrap', payload: undefined }])
  })

  it('按主对象查询及打开线程的请求可以经过白名单', async () => {
    const { ipc, invocations } = fakeRenderer()
    const bridge = createBridge(ipc)
    const main = { kind: 'entry', entryId: 'entry-1' } as const
    await bridge.invoke('chat:find-for-main', { main })
    await bridge.invoke('chat:open-for-main', { main, forceNew: true })
    expect(JSON.parse(JSON.stringify(invocations))).toEqual([
      { channel: 'chat:find-for-main', payload: { main } },
      { channel: 'chat:open-for-main', payload: { main, forceNew: true } }
    ])
  })

  it('未知 channel 立即报错，且不发给主进程', async () => {
    const { ipc, invocations } = fakeRenderer()
    const bridge = createBridge(ipc)

    await expect(bridge.invoke('app:unknown' as never)).rejects.toThrow('Unknown IPC channel')
    await expect(bridge.invoke(42 as never)).rejects.toThrow('Unknown IPC channel')
    expect(invocations).toHaveLength(0)
  })

  it('把事件载荷交给订阅者，取消订阅后不再监听', () => {
    const { ipc, listeners } = fakeRenderer()
    const bridge = createBridge(ipc)
    const received: ChatStreamUpdate[] = []

    const unsubscribe = bridge.subscribe('chat:event', (update) => received.push(update))
    const update: ChatStreamUpdate = {
      streamId: 'stream-1',
      event: { type: 'text', text: '正文' }
    }
    listeners.get('chat:event')?.({}, update)

    unsubscribe()

    expect(listeners.has('chat:event')).toBe(false)
    expect(received).toEqual([update])
  })

  it('未知事件 channel 立即报错，且不注册监听', () => {
    const { ipc, listeners } = fakeRenderer()
    const bridge = createBridge(ipc)

    expect(() => bridge.subscribe('chat:unknown' as never, () => undefined)).toThrow(
      'Unknown IPC event channel'
    )
    expect(listeners.size).toBe(0)
  })
})
