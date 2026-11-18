import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ReadingPoint } from '../../../shared/library'
import type { ReadingProgressRequest, ReadingView } from '../../../shared/reading'
import { saveReadingPoint } from '../api'
import { messageOf } from '../errors'

/** 句子离滚动容器顶多远才算「读到」。 */
const READING_TOP_OFFSET = 16
/** 滚动停下多久后把位置写进本机库；不每滚一格都发 IPC。 */
const READING_SAVE_DELAY = 400

export type ReadingPosition = {
  /** 挂到阅读正文的滚动容器上。 */
  scrollRef: RefObject<HTMLDivElement | null>
  /** 当前读到的那一句；页脚与恢复位置都用它。 */
  position: ReadingPoint | null
  /** 写库失败时的提示；成功时清空。 */
  writeError: string | null
}

function keyOf(paragraphId: string, sentenceOrdinal: number): string {
  return `${paragraphId}:${sentenceOrdinal}`
}

/**
 * 阅读位置：打开时滚回上次读到的那一句，滚动时按 rAF 节流找出当前句，
 * 位置变了才在 400ms 后写库，离开页面时把最后一次改动补写。
 */
export function useReadingPosition(view: ReadingView | null): ReadingPosition {
  const scrollRef = useRef<HTMLDivElement>(null)
  const restoredArticle = useRef<string | null>(null)
  const lastSavedKey = useRef<string | null>(null)
  const flushRef = useRef<(() => void) | null>(null)
  const [position, setPosition] = useState<ReadingPoint | null>(view?.readingPoint ?? null)
  const [writeError, setWriteError] = useState<string | null>(null)

  // 窗口关闭不会走 React 卸载，关之前补写最后一次位置。
  useEffect(() => {
    const flushNow = (): void => flushRef.current?.()
    window.addEventListener('pagehide', flushNow)
    window.addEventListener('beforeunload', flushNow)
    return () => {
      window.removeEventListener('pagehide', flushNow)
      window.removeEventListener('beforeunload', flushNow)
    }
  }, [])

  useEffect(() => {
    setPosition(view?.readingPoint ?? null)
  }, [view])

  // 回到上次读到的那一句；等正文渲染完再滚，避免用空列表算位置。
  useLayoutEffect(() => {
    if (!view || restoredArticle.current === view.article.id) {
      return
    }
    restoredArticle.current = view.article.id
    const container = scrollRef.current
    if (!container) return

    container.scrollTop = 0
    const point = view.readingPoint
    if (!point) return

    const target = Array.from(
      container.querySelectorAll<HTMLElement>('.reading-sentence')
    ).find(
      (element) =>
        element.dataset.paragraphId === point.paragraphId &&
        element.dataset.sentenceOrdinal === String(point.sentenceOrdinal - 1)
    )
    if (!target) return

    const offset =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      READING_TOP_OFFSET
    container.scrollTop = Math.max(0, container.scrollTop + offset)
  }, [view])

  useEffect(() => {
    const container = scrollRef.current
    if (!view || !container) {
      return
    }

    const articleId = view.article.id
    lastSavedKey.current = view.readingPoint
      ? keyOf(view.readingPoint.paragraphId, view.readingPoint.sentenceOrdinal - 1)
      : null
    setWriteError(null)

    let frame = 0
    let timer: number | null = null
    let latest: ReadingProgressRequest | null = null

    const flush = (): void => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      const request = latest
      latest = null
      if (!request) return
      saveReadingPoint(request).then(
        (result) => {
          if (!result.saved) {
            setWriteError('阅读位置没有记住，本机资料库可能不可写。')
          }
        },
        (error: unknown) => setWriteError(messageOf(error))
      )
    }

    const readCurrent = (): void => {
      frame = 0
      const top = container.getBoundingClientRect().top + READING_TOP_OFFSET
      const sentences = container.querySelectorAll<HTMLElement>('.reading-sentence')
      let current: HTMLElement | null = null
      for (const element of sentences) {
        if (element.getBoundingClientRect().bottom > top) {
          current = element
          break
        }
      }
      if (current === null && sentences.length > 0) {
        current = sentences[sentences.length - 1] ?? null
      }
      if (current === null) return

      const paragraphId = current.dataset.paragraphId
      const paragraphOrdinal = Number(current.dataset.paragraphOrdinal)
      const sentenceOrdinal = Number(current.dataset.sentenceOrdinal)
      if (
        !paragraphId ||
        !Number.isInteger(paragraphOrdinal) ||
        !Number.isInteger(sentenceOrdinal)
      ) {
        return
      }

      const key = keyOf(paragraphId, sentenceOrdinal)
      if (key === lastSavedKey.current) return
      lastSavedKey.current = key

      setPosition({
        paragraphId,
        paragraphOrdinal: paragraphOrdinal + 1,
        sentenceOrdinal: sentenceOrdinal + 1,
        sentenceText: current.textContent ?? ''
      })
      latest = { articleId, paragraphId, sentenceOrdinal }
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      timer = window.setTimeout(flush, READING_SAVE_DELAY)
    }

    const onScroll = (): void => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(readCurrent)
      }
    }

    flushRef.current = flush
    container.addEventListener('scroll', onScroll, { passive: true })
    readCurrent()

    return () => {
      container.removeEventListener('scroll', onScroll)
      if (frame !== 0) {
        window.cancelAnimationFrame(frame)
      }
      flushRef.current = null
      flush()
    }
  }, [view])

  return { scrollRef, position, writeError }
}
