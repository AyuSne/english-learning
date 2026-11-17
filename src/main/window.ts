import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { THEME_PAPER } from '../shared/theme'
import type { Theme } from '../shared/types'

export function createMainWindow(theme: Theme): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '素读',
    backgroundColor: THEME_PAPER[theme],
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // 应用内不打开窗口、不离开本地页面：所有跳转都由渲染层的视图切换完成。
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== new URL(window.webContents.getURL()).origin) {
        event.preventDefault()
      }
    } catch {
      event.preventDefault()
    }
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
