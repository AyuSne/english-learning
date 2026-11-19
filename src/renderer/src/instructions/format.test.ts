import { describe, expect, it } from 'vitest'
import { instructionUpdatedText } from './format'

describe('instructionUpdatedText', () => {
  it('把更新时间写成本机时区的年月日与时:分', () => {
    expect(instructionUpdatedText('2026-11-20T01:05:00')).toBe('更新于 2026-11-20 01:05')
  })

  it('坏值不假装成时间', () => {
    expect(instructionUpdatedText('not-a-date')).toBe('')
  })
})
