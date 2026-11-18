import { describe, expect, it } from 'vitest'
import type { ModelProfileSummary, SaveModelProfileResult } from '../../../shared/settings'
import {
  checkText,
  formatMoment,
  profileSaveErrorText,
  readingDefaultsText,
  themeText,
  verificationText,
  verifyResultText
} from './format'

function profile(patch: Partial<ModelProfileSummary> = {}): ModelProfileSummary {
  return {
    id: 'profile-1',
    name: 'DeepSeek 官方',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    apiKeyMask: 'sk-·············0001',
    verification: 'unverified',
    lastError: null,
    lastCheckedAt: null,
    lastVerifiedAt: null,
    active: false,
    ...patch
  }
}

const checkedAt = new Date(2026, 10, 17, 9, 12).toISOString()

describe('verificationText', () => {
  it('只有通过校验的那份写已验证', () => {
    expect(verificationText(profile())).toBe('未验证')
    expect(verificationText(profile({ verification: 'verified' }))).toBe('已验证')
  })
})

describe('checkText', () => {
  it('从没校验过时直说', () => {
    expect(checkText(profile())).toBe('还没校验过')
  })

  it('校验通过写时间', () => {
    expect(
      checkText(
        profile({
          verification: 'verified',
          lastCheckedAt: checkedAt,
          lastVerifiedAt: checkedAt
        })
      )
    ).toBe(`上次校验 ${formatMoment(checkedAt)} 通过`)
  })

  it('成功调用自动转已验证时，用最后一次证实的时刻', () => {
    const verifiedAt = new Date(2026, 10, 18, 10, 30).toISOString()

    expect(
      checkText(
        profile({
          verification: 'verified',
          lastCheckedAt: checkedAt,
          lastVerifiedAt: verifiedAt,
          lastError: null
        })
      )
    ).toBe(`上次校验 ${formatMoment(verifiedAt)} 通过`)
  })

  it.each([
    ['invalid-key', '密钥无效'],
    ['invalid-config', '接口地址或模型名不对'],
    ['network', '未能完成']
  ] as const)('校验没过时说明原因：%s', (lastError, part) => {
    expect(
      checkText(profile({ lastError, lastCheckedAt: checkedAt }))
    ).toBe(`上次校验 ${formatMoment(checkedAt)} 未通过 · ${part}`)
  })
})

describe('formatMoment', () => {
  it('按本机时区写成 年-月-日 时:分', () => {
    const date = new Date(2026, 0, 2, 3, 4)
    expect(formatMoment(date.toISOString())).toBe('2026-01-02 03:04')
  })

  it('坏值不显示成假时间', () => {
    expect(formatMoment('nope')).toBe('')
  })
})

describe('themeText', () => {
  it('三档各有中文名', () => {
    expect(themeText('light')).toBe('浅色')
    expect(themeText('dark')).toBe('深色')
    expect(themeText('system')).toBe('跟随系统')
  })
})

describe('readingDefaultsText', () => {
  it('把全局默认写在一行里', () => {
    expect(
      readingDefaultsText({
        fontSize: 20,
        lineHeight: 1.8,
        annotationsVisible: true,
        weakHighlight: true
      })
    ).toBe('字号 20 · 行距 1.8 · 注释显示 · 弱高亮开')

    expect(
      readingDefaultsText({
        fontSize: 22,
        lineHeight: 2,
        annotationsVisible: false,
        weakHighlight: false
      })
    ).toBe('字号 22 · 行距 2.0 · 注释隐藏 · 弱高亮关')
  })
})

describe('verifyResultText', () => {
  it('测试连接的结果各有说法', () => {
    expect(verifyResultText('verified')).toBe('连接正常')
    expect(verifyResultText('invalid-key')).toBe('密钥无效')
    expect(verifyResultText('invalid-config')).toBe('接口地址或模型名不对')
    expect(verifyResultText('unverified')).toBe('暂时连不上，稍后再试')
    expect(verifyResultText('missing')).toBe('这套配置已经不在了')
  })
})

describe('profileSaveErrorText', () => {
  function result(patch: Partial<SaveModelProfileResult>): SaveModelProfileResult {
    return { status: 'saved', overview: {} as SaveModelProfileResult['overview'], ...patch }
  }

  it('必填项的问题逐字段说', () => {
    expect(profileSaveErrorText(result({ status: 'invalid', field: 'name' }))).toBe(
      '名称不能为空'
    )
    expect(profileSaveErrorText(result({ status: 'invalid', field: 'baseUrl' }))).toBe(
      '接口地址要以 http:// 或 https:// 开头'
    )
    expect(profileSaveErrorText(result({ status: 'invalid', field: 'model' }))).toBe(
      '模型名不能为空'
    )
  })

  it('密钥被拒时说明原密钥保留，新增时只说没保存', () => {
    expect(
      profileSaveErrorText(
        result({
          status: 'rejected',
          field: 'apiKey',
          error: { code: 'invalid-key', status: 401 }
        })
      )
    ).toBe('密钥无效，没有保存。')

    expect(
      profileSaveErrorText(
        result({
          status: 'rejected',
          field: 'apiKey',
          profileId: 'profile-1',
          error: { code: 'invalid-key', status: 401 }
        })
      )
    ).toBe('密钥无效，没有保存；原密钥仍然保留。')

    expect(
      profileSaveErrorText(
        result({
          status: 'rejected',
          field: 'model',
          error: { code: 'unknown', status: 404 }
        })
      )
    ).toBe('接口地址或模型名不对，没有保存。')
  })

  it('加密不可用与配置不存在各有提示', () => {
    expect(profileSaveErrorText(result({ status: 'encryption-unavailable' }))).toBe(
      '本机无法加密保存密钥。'
    )
    expect(profileSaveErrorText(result({ status: 'missing' }))).toBe('这套配置已经不在了。')
  })

  it('保存成功没有错误文案', () => {
    expect(profileSaveErrorText(result({}))).toBeNull()
  })
})
