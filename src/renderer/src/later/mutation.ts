import type { SetEntryLaterResult } from '../../../shared/entries'
import { setEntryLater } from '../api'
import { failureText } from '../errors'
import { laterMarkedNotice, laterUnmarkedNotice } from './format'

/**
 * 「稍后看」的唯一写入流程。词条页、阅读词条卡与首页共用这一份：
 * 请求、在途标记、成功文案、失败文案与「词条已经不在」的处理都在这里，
 * 页面只决定成功/失败之后自己的界面怎么变（刷新、更新卡片、从首页移除）。
 *
 * 每次请求拿一个序号，`cancel()` 或后一次请求会作废旧序号：晚到的响应不会
 * 落到另一条词条或另一页上。
 */

export type LaterMarkRequest = {
  entryId: string
  mainForm: string
  later: boolean
}

/** 一次成功写入（或按已移除处理的缺失词条）的结果与现成文案。 */
export type LaterMarkChange = {
  entryId: string
  mainForm: string
  /** null 表示取消标记。 */
  markedAt: string | null
  notice: string
}

export type LaterMarkFailure = {
  entryId: string
  message: string
}

export type LaterMarkHandlers = {
  /** 请求本身失败时的提示；每个页面保留自己的说法。 */
  failureMessage?: string
  /** 首页的「移除」把「词条已经不在了」也当作已移除。 */
  missingAsSettled?: boolean
  onSettled?: (change: LaterMarkChange) => void
  onMissing?: (entryId: string) => void
  onError?: (failure: LaterMarkFailure) => void
}

export type LaterMarkSender = (request: {
  entryId: string
  later: boolean
}) => Promise<SetEntryLaterResult>

export type LaterMarkRunner = {
  run: (
    request: LaterMarkRequest,
    handlers?: LaterMarkHandlers
  ) => Promise<SetEntryLaterResult | null>
  /** 页面卸载或换对象时调用：在途响应直接作废，不再回调。 */
  cancel: () => void
}

export function createLaterMarkRunner(
  send: LaterMarkSender = setEntryLater
): LaterMarkRunner {
  let latest = 0

  return {
    async run(request, handlers = {}) {
      const token = latest + 1
      latest = token
      try {
        const result = await send({ entryId: request.entryId, later: request.later })
        if (token !== latest) return null

        if (result.status === 'missing') {
          if (handlers.missingAsSettled === true) {
            handlers.onSettled?.({
              entryId: request.entryId,
              mainForm: request.mainForm,
              markedAt: null,
              notice: laterUnmarkedNotice(request.mainForm)
            })
          } else {
            handlers.onMissing?.(request.entryId)
          }
          return result
        }

        const markedAt = result.status === 'marked' ? result.markedAt : null
        handlers.onSettled?.({
          entryId: request.entryId,
          mainForm: request.mainForm,
          markedAt,
          notice:
            markedAt === null
              ? laterUnmarkedNotice(request.mainForm)
              : laterMarkedNotice(request.mainForm)
        })
        return result
      } catch (error) {
        if (token !== latest) return null
        handlers.onError?.({
          entryId: request.entryId,
          message: failureText(
            error,
            handlers.failureMessage ?? '稍后看没有改成功，再试一次。'
          )
        })
        return null
      }
    },

    cancel() {
      latest += 1
    }
  }
}
