import { describe, expect, it } from 'vitest'
import type { ChatStartResult, ChatStopResult } from '../../shared/chat'
import type { AppBootstrap } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc-contract'
import {
  registerIpcHandlers,
  type IpcHandlers,
  type IpcInvokeEvent,
  type IpcMainLike
} from './register'

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

function chatHandlers() {
  return {
    'chat:start': (): ChatStartResult => ({ accepted: true }),
    'chat:stop': (): ChatStopResult => ({ stopped: false })
  }
}

describe('registerIpcHandlers', () => {
  it('按契约注册每个 channel，调用时转给对应处理函数并传入调用事件', () => {
    const { ipc, registered } = fakeIpcMain()
    const received: unknown[] = []
    const events: IpcInvokeEvent[] = []

    registerIpcHandlers(ipc, {
      ...chatHandlers(),
      'app:bootstrap': (payload, event) => {
        received.push(payload)
        events.push(event)
        return bootstrap
      }
    })

    expect([...registered.keys()].sort()).toEqual([...IPC_CHANNELS].sort())
    const listener = registered.get('app:bootstrap')
    expect(listener).toBeDefined()
    const event: IpcInvokeEvent = { sender: { send() {} } }
    expect(listener?.(event, undefined)).toEqual(bootstrap)
    expect(received).toEqual([undefined])
    expect(events).toEqual([event])
  })

  it('契约里的 channel 没有处理函数时启动即报错', () => {
    const { ipc } = fakeIpcMain()

    expect(() =>
      registerIpcHandlers(ipc, { ...chatHandlers() } as unknown as IpcHandlers)
    ).toThrow(/app:bootstrap/)
  })

  it('出现契约之外的 channel 时启动即报错', () => {
    const { ipc } = fakeIpcMain()
    const handlers = {
      ...chatHandlers(),
      'app:bootstrap': () => bootstrap,
      'app:not-in-contract': () => bootstrap
    } as unknown as IpcHandlers

    expect(() => registerIpcHandlers(ipc, handlers)).toThrow(/app:not-in-contract/)
  })
})
