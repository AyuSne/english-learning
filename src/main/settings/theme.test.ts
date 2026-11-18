import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isThemePreference } from '../../shared/types'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { readThemePreference, writeThemePreference } from '../db/settings'
import { saveThemePreference } from './theme'

let directory: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-theme-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('saveThemePreference', () => {
  it('浅色、深色与跟随系统都写入并原样返回', () => {
    expect(saveThemePreference(database, 'dark')).toEqual({ saved: true, theme: 'dark' })
    expect(readThemePreference(database)).toBe('dark')

    expect(saveThemePreference(database, 'system')).toEqual({
      saved: true,
      theme: 'system'
    })
    expect(readThemePreference(database)).toBe('system')

    expect(saveThemePreference(database, 'light')).toEqual({ saved: true, theme: 'light' })
    expect(readThemePreference(database)).toBe('light')
  })

  it('不认识的值不写入，返回当前偏好', () => {
    writeThemePreference(database, 'dark')

    expect(saveThemePreference(database, 'sepia' as never)).toEqual({
      saved: false,
      theme: 'dark'
    })
    expect(readThemePreference(database)).toBe('dark')
  })
})

describe('isThemePreference', () => {
  it('只认三个值', () => {
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('sepia')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })
})
