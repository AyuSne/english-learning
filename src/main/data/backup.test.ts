import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { askQuestion, createThread, readThreadView } from '../chat/threads'
import { openDatabase, type AppDatabase } from '../db/database'
import {
  migrate,
  migrations,
  readSchemaVersion,
  LATEST_SCHEMA_VERSION
} from '../db/migrations'
import { readThemePreference, writeSetting } from '../db/settings'
import { createModelProfile, listModelProfiles } from '../settings/profiles'
import type { SecretStore } from '../settings/secret-store'
import {
  BackupTargetError,
  createBackup,
  inspectBackupFile,
  readLastBackup,
  readLastSnapshot,
  restoreBackup
} from './backup'

let directory: string
let database: AppDatabase

const now = '2026-11-18T11:00:00.000Z'
const later = '2026-11-18T12:00:00.000Z'
const evenLater = '2026-11-18T13:00:00.000Z'

function startThread(text: string): string {
  const created = createThread(database, { main: { kind: 'none' } })
  if (created.status !== 'created') {
    throw new Error('线程没有建起来')
  }
  const asked = askQuestion(database, { threadId: created.thread.id, text })
  if (asked.status !== 'asked') {
    throw new Error('问题没有落库')
  }
  return created.thread.id
}

function snapshots(): string {
  return join(directory, 'snapshots')
}

const secrets: SecretStore = {
  encrypt: (plain) => `sealed:${plain}`,
  decrypt: (sealed) => (sealed.startsWith('sealed:') ? sealed.slice('sealed:'.length) : null)
}

function saveProfile(apiKey: string): void {
  createModelProfile(
    database,
    {
      name: 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey,
      verification: 'verified',
      lastError: null,
      lastCheckedAt: now,
      lastVerifiedAt: now
    },
    { secrets, now }
  )
}

