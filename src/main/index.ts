import { app, dialog, ipcMain, Menu } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createBootstrap } from './app-bootstrap'
import type { AppDatabase } from './db/database'
import { openDatabase } from './db/database'
import { migrate } from './db/migrations'
import { readTheme } from './db/settings'
import { registerIpcHandlers } from './ipc/register'
import { createMainWindow } from './window'

const DATABASE_FILE = 'english-learning.db'

let database: AppDatabase | null = null

function start(): void {
  const userDataDirectory = app.getPath('userData')
  mkdirSync(userDataDirectory, { recursive: true })

  const opened = openDatabase(join(userDataDirectory, DATABASE_FILE))
  database = opened

  const outcome = migrate(opened)
  if (outcome.applied.length > 0) {
    console.log(`[db] schema ${outcome.from} → ${outcome.to}`)
  }

  registerIpcHandlers(ipcMain, {
    'app:bootstrap': () => createBootstrap(opened)
  })

  Menu.setApplicationMenu(null)
  createMainWindow(readTheme(opened))
}

function closeDatabase(): void {
  database?.close()
  database = null
}

function reportStartupFailure(error: unknown): void {
  closeDatabase()
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox('启动失败', message)
  app.exit(1)
}

app.on('before-quit', closeDatabase)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(
  () => {
    try {
      start()
    } catch (error) {
      reportStartupFailure(error)
    }
  },
  reportStartupFailure
)
