import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../../shared/types'

describe('resolveTheme', () => {
  it('浅色与深色按选择走，不管系统', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('跟随系统时按系统的深浅取一套', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
