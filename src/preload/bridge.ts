import {
  isIpcChannel,
  type IpcBridge,
  type IpcChannel,
  type IpcContract
} from '../shared/ipc-contract'

export interface IpcRendererLike {
  invoke(channel: string, payload?: unknown): Promise<unknown>
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
    }
  }
}
