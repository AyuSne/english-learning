import { app } from 'electron'
import type { AppBootstrap } from '../shared/types'
import type { AppDatabase } from './db/database'
import { readSchemaVersion } from './db/migrations'
import { readTheme } from './db/settings'

/**
 * 渲染层启动时读到的那一份值：全部来自主进程与已迁移的本机资料库。
 */
export function createBootstrap(database: AppDatabase): AppBootstrap {
  return {
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    schemaVersion: readSchemaVersion(database),
    theme: readTheme(database)
  }
}
