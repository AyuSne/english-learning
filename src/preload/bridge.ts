import {
  isIpcChannel,
  isIpcEventChannel,
  type IpcBridge,
  type IpcChannel,
  type IpcContract,
  type IpcEventChannel,
  type IpcEventContract
} from '../shared/ipc-contract'

export interface IpcRendererLike {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  on(channel: string, listener: (event: unknown, payload: unknown) => void): void
  removeListener(channel: string, listener: (event: unknown, payload: unknown) => void): void
}

/**
 * 渲染层访问主进程的唯一入口。不在契约里的 channel 在这里就被拦下，
 * 不会发到主进程，也不会静默返回 undefined。
 */
export function createBridge(ipc: IpcRendererLike): IpcBridge {
  return {
    async invoke<C extends IpcChannel>(channel: C, payload?: IpcContract[C]['payload']) {
      if (!isIpcChannel(channel)) {
        throw new Error(`Unknown IPC channel: ${String(channel)}`)
      }
      return (await ipc.invoke(channel, payload)) as IpcContract[C]['result']
    },

    subscribe<E extends IpcEventChannel>(
      event: E,
      handler: (payload: IpcEventContract[E]) => void
    ): () => void {
      if (!isIpcEventChannel(event)) {
        throw new Error(`Unknown IPC event channel: ${String(event)}`)
      }
      const listener = (_event: unknown, payload: unknown): void => {
        handler(payload as IpcEventContract[E])
      }
      ipc.on(event, listener)
      return () => ipc.removeListener(event, listener)
    }
  }
}
