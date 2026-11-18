import { describe, expect, it } from 'vitest'
import { settingsLabel, settingsSourceLabel } from './settings-text'

describe('设置文字', () => {
  it('字号与行距写成面板上的那一行', () => {
    expect(settingsLabel({ fontSize: 20, lineHeight: 1.8 })).toBe('字号 20 · 行距 1.8')
  })

  it('来源写成本篇还是全局默认', () => {
    expect(settingsSourceLabel('article')).toBe('按本篇记住')
    expect(settingsSourceLabel('global')).toBe('来自全局默认')
  })
})
