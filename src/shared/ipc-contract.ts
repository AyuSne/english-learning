import type {
  ChatStartRequest,
  ChatStartResult,
  ChatStopRequest,
  ChatStopResult,
  ChatStreamUpdate
} from './chat'
import type {
  ArticleDetail,
  HomeSummary,
  LibraryListing,
  LibrarySearchResults
} from './library'
import type {
  ReadingProgressRequest,
  ReadingProgressResult,
  ReadingSettingsRequest,
  ReadingSettingsResult,
  ReadingView
} from './reading'
import type { AppBootstrap } from './types'

/**
 * 渲染层与主进程之间唯一的调用契约。新增能力时先在这里加 channel，
 * 主进程与 preload 都会按同一份表校验，漏注册或多注册都会在启动时暴露。
 */
export interface IpcContract {
  'app:bootstrap': { payload: undefined; result: AppBootstrap }
  'home:summary': { payload: undefined; result: HomeSummary }
  'library:list': { payload: undefined; result: LibraryListing }
  'library:detail': { payload: { articleId: string }; result: ArticleDetail | null }
  'library:search': { payload: { query: string }; result: LibrarySearchResults }
  'reading:open': { payload: { articleId: string }; result: ReadingView | null }
  'reading:progress': { payload: ReadingProgressRequest; result: ReadingProgressResult }
  'reading:settings': { payload: ReadingSettingsRequest; result: ReadingSettingsResult | null }
  'chat:start': { payload: ChatStartRequest; result: ChatStartResult }
  'chat:stop': { payload: ChatStopRequest; result: ChatStopResult }
}

/**
 * 主进程主动推给渲染层的事件。事件同样走白名单，不在表里的订阅在 preload 就被拦下。
 */
export interface IpcEventContract {
  'chat:event': ChatStreamUpdate
}

export type IpcChannel = keyof IpcContract
export type IpcEventChannel = keyof IpcEventContract

// 用 Record 而不是数组列 channel：契约里加了 channel 却忘了登记，这里会编译失败。
const CHANNEL_TABLE: Record<IpcChannel, true> = {
  'app:bootstrap': true,
  'home:summary': true,
  'library:list': true,
  'library:detail': true,
  'library:search': true,
  'reading:open': true,
  'reading:progress': true,
  'reading:settings': true,
  'chat:start': true,
  'chat:stop': true
}

const EVENT_CHANNEL_TABLE: Record<IpcEventChannel, true> = {
  'chat:event': true
}

export const IPC_CHANNELS: readonly IpcChannel[] = Object.keys(
  CHANNEL_TABLE
) as readonly IpcChannel[]

export function isIpcChannel(value: unknown): value is IpcChannel {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHANNEL_TABLE, value)
  )
}

export function isIpcEventChannel(value: unknown): value is IpcEventChannel {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVENT_CHANNEL_TABLE, value)
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
  subscribe<E extends IpcEventChannel>(
    event: E,
    handler: (payload: IpcEventContract[E]) => void
  ): () => void
}