function backupFile(name = 'backup.db'): string {
  return join(directory, 'chosen', name)
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-backup-'))
  database = openDatabase(join(directory, 'library.db'))
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('createBackup', () => {
  it('备份是一份独立的整库副本，路径不必事先存在', async () => {
    writeSetting(database, 'theme', 'dark')
    const file = backupFile()

    const backup = await createBackup(database, { file, now })

    expect(backup).toMatchObject({ file, at: now, kind: 'manual', exists: true })
    expect(backup.bytes).toBe(statSync(file).size)
    expect(backup.bytes).toBeGreaterThan(0)
    expect(existsSync(`${file}-wal`)).toBe(false)
    expect(existsSync(`${file}-shm`)).toBe(false)

    const copy = openDatabase(file)
    try {
      expect(readThemePreference(copy)).toBe('dark')
      expect(readSchemaVersion(copy)).toBe(LATEST_SCHEMA_VERSION)
    } finally {
      copy.close()
    }
  })

  it('密钥不进备份：副本里没有密钥，状态回到未验证', async () => {
    saveProfile('sk-secret-9999')
    const file = backupFile()

    await createBackup(database, { file, now })

    const copy = openDatabase(file)
    try {
      const profiles = listModelProfiles(copy, secrets)
      expect(profiles).toHaveLength(1)
      expect(profiles[0]?.apiKeyMask).toBeNull()
      expect(profiles[0]?.verification).toBe('unverified')
      expect(profiles[0]?.lastVerifiedAt).toBeNull()
    } finally {
      copy.close()
    }
    // 连密钥的字节都不该留在副本里（否则从空闲页里还能捞出来）。
    expect(readFileSync(file).includes('sk-secret-9999')).toBe(false)
  })

  it('记下上次备份的时间、路径与体积', async () => {
    const file = backupFile()
    const backup = await createBackup(database, { file, now })

    expect(readLastBackup(database)).toMatchObject({
      at: now,
      file,
      bytes: backup.bytes,
      kind: 'manual',
      exists: true
    })
  })

  it('备份文件被挪走后，仍记得时间，但标出文件已不在原处', async () => {
    const file = backupFile()
    await createBackup(database, { file, now })
    rmSync(file)

    const last = readLastBackup(database)

    expect(last).toMatchObject({ at: now, exists: false })
  })

  it('没有备份过时不编造一份', () => {
    expect(readLastBackup(database)).toBeNull()
  })
})

describe('restoreBackup', () => {
  it('恢复用备份内容整体替换本机资料库，并先留一份恢复前快照', async () => {
    writeSetting(database, 'theme', 'dark')
    saveProfile('sk-snapshot-9999')
    const keptThread = startThread('备份前的问题')
    const file = backupFile()
    await createBackup(database, { file, now })

    writeSetting(database, 'theme', 'light')
    const laterThread = startThread('备份之后的问题')

    const outcome = await restoreBackup(database, {
      file,
      snapshotDirectory: snapshots(),
      now: later
    })

    expect(outcome.status).toBe('restored')
    expect(readThemePreference(database)).toBe('dark')
    expect(readThreadView(database, keptThread)?.title).toBe('备份前的问题')
    expect(readThreadView(database, laterThread)).toBeNull()
    // 恢复的是备份，所以密钥没了，要重填。
    expect(listModelProfiles(database, secrets)[0]?.apiKeyMask).toBeNull()

    if (outcome.status !== 'restored') {
      throw new Error('恢复没有成功')
    }
    expect(outcome.snapshot).toMatchObject({ kind: 'before-restore', at: later, exists: true })
    expect(existsSync(outcome.snapshot.file)).toBe(true)
    // 恢复动作本身也记进「上次备份」：界面上的时间与体积不会因为恢复而消失。
    expect(readLastBackup(database)).toMatchObject({ file, exists: true })

    // 快照里是恢复前那份库：备份之后新建的线程还在，本机加密的密钥也在。
    const snapshot = openDatabase(outcome.snapshot.file)
    try {
      expect(readThreadView(snapshot, laterThread)).not.toBeNull()
      expect(listModelProfiles(snapshot, secrets)[0]?.apiKeyMask).not.toBeNull()
    } finally {
      snapshot.close()
    }
  })

  it('快照本身也能再换回来，恢复错了还有退路', async () => {
    saveProfile('sk-snapshot-0002')
    const original = startThread('恢复前的问题')
    const file = backupFile()
    await createBackup(database, { file, now })
    const added = startThread('备份之后的问题')
    const first = await restoreBackup(database, {
      file,
      snapshotDirectory: snapshots(),
      now: later
    })
    if (first.status !== 'restored') {
      throw new Error('第一次恢复没有成功')
    }
    expect(readThreadView(database, added)).toBeNull()

    const back = await restoreBackup(database, {
      file: first.snapshot.file,
      snapshotDirectory: snapshots(),
      now: evenLater
    })

    expect(back.status).toBe('restored')
    expect(readThreadView(database, added)).not.toBeNull()
    expect(readThreadView(database, original)).not.toBeNull()
    // 快照是本机回退副本：从它换回来，密钥也跟着回来，不用重填。
    expect(listModelProfiles(database, secrets)[0]?.apiKeyMask).not.toBeNull()
    expect(readLastSnapshot(database)).toMatchObject({ at: evenLater, exists: true })
  })

  it('同一秒里恢复两次，快照不互相覆盖', async () => {
    const file = backupFile()
    await createBackup(database, { file, now })

    const first = await restoreBackup(database, {
      file,
      snapshotDirectory: snapshots(),
      now: later
    })
    const second = await restoreBackup(database, {
      file,
      snapshotDirectory: snapshots(),
      now: later
    })

    if (first.status !== 'restored' || second.status !== 'restored') {
      throw new Error('恢复没有成功')
    }
    expect(second.snapshot.file).not.toBe(first.snapshot.file)
    expect(existsSync(first.snapshot.file)).toBe(true)
    expect(existsSync(second.snapshot.file)).toBe(true)
  })

  it('恢复后密钥为空：备份里没有它，得重新填', async () => {
    saveProfile('sk-restore-0001')
    const file = backupFile()
    await createBackup(database, { file, now })

    const outcome = await restoreBackup(database, {
      file,
      snapshotDirectory: snapshots(),
      now: later
    })

    expect(outcome.status).toBe('restored')
    const profiles = listModelProfiles(database, secrets)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.apiKeyMask).toBeNull()
    expect(profiles[0]?.verification).toBe('unverified')
  })

  it('旧版本的备份恢复后就地升到当前 schema，数据照常可读', async () => {
    const oldFile = join(directory, 'old-schema.db')
    const oldDatabase = openDatabase(oldFile)
    try {
      migrate(oldDatabase, { migrations: migrations.slice(0, 3) })
      writeSetting(oldDatabase, 'theme', 'dark')
    } finally {
      oldDatabase.close()
    }

    const outcome = await restoreBackup(database, {
      file: oldFile,
      snapshotDirectory: snapshots(),
      now: later
    })

    expect(outcome.status).toBe('restored')
    expect(readSchemaVersion(database)).toBe(LATEST_SCHEMA_VERSION)
    expect(readThemePreference(database)).toBe('dark')
  })

  it('版本高于当前程序的备份拒绝恢复，本机数据不动', async () => {
    const thread = startThread('还在的问题')
    writeSetting(database, 'theme', 'dark')
    const futureFile = join(directory, 'future.db')
    const future = openDatabase(futureFile)
    try {
      future.exec('CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
      future.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`)
    } finally {
      future.close()
    }

    const outcome = await restoreBackup(database, {
      file: futureFile,
      snapshotDirectory: snapshots(),
      now: later
    })

    expect(outcome).toEqual({ status: 'rejected', reason: 'too-new' })
    expect(readThreadView(database, thread)).not.toBeNull()
    expect(readThemePreference(database)).toBe('dark')
    expect(existsSync(snapshots())).toBe(false)
  })

  it('不是本程序的库拒绝恢复', async () => {
    const foreignFile = join(directory, 'foreign.db')
    const foreign = openDatabase(foreignFile)
    try {
      foreign.exec('CREATE TABLE notes (body TEXT)')
    } finally {
      foreign.close()
    }

    expect(
      await restoreBackup(database, {
        file: foreignFile,
        snapshotDirectory: snapshots(),
        now: later
      })
    ).toEqual({ status: 'rejected', reason: 'not-a-library' })
  })

  it('根本不是数据库的文件拒绝恢复', async () => {
    const textFile = join(directory, 'not-a-database.db')
    writeFileSync(textFile, '这不是数据库')

    expect(
      await restoreBackup(database, {
        file: textFile,
        snapshotDirectory: snapshots(),
        now: later
      })
    ).toEqual({ status: 'rejected', reason: 'not-a-database' })
  })

  it('找不到备份文件时说找不到', async () => {
    expect(
      await restoreBackup(database, {
        file: join(directory, 'no-such-backup.db'),
        snapshotDirectory: snapshots(),
        now: later
      })
    ).toEqual({ status: 'rejected', reason: 'missing' })
  })

  it('不能拿正在用的库文件当备份来源', async () => {
    expect(
      await restoreBackup(database, {
        file: database.name,
        snapshotDirectory: snapshots(),
        now: later
      })
    ).toEqual({ status: 'rejected', reason: 'same-file' })
  })

  it('备份不能写到正在用的库文件上', async () => {
    await expect(createBackup(database, { file: database.name, now })).rejects.toBeInstanceOf(
      BackupTargetError
    )
    expect(readLastBackup(database)).toBeNull()
  })
})

describe('inspectBackupFile', () => {
  it('挑选备份文件时先看清版本、体积与时间，不动本机数据', async () => {
    const file = backupFile()
    await createBackup(database, { file, now })

    const inspection = inspectBackupFile(file)

    expect(inspection).toMatchObject({
      ok: true,
      schemaVersion: LATEST_SCHEMA_VERSION,
      bytes: statSync(file).size
    })
    if (inspection.ok) {
      expect(Number.isNaN(Date.parse(inspection.createdAt))).toBe(false)
    }
  })

  it('不是本程序的库不会被当成备份', () => {
    const foreignFile = join(directory, 'foreign-inspect.db')
    const foreign = openDatabase(foreignFile)
    try {
      foreign.exec('CREATE TABLE notes (body TEXT)')
    } finally {
      foreign.close()
    }

    expect(inspectBackupFile(foreignFile)).toEqual({ ok: false, reason: 'not-a-library' })
  })

  it('版本号写着本程序、表却不齐的文件不会被当成备份', () => {
    const fakeFile = join(directory, 'fake-library.db')
    const fake = openDatabase(fakeFile)
    try {
      fake.exec('CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
      fake.pragma(`user_version = ${LATEST_SCHEMA_VERSION}`)
    } finally {
      fake.close()
    }

    expect(inspectBackupFile(fakeFile)).toEqual({ ok: false, reason: 'not-a-library' })
  })

  it('读不了的目标（比如目录）说不是数据库，不把异常抛给界面', () => {
    expect(inspectBackupFile(directory)).toEqual({ ok: false, reason: 'not-a-database' })
  })
})
