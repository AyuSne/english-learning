import { describe, expect, it } from 'vitest'
import type { ChatStartResult, ChatStopResult } from '../../shared/chat'
import type { DictionaryLookup } from '../../shared/dictionary'
import type {
  ChangeMainFormResult,
  CollectSelectionResult,
  DeleteEntrySentenceResult,
  EntryListResult,
  EntryPage,
  EntrySentenceTarget,
  LearningNoteResult,
  MergeEntriesResult,
  MoveEntrySentenceResult,
  ReselectEntrySentenceResult,
  WordEntryCard
} from '../../shared/entries'
import type {
  ArticleDetail,
  HomeSummary,
  LibraryListing,
  LibrarySearchResults
} from '../../shared/library'
import type {
  CreatePinResult,
  DeletePinResult,
  FileAllUnfiledResult,
  PinBoard,
  PinResult,
  PinSourceResult,
  RestorePinsResult
} from '../../shared/pins'
import type {
  ReadingProgressResult,
  ReadingSettingsResult,
  ReadingView
} from '../../shared/reading'
import type {
  ChatThreadView,
  CreateThreadResult,
  QuestionResult,
  SaveAnswerResult,
  SwitchThreadResult,
  ThreadContextCandidates,
  ThreadListResult,
  UpdateThreadContextResult
} from '../../shared/threads'
import type { AppBootstrap } from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/ipc-contract'
import {
  registerIpcHandlers,
  type IpcHandlers,
  type IpcInvokeEvent,
  type IpcMainLike
} from './register'

const bootstrap: AppBootstrap = {
  appVersion: '0.1.0',
  isPackaged: false,
  schemaVersion: 3,
  theme: 'light',
  chatModel: 'deepseek-flash',
  corpusImport: { total: 0, imported: 0, updated: 0, skipped: 0, failed: [] }
}

function fakeIpcMain(): {
  ipc: IpcMainLike
  registered: Map<string, (event: unknown, payload: unknown) => unknown>
} {
  const registered = new Map<string, (event: unknown, payload: unknown) => unknown>()
  const ipc: IpcMainLike = {
    handle(channel, listener) {
      registered.set(channel, listener)
    }
  }
  return { ipc, registered }
}

function chatHandlers() {
  const missingQuestion = (): QuestionResult => ({ status: 'missing' })
  return {
    'chat:start': (): ChatStartResult => ({ accepted: true }),
    'chat:stop': (): ChatStopResult => ({ stopped: false }),
    'chat:list': (): ThreadListResult => ({ threads: [] }),
    'chat:thread': (): ChatThreadView | null => null,
    'chat:create': (): CreateThreadResult => ({ status: 'rejected', reason: 'missing-main' }),
    'chat:ask': missingQuestion,
    'chat:edit-question': missingQuestion,
    'chat:answer': (): SaveAnswerResult => ({ status: 'missing' }),
    'chat:continue': (): SaveAnswerResult => ({ status: 'missing' }),
    'chat:context': (): UpdateThreadContextResult => ({ status: 'missing' }),
    'chat:candidates': (): ThreadContextCandidates => ({ items: [] }),
    'chat:switch-question': (): SwitchThreadResult => ({ status: 'missing' }),
    'chat:switch-answer': (): SwitchThreadResult => ({ status: 'missing' })
  }
}

function libraryHandlers() {
  return {
    'home:summary': (): HomeSummary => ({
      library: { articleCount: 0, sessionCount: 0 },
      continueReading: null
    }),
    'library:list': (): LibraryListing => ({ articleCount: 0, sessionCount: 0, sessions: [] }),
    'library:detail': (): ArticleDetail | null => null,
    'library:search': (payload: { query: string }): LibrarySearchResults => ({
      query: payload.query,
      results: []
    })
  }
}

function readingHandlers() {
  return {
    'reading:open': (): ReadingView | null => null,
    'reading:progress': (): ReadingProgressResult => ({ saved: false }),
    'reading:settings': (): ReadingSettingsResult | null => null,
    'reading:collect': (): CollectSelectionResult => ({
      status: 'rejected',
      reason: 'article'
    })
  }
}

