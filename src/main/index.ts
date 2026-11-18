import { app, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createBootstrap } from './app-bootstrap'
import { readChatConfig, resolveChatConfig } from './chat/config'
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
import { readThemePreference } from './db/settings'
import { missingDictionary, openDictionary, type Dictionary } from './dictionary/dictionary'
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
  saveReadingPreferences,
  saveReadingSettings
} from './reading/queries'
import {
  createPin,
  deletePin,
  fileAllUnfiled,
  movePin,
  readPinBoard,
  readPinSource,
  restorePins
} from './pins/pins'
import { createElectronSecretStore } from './settings/electron-secrets'
import {
  activateProfile,
  deleteProfile,
  readSettingsOverview,
  saveModelProfile,
  verifySavedModelProfile
} from './settings/operations'
import { markProfileVerified } from './settings/profiles'
import { saveThemePreference } from './settings/theme'
import { verifyModelProfile } from './settings/verify'
import { applyThemePreference, createMainWindow } from './window'

const DATABASE_FILE = 'english-learning.db'
/** 构建时把 docs/corpus 的 JSON 复制到主进程产物旁边。 */
const CORPUS_DIRECTORY_NAME = 'corpus'
/** 构建时把 assets/dictionary 的随包词典复制到主进程产物旁边。 */
const DICTIONARY_DIRECTORY_NAME = 'dictionary'
const DICTIONARY_FILE_NAME = 'ecdict.db'

let database: AppDatabase | null = null
let dictionary: Dictionary | null = null

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

/**
 * 内置词典的位置：开发态在主进程产物旁边的 `dictionary/`，打包后放到
 * `resources/dictionary/`。词典是 SQLite 文件，better-sqlite3 读不了 asar 里的路径，
 * 所以不能留在 asar 内。E2E 与调试可以用 DICTIONARY_DIRECTORY 指到别处。
 */
