import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import {
  activateModelProfile,
  createModelProfile,
  deleteModelProfile,
  listModelProfiles,
  markProfileCheckFailed,
  markProfileVerified,
  maskApiKey,
  readActiveProfile,
  readActiveProfileId,
  updateModelProfile
} from './profiles'
import type { SecretStore } from './secret-store'

let directory: string
let database: AppDatabase

/** 测试替身：可逆的假加密，只用来观察明文有没有被带进摘要。 */
const secrets: SecretStore = {
  encrypt: (plain) => `sealed:${Buffer.from(plain, 'utf8').toString('base64')}`,
  decrypt: (sealed) =>
    sealed.startsWith('sealed:')
      ? Buffer.from(sealed.slice('sealed:'.length), 'base64').toString('utf8')
      : null
}

const now = '2026-11-18T09:00:00.000Z'

function create(
  input: {
    name?: string
    model?: string
    apiKey?: string | null
  } = {}
): string {
  return createModelProfile(
    database,
    {
      name: input.name ?? 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com',
      model: input.model ?? 'deepseek-flash',
      apiKey: input.apiKey === undefined ? 'sk-abcdefghijklmnop' : input.apiKey,
      verification: 'unverified',
      lastError: null,
      lastCheckedAt: null,
      lastVerifiedAt: null
    },
    { secrets, now }
  )
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-profiles-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('model profiles', () => {
  it('新增第一套就成为使用中的那套，摘要只给掩码、不带密钥明文', () => {
    const id = create()

    const profiles = listModelProfiles(database, secrets)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]).toEqual({
      id,
      name: 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKeyMask: 'sk-·············mnop',
      verification: 'unverified',
      lastError: null,
      lastCheckedAt: null,
      lastVerifiedAt: null,
      active: true
    })
    expect(JSON.stringify(profiles)).not.toContain('abcdefghijkl')

    // 主进程自己仍能拿到明文去发请求。
    expect(readActiveProfile(database, secrets)?.apiKey).toBe('sk-abcdefghijklmnop')
  })

  it('第二套不会抢走使用中，切换之后才轮到它', () => {
    const first = create()
    const second = create({ name: '本地 Ollama', model: 'qwen2.5:7b', apiKey: '' })

    expect(listModelProfiles(database, secrets).map((profile) => profile.active)).toEqual([
      true,
      false
    ])

    expect(activateModelProfile(database, second)).toBe(true)
    expect(listModelProfiles(database, secrets).map((profile) => profile.active)).toEqual([
      false,
      true
    ])
    expect(readActiveProfile(database, secrets)?.profile.id).toBe(second)
    expect(readActiveProfile(database, secrets)?.apiKey).toBe('')

    expect(activateModelProfile(database, 'missing')).toBe(false)
    expect(readActiveProfile(database, secrets)?.profile.id).toBe(second)
    expect(first).not.toBe(second)
  })

  it('编辑时不给密钥就保留原密钥，传 null 才清除', () => {
    const id = create()

    expect(
      updateModelProfile(
        database,
        id,
        { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' },
        { secrets, now }
      )
    ).toBe(true)
    expect(readActiveProfile(database, secrets)?.apiKey).toBe('sk-abcdefghijklmnop')
    expect(listModelProfiles(database, secrets)[0]).toMatchObject({
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-pro',
      apiKeyMask: 'sk-·············mnop'
    })

    expect(
      updateModelProfile(database, id, { apiKey: null }, { secrets, now })
    ).toBe(true)
    expect(listModelProfiles(database, secrets)[0]?.apiKeyMask).toBeNull()
    expect(readActiveProfile(database, secrets)?.apiKey).toBe('')
  })

  it('删除使用中的配置后没有使用中，剩下的等用户自己切；删光后也没有', () => {
    const first = create()
    create({ name: '备用', apiKey: 'sk-second-key-0000' })

    expect(deleteModelProfile(database, first)).toBe(true)
    const remaining = listModelProfiles(database, secrets)
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.name).toBe('备用')
    expect(remaining[0]?.active).toBe(false)
    expect(readActiveProfileId(database)).toBeNull()
    expect(readActiveProfile(database, secrets)).toBeNull()

    expect(deleteModelProfile(database, remaining[0]!.id)).toBe(true)
    expect(listModelProfiles(database, secrets)).toEqual([])
    expect(readActiveProfile(database, secrets)).toBeNull()
    expect(deleteModelProfile(database, 'missing')).toBe(false)
  })

  it('校验成功与失败都记下时间与原因，成功会清掉上次的错误', () => {
    const id = create()

    markProfileCheckFailed(database, id, 'invalid-key', now)
    expect(listModelProfiles(database, secrets)[0]).toMatchObject({
      verification: 'unverified',
      lastError: 'invalid-key',
      lastCheckedAt: now,
      lastVerifiedAt: null
    })

    markProfileVerified(database, id, '2026-11-18T10:00:00.000Z')
    expect(listModelProfiles(database, secrets)[0]).toMatchObject({
      verification: 'verified',
      lastError: null,
      lastCheckedAt: now,
      lastVerifiedAt: '2026-11-18T10:00:00.000Z'
    })
  })
})

describe('maskApiKey', () => {
  it('保留 sk- 前缀与末四位，中间全部隐去', () => {
    expect(maskApiKey('sk-abcdefghijklmnop')).toBe('sk-·············mnop')
    expect(maskApiKey('plain-key-value')).toBe('·············alue')
    expect(maskApiKey('abc')).toBe('·············')
    expect(maskApiKey('  ')).toBe('')
  })
})
