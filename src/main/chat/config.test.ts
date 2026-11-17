import { describe, expect, it } from 'vitest'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, readChatConfig } from './config'

describe('readChatConfig', () => {
  it('缺密钥时没有可用配置', () => {
    expect(readChatConfig({})).toBeNull()
    expect(readChatConfig({ DEEPSEEK_API_KEY: '   ' })).toBeNull()
  })

  it('只填密钥时用默认接口地址与模型名', () => {
    expect(readChatConfig({ DEEPSEEK_API_KEY: 'test-key' })).toEqual({
      apiKey: 'test-key',
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL
    })
  })

  it('环境变量可以覆盖地址与模型名，并去掉首尾空白', () => {
    expect(
      readChatConfig({
        DEEPSEEK_API_KEY: ' test-key ',
        DEEPSEEK_BASE_URL: ' http://127.0.0.1:1234 ',
        DEEPSEEK_MODEL: ' deepseek-v4-pro '
      })
    ).toEqual({
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:1234',
      model: 'deepseek-v4-pro'
    })
  })
})
