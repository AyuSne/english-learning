import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createLaterMarkRunner,
  type LaterMarkHandlers,
  type LaterMarkRequest,
  type LaterMarkRunner
} from './mutation'

/**
 * 「稍后看」的 React 入口：只管一笔在途请求与 `busyEntryId`，其余流程在 mutation.ts。
 * 同一个页面同时只发一笔；页面卸载时作废在途响应，避免晚到的结果改到别的对象。
 */
export function useLaterMark(): {
  busyEntryId: string | null
  setLater: (
    request: LaterMarkRequest,
    handlers?: LaterMarkHandlers
  ) => Promise<Awaited<ReturnType<LaterMarkRunner['run']>>>
} {
  const runner = useRef<LaterMarkRunner | null>(null)
  if (runner.current === null) {
    runner.current = createLaterMarkRunner()
  }
  const busy = useRef(false)
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null)

  useEffect(() => {
    const current = runner.current
    return () => current?.cancel()
  }, [])

  const setLater = useCallback(
    async (request: LaterMarkRequest, handlers?: LaterMarkHandlers) => {
      if (busy.current) return null
      busy.current = true
      setBusyEntryId(request.entryId)
      try {
        return await runner.current!.run(request, handlers)
      } finally {
        busy.current = false
        setBusyEntryId(null)
      }
    },
    []
  )

  return { busyEntryId, setLater }
}
