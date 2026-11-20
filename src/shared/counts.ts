import type { IpcChannel } from './ipc-contract'

/**
 * 左侧全局栏的三个计数：词条数、文章数（真题与 AI 生成一起算）与未归档钉住数。
 * 口径与词条页、文章库、钉板各自读的同一张表一致，不在界面另算一套。
 */
export type NavCounts = {
  entries: number
  articles: number
  unfiled: number
}

export type NavCountKey = keyof NavCounts

/**
 * 会改变全局栏计数的写 channel。渲染层只在统一的 IPC 调用边界上，
 * 对这张表里的 channel 在成功返回后发一次失效信号；读 channel 与
 * 只改阅读设置、学习指令、模型配置的写 channel 都不进这张表，避免无谓重查。
 *
 * 判断标准：这次写是否可能让 word_entry、article 或 pin 的未归档条数变化。
 */
export const COUNT_AFFECTING_CHANNELS = [
  // 语料重新导入可能补回文章；删除文章会同时动到三个数。
  'library:reimport',
  'library:delete',
  // 存为文章在文章库里新增一篇 AI 生成文章。
  'library:save-generated',
  // 收词会建词条；删最后一条原句会连词条一起删，挂在上面的钉住退回未归档。
  'reading:collect',
  'entries:delete-sentence',
  // 合并、拆分与重新圈定都可能新建或删掉词条。
  'entries:merge',
  'entries:move-sentence',
  'entries:reselect-sentence',
  // 稍后看只写独立标记，不增删词条；失败与成功的口径都以重查结果为准。
  'entries:later',
  // 删线程保留钉住快照，未归档数不该跟着掉；重查一次确认没有误减。
  'chat:delete',
  // 钉住的新增、改落点、删除、全部归位与撤销都会改变未归档条数。
  'pins:create',
  'pins:move',
  'pins:delete',
  'pins:file-all',
  'pins:restore',
  // 从备份恢复会整库替换，三个数都要按新库重新读。
  'settings:restore'
] as const satisfies readonly IpcChannel[]

export type CountAffectingChannel = (typeof COUNT_AFFECTING_CHANNELS)[number]

const COUNT_AFFECTING = new Set<string>(COUNT_AFFECTING_CHANNELS)

/** 这次写成功后是否值得让全局栏计数失效并重查。 */
export function affectsNavCounts(channel: string): boolean {
  return COUNT_AFFECTING.has(channel)
}
