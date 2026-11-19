import { describe, expect, it } from 'vitest'
import {
  HOME_LATER_EMPTY,
  laterMarkedNotice,
  laterRemoveLabel,
  laterToggleLabel,
  laterUnmarkedNotice
} from './format'

/**
 * 「稍后看」的界面文案：按钮随状态换名字，标记与移除都给一句带词条名的反馈，
 * 首页空态说清去哪儿标。文案由渲染层共用，词条页、阅读词条卡与首页不各写一套。
 */

describe('laterToggleLabel', () => {
  it('没标时给「稍后看」，标了给「取消稍后看」', () => {
    expect(laterToggleLabel(false)).toBe('稍后看')
    expect(laterToggleLabel(true)).toBe('取消稍后看')
  })
})

describe('稍后看反馈文案', () => {
  it('标记后明确说已加入并带上词条名', () => {
    expect(laterMarkedNotice('approach')).toBe('已把「approach」加入稍后看。')
  })

  it('移除后明确说「已移除」，不是静默消失', () => {
    expect(laterUnmarkedNotice('approach')).toBe('已移除「approach」的稍后看标记。')
    expect(laterUnmarkedNotice('approach')).toContain('已移除')
  })

  it('首页移除按钮的无障碍名称带词条名，避免只读到一个「移除」', () => {
    expect(laterRemoveLabel('approach')).toBe('从稍后看移除 approach')
  })
})

describe('HOME_LATER_EMPTY', () => {
  it('空态说清这里会收什么、去哪儿标', () => {
    expect(HOME_LATER_EMPTY).toContain('稍后看')
    expect(HOME_LATER_EMPTY).toContain('词条')
  })
})
