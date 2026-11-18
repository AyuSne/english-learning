import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from './database'
import { migrate } from './migrations'
import { readSetting, readThemePreference, writeSetting, writeThemePreference } from './settings'

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

describe('readThemePreference', () => {
  it('没有设置过时用浅色', () => {
    expect(readSetting(database, 'theme')).toBeNull()
    expect(readThemePreference(database)).toBe('light')
  })

  it('浅色、深色与跟随系统都能原样读回', () => {
    writeThemePreference(database, 'dark')
    expect(readThemePreference(database)).toBe('dark')

    writeThemePreference(database, 'system')
    expect(readThemePreference(database)).toBe('system')

    writeThemePreference(database, 'light')
    expect(readThemePreference(database)).toBe('light')
  })

  it('主题值不认识时回落到浅色', () => {
    writeSetting(database, 'theme', 'sepia')
    expect(readThemePreference(database)).toBe('light')
  })
})
