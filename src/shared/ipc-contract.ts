import type { AppBootstrap } from './types'

/**
 * 渲染层与主进程之间唯一的调用契约。新增能力时先在这里加 channel，
 * 主进程与 preload 都会按同一份表校验，漏注册或多注册都会在启动时暴露。
 */
export interface IpcContract {
  'app:bootstrap': { payload: undefined; result: AppBootstrap }
}

export type IpcChannel = keyof IpcContract

// 用 Record 而不是数组列 channel：契约里加了 channel 却忘了登记，这里会编译失败。
const CHANNEL_TABLE: Record<IpcChannel, true> = {
  'app:bootstrap': true
}

export const IPC_CHANNELS: readonly IpcChannel[] = Object.keys(
  CHANNEL_TABLE
) as readonly IpcChannel[]

export function isIpcChannel(value: unknown): value is IpcChannel {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHANNEL_TABLE, value)
  )
}

/**
 * preload 挂到 `window.api` 上的接口。渲染层只认这一种访问主进程的方式。
 */
export type IpcBridge = {
  invoke<C extends IpcChannel>(
    channel: C,
    payload?: IpcContract[C]['payload']
  ): Promise<IpcContract[C]['result']>
}
