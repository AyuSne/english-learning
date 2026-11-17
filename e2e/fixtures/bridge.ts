import type { Page } from '@playwright/test'
import type { AppBootstrap } from '../../src/shared/types'

export type BridgeSurface = {
  hasInvoke: boolean
  hasRequire: boolean
  hasIpcRenderer: boolean
}

/**
 * 渲染层能碰到的全局对象：只该有 bridge，没有 Node 的 require 与 ipcRenderer。
 */
export function readBridgeSurface(page: Page): Promise<BridgeSurface> {
  return page.evaluate(() => {
    const candidate = window as unknown as {
      api?: { invoke?: unknown }
      require?: unknown
      ipcRenderer?: unknown
    }
    return {
      hasInvoke: typeof candidate.api?.invoke === 'function',
      hasRequire: typeof candidate.require === 'function',
      hasIpcRenderer: typeof candidate.ipcRenderer !== 'undefined'
    }
  })
}

export function readBootstrap(page: Page): Promise<AppBootstrap> {
  return page.evaluate(() => {
    const candidate = window as unknown as {
      api: { invoke(channel: string): Promise<AppBootstrap> }
    }
    return candidate.api.invoke('app:bootstrap')
  })
}

export function callUnknownChannel(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const candidate = window as unknown as {
      api: { invoke(channel: string): Promise<unknown> }
    }
    try {
      await candidate.api.invoke('app:not-in-contract')
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })
}
