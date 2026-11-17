import type {
  IpcChannel,
  IpcContract,
  IpcEventChannel,
  IpcEventContract
} from '../../shared/ipc-contract'
import { IPC_CHANNELS } from '../../shared/ipc-contract'

/**
 * 主进程处理函数能拿到的调用方信息：对话流事件直接推回发起请求的那个窗口。
 * `send` 的 channel 与载荷都从事件契约推导，避免在调用处硬编码字符串。
 */
export interface IpcInvokeEvent {
  sender: {
    send<C extends IpcEventChannel>(channel: C, payload: IpcEventContract[C]): void
  }
}

export type IpcHandler<C extends IpcChannel = IpcChannel> = (
  payload: IpcContract[C]['payload'],
  event: IpcInvokeEvent
) => IpcContract[C]['result'] | Promise<IpcContract[C]['result']>

export type IpcHandlers = { [C in IpcChannel]: IpcHandler<C> }

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
    ipc.handle(channel, (event, payload) => {
      const handler = handlers[channel] as (
        payload: unknown,
        event: IpcInvokeEvent
      ) => unknown
      return handler(payload, event as IpcInvokeEvent)
    })
  }
}
