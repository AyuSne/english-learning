import type {
  CreateBackupResult,
  RestoreBackupResult
} from '../../shared/settings'
import type { AppDatabase } from '../db/database'
import { readSettingsOverview, type OverviewOptions } from '../settings/operations'
import {
  BackupTargetError,
  createBackup,
  restoreBackup,
  snapshotDirectoryOf
} from './backup'

/**
 * 设置页「数据」区的两个动作。系统对话框留在主进程的接线处，
 * 这里只管文件已经选定之后的事：失败原因、概览刷新与快照位置。
 */

export type DataOperationOptions = OverviewOptions & { now?: string }

function nowOf(options: DataOperationOptions): string {
  return options.now ?? new Date().toISOString()
}

export async function backupTo(
  database: AppDatabase,
  file: string,
  options: DataOperationOptions
): Promise<CreateBackupResult> {
  try {
    const backup = await createBackup(database, { file, now: nowOf(options) })
    return {
      status: 'saved',
      backup,
      overview: readSettingsOverview(database, options)
    }
  } catch (error) {
    const target = error instanceof BackupTargetError
    if (!target) {
      console.warn('[backup] 备份没有写成：', error)
    }
    return {
      status: 'failed',
      reason: target ? 'same-file' : 'unknown',
      overview: readSettingsOverview(database, options)
    }
  }
}

export async function restoreFrom(
  database: AppDatabase,
  file: string,
  options: DataOperationOptions
): Promise<RestoreBackupResult> {
  const outcome = await restoreBackup(database, {
    file,
    snapshotDirectory: snapshotDirectoryOf(options.dataDirectory),
    now: nowOf(options)
  })
  const overview = readSettingsOverview(database, options)

  switch (outcome.status) {
    case 'restored':
      return { status: 'restored', snapshot: outcome.snapshot, overview }
    case 'rejected':
      return { status: 'rejected', reason: outcome.reason, overview }
    case 'failed':
      console.warn('[backup] 恢复没有完成，退回快照：', outcome.rolledBack)
      return {
        status: 'failed',
        snapshot: outcome.snapshot,
        rolledBack: outcome.rolledBack,
        overview
      }
  }
}
