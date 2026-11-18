import type {
  ChatStartRequest,
  ChatStartResult,
  ChatStopRequest,
  ChatStopResult,
  ChatStreamUpdate
} from './chat'
import type { DictionaryLookup, DictionaryLookupRequest } from './dictionary'
import type {
  ChangeMainFormRequest,
  ChangeMainFormResult,
  CollectSelectionRequest,
  CollectSelectionResult,
  CreateLearningNoteRequest,
  DeleteEntrySentenceResult,
  EntryListRequest,
  EntryListResult,
  EntryPage,
  EntrySentenceTarget,
  LearningNoteResult,
  MergeEntriesRequest,
  MergeEntriesResult,
  MoveEntrySentenceRequest,
  MoveEntrySentenceResult,
  MoveLearningNoteRequest,
  PinLearningNoteRequest,
  ReselectEntrySentenceRequest,
  ReselectEntrySentenceResult,
  UpdateLearningNoteRequest,
  WordEntryCard
} from './entries'
import type {
  ArticleDetail,
  HomeSummary,
  ImportReport,
  LibraryListing,
  LibrarySearchResults
} from './library'
import type {
  CreatePinRequest,
  CreatePinResult,
  DeletePinResult,
  FileAllUnfiledRequest,
  FileAllUnfiledResult,
  MovePinRequest,
  PinBoard,
  PinResult,
  PinSourceResult,
  RestorePinsRequest,
  RestorePinsResult
} from './pins'
import type {
  ReadingPreferences,
  ReadingProgressRequest,
  ReadingProgressResult,
  ReadingPreferencesResult,
  ReadingSettingsRequest,
  ReadingSettingsResult,
  ReadingView
} from './reading'
import type {
  ActivateModelProfileResult,
  CreateBackupResult,
  DeleteModelProfileResult,
  OpenDataDirectoryResult,
  PickRestoreResult,
  RestoreBackupResult,
  SaveModelProfileRequest,
  SaveModelProfileResult,
  SaveThemeRequest,
  SaveThemeResult,
  SettingsOverview,
  VerifyModelProfileResult
} from './settings'
import type {
  AskThreadRequest,
  ChatThreadView,
  CreateThreadRequest,
  CreateThreadResult,
  EditQuestionRequest,
  ExportThreadResult,
  QuestionResult,
  SaveAnswerRequest,
  SaveAnswerResult,
  SaveContinuationRequest,
  SwitchAnswerRequest,
  SwitchQuestionRequest,
  SwitchThreadResult,
  ThreadContextCandidates,
  ThreadListResult,
  UpdateThreadContextRequest,
  UpdateThreadContextResult
} from './threads'
import type { AppBootstrap } from './types'

/**
 * 渲染层与主进程之间唯一的调用契约。新增能力时先在这里加 channel，
 * 主进程与 preload 都会按同一份表校验，漏注册或多注册都会在启动时暴露。
 */
export interface IpcContract {
  'app:bootstrap': { payload: undefined; result: AppBootstrap }
  'home:summary': { payload: undefined; result: HomeSummary }
  'library:list': { payload: undefined; result: LibraryListing }
  'library:reimport': { payload: undefined; result: ImportReport }
  'library:detail': { payload: { articleId: string }; result: ArticleDetail | null }
  'library:search': { payload: { query: string }; result: LibrarySearchResults }
  'reading:open': { payload: { articleId: string }; result: ReadingView | null }
  'reading:progress': { payload: ReadingProgressRequest; result: ReadingProgressResult }
  'reading:settings': { payload: ReadingSettingsRequest; result: ReadingSettingsResult | null }
  'reading:collect': { payload: CollectSelectionRequest; result: CollectSelectionResult }
  'dictionary:lookup': { payload: DictionaryLookupRequest; result: DictionaryLookup }
  'entries:card': { payload: { entryId: string }; result: WordEntryCard | null }
  'entries:delete-sentence': {
    payload: { entrySentenceId: string }
    result: DeleteEntrySentenceResult
  }
  'entries:list': { payload: EntryListRequest; result: EntryListResult }
  'entries:page': { payload: { entryId: string }; result: EntryPage | null }
  'entries:sentence': {
    payload: { entrySentenceId: string }
    result: EntrySentenceTarget | null
  }
  'entries:merge': { payload: MergeEntriesRequest; result: MergeEntriesResult }
  'entries:main-form': { payload: ChangeMainFormRequest; result: ChangeMainFormResult }
  'entries:move-sentence': {
    payload: MoveEntrySentenceRequest
    result: MoveEntrySentenceResult
  }
  'entries:reselect-sentence': {
    payload: ReselectEntrySentenceRequest
    result: ReselectEntrySentenceResult
  }
  'entries:create-note': {
    payload: CreateLearningNoteRequest
    result: LearningNoteResult
  }
  'entries:update-note': {
    payload: UpdateLearningNoteRequest
    result: LearningNoteResult
  }
  'entries:pin-note': { payload: PinLearningNoteRequest; result: LearningNoteResult }
  'entries:delete-note': { payload: { noteId: string }; result: LearningNoteResult }
  'entries:move-note': { payload: MoveLearningNoteRequest; result: LearningNoteResult }
  'chat:start': { payload: ChatStartRequest; result: ChatStartResult }
  'chat:stop': { payload: ChatStopRequest; result: ChatStopResult }
  'chat:list': { payload: undefined; result: ThreadListResult }
  'chat:thread': { payload: { threadId: string }; result: ChatThreadView | null }
  'chat:create': { payload: CreateThreadRequest; result: CreateThreadResult }
  'chat:ask': { payload: AskThreadRequest; result: QuestionResult }
  'chat:edit-question': { payload: EditQuestionRequest; result: QuestionResult }
  'chat:answer': { payload: SaveAnswerRequest; result: SaveAnswerResult }
  'chat:continue': { payload: SaveContinuationRequest; result: SaveAnswerResult }
  'chat:context': {
    payload: UpdateThreadContextRequest
    result: UpdateThreadContextResult
  }
  'chat:candidates': {
    payload: { threadId: string }
    result: ThreadContextCandidates
  }
  'chat:switch-question': { payload: SwitchQuestionRequest; result: SwitchThreadResult }
  'chat:switch-answer': { payload: SwitchAnswerRequest; result: SwitchThreadResult }
  'chat:export-jsonl': { payload: { threadId: string }; result: ExportThreadResult }
  'pins:create': { payload: CreatePinRequest; result: CreatePinResult }
  'pins:board': { payload: { threadId: string | null }; result: PinBoard }
  'pins:move': { payload: MovePinRequest; result: PinResult }
  'pins:delete': { payload: { pinId: string }; result: DeletePinResult }
  'pins:file-all': { payload: FileAllUnfiledRequest; result: FileAllUnfiledResult }
  'pins:restore': { payload: RestorePinsRequest; result: RestorePinsResult }
  'pins:source': { payload: { pinId: string }; result: PinSourceResult }
  'settings:overview': { payload: undefined; result: SettingsOverview }
  'settings:profile-save': {
    payload: SaveModelProfileRequest
    result: SaveModelProfileResult
  }
  'settings:profile-activate': {
    payload: { profileId: string }
    result: ActivateModelProfileResult
  }
  'settings:profile-delete': {
    payload: { profileId: string }
    result: DeleteModelProfileResult
  }
  'settings:profile-verify': {
    payload: { profileId: string | null }
    result: VerifyModelProfileResult
  }
  'settings:reading-save': {
    payload: { preferences: ReadingPreferences }
    result: ReadingPreferencesResult
  }
  'settings:theme-save': { payload: SaveThemeRequest; result: SaveThemeResult }
  'settings:backup-create': { payload: undefined; result: CreateBackupResult }
  'settings:restore-pick': { payload: undefined; result: PickRestoreResult }
  'settings:restore': { payload: { file: string }; result: RestoreBackupResult }
  'settings:open-data-directory': {
    payload: undefined
    result: OpenDataDirectoryResult
  }
}

