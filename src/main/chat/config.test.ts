import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import {
  activateModelProfile,
  createModelProfile
} from '../settings/profiles'
import type { SecretStore } from '../settings/secret-store'
import { DEFAULT_BASE_URL, DEFAULT_MODEL, readChatConfig, resolveChatConfig } from './config'

const secrets: SecretStore = {
  encrypt: (plain) => `sealed:${Buffer.from(plain, 'utf8').toString('base64')}`,
  decrypt: (sealed) =>
    sealed.startsWith('sealed:')
      ? Buffer.from(sealed.slice('sealed:'.length), 'base64').toString('utf8')
      : null
}

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

describe('resolveChatConfig', () => {
  let directory: string
  let database: AppDatabase

  function createProfile(input: { name: string; model: string; apiKey: string; baseUrl?: string }) {
    return createModelProfile(
      database,
      {
        name: input.name,
        baseUrl: input.baseUrl ?? 'https://profile.example.com',
        model: input.model,
        apiKey: input.apiKey,
        verification: 'unverified',
        lastError: null,
        lastCheckedAt: null,
        lastVerifiedAt: null
      },
      { secrets, now: '2026-11-18T09:00:00.000Z' }
    )
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'english-learning-chat-config-'))
    database = openDatabase(join(directory, 'test.db'))
    migrate(database)
  })

  afterEach(() => {
    database.close()
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  })

  it('没有本机配置时沿用环境变量', () => {
    expect(
      resolveChatConfig(database, secrets, {
        DEEPSEEK_API_KEY: 'env-key',
        DEEPSEEK_BASE_URL: 'http://127.0.0.1:1234',
        DEEPSEEK_MODEL: 'env-model'
      })
    ).toEqual({
      apiKey: 'env-key',
      baseUrl: 'http://127.0.0.1:1234',
      model: 'env-model'
    })
  })

  it('使用中的配置优先于环境变量，并带上配置 id 供校验回写', () => {
    const id = createProfile({
      name: 'DeepSeek 官方',
      model: 'deepseek-v4-pro',
      apiKey: 'sk-profile-key'
    })

    expect(
      resolveChatConfig(database, secrets, {
        DEEPSEEK_API_KEY: 'env-key',
        DEEPSEEK_MODEL: 'env-model'
      })
    ).toEqual({
      apiKey: 'sk-profile-key',
      baseUrl: 'https://profile.example.com',
      model: 'deepseek-v4-pro',
      profileId: id
    })
  })

  it('切换之后的下一次调用用新的一套，未使用中的配置不参与', () => {
    createProfile({ name: '第一套', model: 'model-one', apiKey: 'sk-one' })
    const second = createProfile({ name: '第二套', model: 'model-two', apiKey: 'sk-two' })

    expect(resolveChatConfig(database, secrets, {})).toMatchObject({ model: 'model-one' })
    activateModelProfile(database, second)
    expect(resolveChatConfig(database, secrets, {})).toMatchObject({
      model: 'model-two',
      apiKey: 'sk-two',
      profileId: second
    })
  })

  it('本地配置没有密钥时也照常解析，交给服务端决定要不要密钥', () => {
    createProfile({
      name: '本地 Ollama',
      model: 'qwen2.5:7b',
      apiKey: '',
      baseUrl: 'http://127.0.0.1:11434/v1'
    })

    expect(resolveChatConfig(database, secrets, {})).toEqual({
      apiKey: '',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen2.5:7b',
      profileId: expect.any(String)
    })
  })

  it('既没有本机配置也没有环境变量时没有可用配置', () => {
    expect(resolveChatConfig(database, secrets, {})).toBeNull()
  })
})
