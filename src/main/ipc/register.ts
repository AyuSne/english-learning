import { IPC_CHANNELS, type IpcChannel } from '../../shared/ipc-contract'

export type IpcHandler = (payload: unknown) => unknown | Promise<unknown>

export type IpcHandlers = { [Channel in IpcChannel]: IpcHandler }

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, payload: unknown) => unknown
  ): void
}

/**
 * 把契约里的每个 channel 接到处理函数上。多注册、漏注册都直接抛错，
 * 让启动失败，而不是等界面点到那个 channel 才报错。
 */
export function registerIpcHandlers(ipc: IpcMainLike, handlers: IpcHandlers): void {
  const provided = Object.keys(handlers)
  const unknownChannels = provided.filter(
    (channel) => !IPC_CHANNELS.includes(channel as IpcChannel)
  )
  if (unknownChannels.length > 0) {
    throw new Error(`IPC 契约里没有这些 channel：${unknownChannels.join('、')}`)
  }

  const missingChannels = IPC_CHANNELS.filter(
    (channel) => !Object.prototype.hasOwnProperty.call(handlers, channel)
  )
  if (missingChannels.length > 0) {
    throw new Error(`IPC 契约里的 channel 缺少处理函数：${missingChannels.join('、')}`)
  }

  for (const channel of IPC_CHANNELS) {
    ipc.handle(channel, (_event, payload) => handlers[channel](payload))
  }
}