function entriesHandlers() {
  const missingNote = (): LearningNoteResult => ({ status: 'missing' })
  return {
    'entries:card': (): WordEntryCard | null => null,
    'entries:delete-sentence': (): DeleteEntrySentenceResult => ({ status: 'missing' }),
    'entries:list': (): EntryListResult => ({ total: 0, entries: [] }),
    'entries:page': (): EntryPage | null => null,
    'entries:sentence': (): EntrySentenceTarget | null => null,
    'entries:merge': (): MergeEntriesResult => ({ status: 'missing' }),
    'entries:main-form': (): ChangeMainFormResult => ({ status: 'missing' }),
    'entries:move-sentence': (): MoveEntrySentenceResult => ({ status: 'missing' }),
    'entries:reselect-sentence': (): ReselectEntrySentenceResult => ({ status: 'missing' }),
    'entries:create-note': missingNote,
    'entries:update-note': missingNote,
    'entries:pin-note': missingNote,
    'entries:delete-note': missingNote,
    'entries:move-note': missingNote
  }
}

function dictionaryHandlers() {
  return {
    'dictionary:lookup': (payload: { word: string }): DictionaryLookup => ({
      status: 'missing',
      query: payload.word.toLowerCase()
    })
  }
}

function pinsHandlers() {
  return {
    'pins:create': (): CreatePinResult => ({ status: 'rejected', reason: 'thread' }),
    'pins:board': (): PinBoard => ({
      threadId: null,
      threadPins: [],
      unfiledPins: [],
      unfiledCount: 0
    }),
    'pins:move': (): PinResult => ({ status: 'missing' }),
    'pins:delete': (): DeletePinResult => ({ status: 'missing' }),
    'pins:file-all': (): FileAllUnfiledResult => ({ status: 'filed', filed: [] }),
    'pins:restore': (): RestorePinsResult => ({ status: 'restored', pins: [] }),
    'pins:source': (): PinSourceResult => null
  }
}

describe('registerIpcHandlers', () => {
  it('按契约注册每个 channel，调用时转给对应处理函数并传入调用事件', () => {
    const { ipc, registered } = fakeIpcMain()
    const received: unknown[] = []
    const events: IpcInvokeEvent[] = []

    registerIpcHandlers(ipc, {
      ...chatHandlers(),
      ...libraryHandlers(),
      ...readingHandlers(),
      ...entriesHandlers(),
      ...pinsHandlers(),
      ...dictionaryHandlers(),
      'app:bootstrap': (payload, event) => {
        received.push(payload)
        events.push(event)
        return bootstrap
      }
    })

    expect([...registered.keys()].sort()).toEqual([...IPC_CHANNELS].sort())
    const listener = registered.get('app:bootstrap')
    expect(listener).toBeDefined()
    const event: IpcInvokeEvent = { sender: { send() {} } }
    expect(listener?.(event, undefined)).toEqual(bootstrap)
    expect(received).toEqual([undefined])
    expect(events).toEqual([event])
  })

  it('契约里的 channel 没有处理函数时启动即报错', () => {
    const { ipc } = fakeIpcMain()

    expect(() =>
      registerIpcHandlers(ipc, { ...chatHandlers() } as unknown as IpcHandlers)
    ).toThrow(/app:bootstrap/)
  })

  it('出现契约之外的 channel 时启动即报错', () => {
    const { ipc } = fakeIpcMain()
    const handlers = {
      ...chatHandlers(),
      ...libraryHandlers(),
      ...readingHandlers(),
      ...entriesHandlers(),
      ...pinsHandlers(),
      ...dictionaryHandlers(),
      'app:bootstrap': () => bootstrap,
      'app:not-in-contract': () => bootstrap
    } as unknown as IpcHandlers

    expect(() => registerIpcHandlers(ipc, handlers)).toThrow(/app:not-in-contract/)
  })
})