function dictionaryFile(): string {
  const override = process.env.DICTIONARY_DIRECTORY?.trim()
  const directory = override
    ? resolve(override)
    : app.isPackaged
      ? join(process.resourcesPath, DICTIONARY_DIRECTORY_NAME)
      : join(__dirname, DICTIONARY_DIRECTORY_NAME)
  return join(directory, DICTIONARY_FILE_NAME)
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

  // 密钥只经 safeStorage 加密保存；环境变量里的配置仍是没设本机配置时的退路。
  const secrets = createElectronSecretStore()
  const settingsOptions = () => ({
    secrets,
    fallbackModel: readChatConfig(process.env)?.model ?? '',
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    dataDirectory: userDataDirectory
  })
  const chatConfig = resolveChatConfig(opened, secrets, process.env)
  const chat = createChatService({
    resolveConfig: () => resolveChatConfig(opened, secrets, process.env),
    onVerified: (profileId) => markProfileVerified(opened, profileId)
  })
  /** 启动时的模型名：给启动值保存回答用，也给钉住出处兜底。 */
  const configuredModel = chatConfig?.model ?? ''

  // 词典查不到就换成「不可用」的替身：界面明说查不了，阅读与对话照常能用。
  dictionary = openDictionary(dictionaryFile())
  if (dictionary === null) {
    console.warn(`[dictionary] 内置词典没有随包加载：${dictionaryFile()}`)
  }
  const lookupDictionary = dictionary ?? missingDictionary()
  // 选词归并跟着词典走：装了词典就用 ECDICT 的 lemma，没装才退回词形规则。
  const entryDictionary = dictionary ?? undefined

  registerIpcHandlers(ipcMain, {
    'app:bootstrap': () => createBootstrap(opened, corpusImport, configuredModel),
    'home:summary': () => readHomeSummary(opened),
    'library:list': () => readLibrary(opened),
    'library:detail': (payload) => readArticleDetail(opened, payload.articleId),
    'library:search': (payload) => searchLibrary(opened, payload.query),
    'reading:open': (payload) => openReadingView(opened, payload.articleId),
    'reading:progress': (payload) => saveReadingPoint(opened, payload),
    'reading:settings': (payload) => saveReadingSettings(opened, payload),
    'reading:collect': (payload) =>
      collectSelection(opened, payload, { dictionary: entryDictionary }),
    'dictionary:lookup': (payload) => lookupDictionary.lookup(payload.word),
    'entries:card': (payload) => readWordEntryCard(opened, payload.entryId),
    'entries:delete-sentence': (payload) => deleteEntrySentence(opened, payload.entrySentenceId),
    'entries:list': (payload) => readEntryList(opened, payload),
    'entries:page': (payload) =>
      readEntryPage(opened, payload.entryId, { dictionary: entryDictionary }),
    'entries:sentence': (payload) => readEntrySentenceTarget(opened, payload.entrySentenceId),
    'entries:merge': (payload) => mergeEntries(opened, payload),
    'entries:main-form': (payload) =>
      changeEntryMainForm(opened, payload, { dictionary: entryDictionary }),
    'entries:move-sentence': (payload) =>
      moveEntrySentence(opened, payload, { dictionary: entryDictionary }),
    'entries:reselect-sentence': (payload) =>
      reselectEntrySentence(opened, payload, { dictionary: entryDictionary }),
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
    'chat:switch-answer': (payload) => switchAnswer(opened, payload),
    'pins:create': (payload) =>
      createPin(opened, payload, {
        model: resolveChatConfig(opened, secrets, process.env)?.model ?? ''
      }),
    'pins:board': (payload) => readPinBoard(opened, payload.threadId),
    'pins:move': (payload) => movePin(opened, payload),
    'pins:delete': (payload) => deletePin(opened, payload),
    'pins:file-all': (payload) => fileAllUnfiled(opened, payload),
    'pins:restore': (payload) => restorePins(opened, payload),
    'pins:source': (payload) => readPinSource(opened, payload.pinId),
    'settings:overview': () => readSettingsOverview(opened, settingsOptions()),
    'settings:profile-save': (payload) =>
      saveModelProfile(opened, payload, {
        ...settingsOptions(),
        verify: verifyModelProfile
      }),
    'settings:profile-activate': (payload) =>
      activateProfile(opened, payload.profileId, settingsOptions()),
    'settings:profile-delete': (payload) =>
      deleteProfile(opened, payload.profileId, settingsOptions()),
    'settings:profile-verify': (payload) =>
      verifySavedModelProfile(opened, payload.profileId, {
        ...settingsOptions(),
        verify: verifyModelProfile
      }),
    'settings:reading-save': (payload) => saveReadingPreferences(opened, payload.preferences),
    'settings:theme-save': (payload) => {
      const result = saveThemePreference(opened, payload.theme)
      if (result.saved) {
        applyThemePreference(result.theme)
      }
      return result
    },
    'settings:open-data-directory': async () => {
      const failure = await shell.openPath(userDataDirectory)
      return { opened: failure === '', path: userDataDirectory }
    }
  })

  Menu.setApplicationMenu(null)
  createMainWindow(readThemePreference(opened))
  keepWindowBackdropInSync(opened)
}

/**
 * 跟随系统时，Windows 改了深浅后原生窗口底色也要跟着；
 * 否则下次最小化 / 缩放会闪一下旧底色。浅色与深色选择下改的是 interface 本身，
 * 这里只看 DB 里存的偏好，不跟界面的临时状态。
 */
function keepWindowBackdropInSync(database: AppDatabase): void {
  nativeTheme.on('updated', () => {
    if (readThemePreference(database) === 'system') {
      applyThemePreference('system')
    }
  })
}

function closeResources(): void {
  database?.close()
  database = null
  dictionary?.close()
  dictionary = null
}

function reportStartupFailure(error: unknown): void {
  closeResources()
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox('启动失败', message)
  app.exit(1)
}

app.on('before-quit', closeResources)

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
