import { describe, expect, it } from 'vitest'
import type { AppBootstrap } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc-contract'
import { registerIpcHandlers, type IpcHandlers, type IpcMainLike } from './register'

const bootstrap: AppBootstrap = {
  appVersion: '0.1.0',
  isPackaged: false,
  schemaVersion: 1,
  theme: 'light'
}

function fakeIpcMain(): {
  ipc: IpcMainLike
  registered: Map<string, (event: unknown, payload: unknown) => unknown>
} {
  const registered = new Map<string, (event: unknown, payload: unknown) => unknown>()
  const ipc: IpcMainLike = {
    handle(channel, listener) {
      registered.set(channel, listener)
    }
  }
  return { ipc, registered }
}

describe('registerIpcHandlers', () => {
  it('按契约注册每个 channel，调用时转给对应处理函数', () => {
    const { ipc, registered } = fakeIpcMain()
    const received: unknown[] = []

    registerIpcHandlers(ipc, {
      'app:bootstrap': (payload) => {
        received.push(payload)
        return bootstrap
      }
    })

    expect([...registered.keys()].sort()).toEqual([...IPC_CHANNELS].sort())
    const listener = registered.get('app:bootstrap')
    expect(listener).toBeDefined()
    expect(listener?.({}, undefined)).toEqual(bootstrap)
    expect(received).toEqual([undefined])
  })

  it('契约里的 channel 没有处理函数时启动即报错', () => {
    const { ipc } = fakeIpcMain()

    expect(() => registerIpcHandlers(ipc, {} as unknown as IpcHandlers)).toThrow(/app:bootstrap/)
  })

  it('出现契约之外的 channel 时启动即报错', () => {
    const { ipc } = fakeIpcMain()
    const handlers = {
      'app:bootstrap': () => bootstrap,
      'app:not-in-contract': () => bootstrap
    } as unknown as IpcHandlers

    expect(() => registerIpcHandlers(ipc, handlers)).toThrow(/app:not-in-contract/)
  })
})
