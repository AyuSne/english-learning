import type { ImportReport } from './library'

export type Theme = 'light' | 'dark'

/**
 * 渲染层启动时经 bridge 从主进程读到的一份值。渲染层自己不碰数据库。
 */
export type AppBootstrap = {
  appVersion: string
  isPackaged: boolean
  schemaVersion: number
  theme: Theme
  /** 本次启动的语料导入结果；失败项要在文章库里提示出来。 */
  corpusImport: ImportReport
}
