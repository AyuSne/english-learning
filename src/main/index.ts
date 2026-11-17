import { app, dialog, ipcMain, Menu } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createBootstrap } from './app-bootstrap'
import { readChatConfig } from './chat/config'
import { createChatService } from './chat/service'
import type { AppDatabase } from './db/database'
import { openDatabase } from './db/database'
import { migrate } from './db/migrations'
import { readTheme } from './db/settings'
import { registerIpcHandlers } from './ipc/register'
import { createMainWindow } from './window'

const DATABASE_FILE = 'english-learning.db'

let database: AppDatabase | null = null

/**
 * 开发时把仓库根目录的 .env 读进进程环境；已存在的环境变量优先，
 * 所以 E2E 用启动参数注入的 stub 配置不会被它覆盖。
 */
function loadLocalEnvironment(): void {
  if (app.isPackaged) {
    return
  }
  try {
    process.loadEnvFile(join(process.cwd(), '.env'))
  } catch {
    // 没有 .env 就按系统环境变量跑。
  }
}

function start(): void {
  loadLocalEnvironment()

  const userDataDirectory = app.getPath('userData')
  mkdirSync(userDataDirectory, { recursive: true })

  const opened = openDatabase(join(userDataDirectory, DATABASE_FILE))
  database = opened

  const outcome = migrate(opened)
  if (outcome.applied.length > 0) {
    console.log(`[db] schema ${outcome.from} → ${outcome.to}`)
  }

  const chat = createChatService({ config: readChatConfig(process.env) })

  registerIpcHandlers(ipcMain, {
    'app:bootstrap': () => createBootstrap(opened),
    'chat:start': (payload, event) =>
      chat.start(payload, (update) => event.sender.send('chat:event', update)),
    'chat:stop': (payload) => chat.stop(payload.streamId)
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