/**
 * 主进程主动推给渲染层的事件。事件同样走白名单，不在表里的订阅在 preload 就被拦下。
 */
export interface IpcEventContract {
  'chat:event': ChatStreamUpdate
}

export type IpcChannel = keyof IpcContract
export type IpcEventChannel = keyof IpcEventContract

// 用 Record 而不是数组列 channel：契约里加了 channel 却忘了登记，这里会编译失败。
const CHANNEL_TABLE: Record<IpcChannel, true> = {
  'app:bootstrap': true,
  'home:summary': true,
  'library:list': true,
  'library:reimport': true,
  'library:detail': true,
  'library:search': true,
  'reading:open': true,
  'reading:progress': true,
  'reading:settings': true,
  'reading:collect': true,
  'dictionary:lookup': true,
  'entries:card': true,
  'entries:delete-sentence': true,
  'entries:list': true,
  'entries:page': true,
  'entries:sentence': true,
  'entries:merge': true,
  'entries:main-form': true,
  'entries:move-sentence': true,
  'entries:reselect-sentence': true,
  'entries:create-note': true,
  'entries:update-note': true,
  'entries:pin-note': true,
  'entries:delete-note': true,
  'entries:move-note': true,
  'chat:start': true,
  'chat:stop': true,
  'chat:list': true,
  'chat:thread': true,
  'chat:create': true,
  'chat:ask': true,
  'chat:edit-question': true,
  'chat:answer': true,
  'chat:continue': true,
  'chat:context': true,
  'chat:candidates': true,
  'chat:switch-question': true,
  'chat:switch-answer': true,
  'chat:export-jsonl': true,
  'pins:create': true,
  'pins:board': true,
  'pins:move': true,
  'pins:delete': true,
  'pins:file-all': true,
  'pins:restore': true,
  'pins:source': true,
  'settings:overview': true,
  'settings:profile-save': true,
  'settings:profile-activate': true,
  'settings:profile-delete': true,
  'settings:profile-verify': true,
  'settings:reading-save': true,
  'settings:theme-save': true,
  'settings:backup-create': true,
  'settings:restore-pick': true,
  'settings:restore': true,
  'settings:open-data-directory': true
}

const EVENT_CHANNEL_TABLE: Record<IpcEventChannel, true> = {
  'chat:event': true
}

export const IPC_CHANNELS: readonly IpcChannel[] = Object.keys(
  CHANNEL_TABLE
) as readonly IpcChannel[]

export function isIpcChannel(value: unknown): value is IpcChannel {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(CHANNEL_TABLE, value)
  )
}

export function isIpcEventChannel(value: unknown): value is IpcEventChannel {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVENT_CHANNEL_TABLE, value)
  )
}

/**
 * preload 挂到 `window.api` 上的接口。渲染层只认这一种访问主进程的方式。
 */
export type IpcBridge = {
  invoke<C extends IpcChannel>(
    channel: C,
    payload?: IpcContract[C]['payload']
  ): Promise<IpcContract[C]['result']>
  subscribe<E extends IpcEventChannel>(
    event: E,
    handler: (payload: IpcEventContract[E]) => void
  ): () => void
}
