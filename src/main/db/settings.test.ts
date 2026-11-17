import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from './database'
import { migrate } from './migrations'
import { readSetting, readTheme, writeSetting } from './settings'

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-settings-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('readTheme', () => {
  it('没有设置过时用浅色', () => {
    expect(readSetting(database, 'theme')).toBeNull()
    expect(readTheme(database)).toBe('light')
  })

  it('写入后按设置读回，重复写入覆盖旧值', () => {
    writeSetting(database, 'theme', 'dark')
    expect(readTheme(database)).toBe('dark')

    writeSetting(database, 'theme', 'light')
    expect(readTheme(database)).toBe('light')
  })

  it('主题值不认识时回落到浅色', () => {
    writeSetting(database, 'theme', 'sepia')
    expect(readTheme(database)).toBe('light')
  })
})
