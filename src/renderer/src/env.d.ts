/// <reference types="vite/client" />
import type { IpcBridge } from '../../shared/ipc-contract'

declare global {
  interface Window {
    api: IpcBridge
  }
}

export {}
