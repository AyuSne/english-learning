import { app, dialog, ipcMain, Menu } from 'electron'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createBootstrap } from './app-bootstrap'
import { readChatConfig } from './chat/config'
import { createChatService } from './chat/service'
import {
  askQuestion,
  createThread,
  editQuestion,
  listThreads,
  readContextCandidates,
  readThreadView,
  saveAnswer,
  saveContinuation,
  switchAnswer,
  switchQuestion,
  updateThreadContext
} from './chat/threads'
import { importCorpus } from './corpus/import'
import type { AppDatabase } from './db/database'
import { openDatabase } from './db/database'
import { migrate } from './db/migrations'
import { readTheme } from './db/settings'
import {
  changeEntryMainForm,
  mergeEntries,
  moveEntrySentence,
  reselectEntrySentence
} from './entries/curation'
import {
  createLearningNote,
  deleteLearningNote,
  moveLearningNote,
  pinLearningNote,
  updateLearningNote
} from './entries/notes'
import { readEntryList, readEntryPage } from './entries/page'
import {
  collectSelection,
  deleteEntrySentence,
  readEntrySentenceTarget,
  readWordEntryCard
} from './entries/queries'
import { registerIpcHandlers } from './ipc/register'
import {
  readArticleDetail,
  readHomeSummary,
  readLibrary,
  searchLibrary
} from './library/queries'
import {
  openReadingView,
  saveReadingPoint,
  saveReadingSettings
} from './reading/queries'
import { createMainWindow } from './window'

const DATABASE_FILE = 'english-learning.db'
/** 构建时把 docs/corpus 的 JSON 复制到主进程产物旁边。 */
const CORPUS_DIRECTORY_NAME = 'corpus'

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

/**
 * 语料随包分发在主进程产物旁边的 `corpus/`；E2E 或调试可以用环境变量指到别处。
 */
function corpusDirectory(): string {
  const override = process.env.CORPUS_DIRECTORY?.trim()
  return override ? resolve(override) : join(__dirname, CORPUS_DIRECTORY_NAME)
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

  // 每次启动都与清单对一遍：内容没变就跳过，坏了的那篇单独报出来，不静默丢。
  const corpusImport = importCorpus(opened, { directory: corpusDirectory() })
  if (corpusImport.failed.length > 0) {
    console.warn(
      `[corpus] ${corpusImport.failed.length} 篇没导进来：${corpusImport.failed
        .map((failure) => `${failure.id}（${failure.reason}）`)
        .join('、')}`
    )
  } else {
    console.log(
      `[corpus] 新导入 ${corpusImport.imported} 篇，更新 ${corpusImport.updated} 篇，跳过 ${corpusImport.skipped} 篇`
    )
  }

  const chat = createChatService({ config: readChatConfig(process.env) })

  registerIpcHandlers(ipcMain, {
    'app:bootstrap': () => createBootstrap(opened, corpusImport),
    'home:summary': () => readHomeSummary(opened),
    'library:list': () => readLibrary(opened),
    'library:detail': (payload) => readArticleDetail(opened, payload.articleId),
    'library:search': (payload) => searchLibrary(opened, payload.query),
    'reading:open': (payload) => openReadingView(opened, payload.articleId),
    'reading:progress': (payload) => saveReadingPoint(opened, payload),
    'reading:settings': (payload) => saveReadingSettings(opened, payload),
    'reading:collect': (payload) => collectSelection(opened, payload),
    'entries:card': (payload) => readWordEntryCard(opened, payload.entryId),
    'entries:delete-sentence': (payload) => deleteEntrySentence(opened, payload.entrySentenceId),
    'entries:list': (payload) => readEntryList(opened, payload),
    'entries:page': (payload) => readEntryPage(opened, payload.entryId),
    'entries:sentence': (payload) => readEntrySentenceTarget(opened, payload.entrySentenceId),
    'entries:merge': (payload) => mergeEntries(opened, payload),
    'entries:main-form': (payload) => changeEntryMainForm(opened, payload),
    'entries:move-sentence': (payload) => moveEntrySentence(opened, payload),
    'entries:reselect-sentence': (payload) => reselectEntrySentence(opened, payload),
    'entries:create-note': (payload) => createLearningNote(opened, payload),
    'entries:update-note': (payload) => updateLearningNote(opened, payload),
    'entries:pin-note': (payload) => pinLearningNote(opened, payload),
    'entries:delete-note': (payload) => deleteLearningNote(opened, payload),
    'entries:move-note': (payload) => moveLearningNote(opened, payload),
    'chat:start': (payload, event) =>
      chat.start(payload, (update) => event.sender.send('chat:event', update)),
    'chat:stop': (payload) => chat.stop(payload.streamId),
    'chat:list': () => listThreads(opened),
    'chat:thread': (payload) => readThreadView(opened, payload.threadId),
    'chat:create': (payload) => createThread(opened, payload),
    'chat:ask': (payload) => askQuestion(opened, payload),
    'chat:edit-question': (payload) => editQuestion(opened, payload),
    'chat:answer': (payload) => saveAnswer(opened, payload),
    'chat:continue': (payload) => saveContinuation(opened, payload),
    'chat:context': (payload) => updateThreadContext(opened, payload),
    'chat:candidates': (payload) => readContextCandidates(opened, payload.threadId),
    'chat:switch-question': (payload) => switchQuestion(opened, payload),
    'chat:switch-answer': (payload) => switchAnswer(opened, payload)
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
