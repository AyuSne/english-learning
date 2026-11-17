export type Theme = 'light' | 'dark'

/**
 * 渲染层启动时经 bridge 从主进程读到的一份值。渲染层自己不碰数据库。
 */
export type AppBootstrap = {
  appVersion: string
  isPackaged: boolean
  schemaVersion: number
  theme: Theme
}
