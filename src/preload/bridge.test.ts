import { describe, expect, it } from 'vitest'
import type { AppBootstrap } from '../shared/types'
import { createBridge, type IpcRendererLike } from './bridge'

const bootstrap: AppBootstrap = {
  appVersion: '0.1.0',
  isPackaged: false,
  schemaVersion: 1,
  theme: 'light'
}

describe('createBridge', () => {
  it('把已知 channel 的请求转给主进程并返回结果', async () => {
    const calls: Array<{ channel: string; payload: unknown }> = []
    const ipc: IpcRendererLike = {
      async invoke(channel, payload) {
        calls.push({ channel, payload })
        return bootstrap
      }
    }

    const bridge = createBridge(ipc)

    await expect(bridge.invoke('app:bootstrap')).resolves.toEqual(bootstrap)
    expect(calls).toEqual([{ channel: 'app:bootstrap', payload: undefined }])
  })

  it('未知 channel 立即报错，且不发给主进程', async () => {
    let ipcCalls = 0
    const bridge = createBridge({
      async invoke() {
        ipcCalls += 1
        return undefined
      }
    })

    await expect(bridge.invoke('app:unknown' as never)).rejects.toThrow('Unknown IPC channel')
    await expect(bridge.invoke(42 as never)).rejects.toThrow('Unknown IPC channel')
    expect(ipcCalls).toBe(0)
  })
})
