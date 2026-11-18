import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { readSettingsOverview, activateProfile, deleteProfile, saveModelProfile, verifySavedModelProfile } from './operations'
import { listModelProfiles, readActiveProfile } from './profiles'
import type { SecretStore } from './secret-store'
import type { VerifyModelProfileInput, VerifyOutcome } from './verify'

let directory: string
let database: AppDatabase

const secrets: SecretStore = {
  encrypt: (plain) => `sealed:${Buffer.from(plain, 'utf8').toString('base64')}`,
  decrypt: (sealed) =>
    sealed.startsWith('sealed:')
      ? Buffer.from(sealed.slice('sealed:'.length), 'base64').toString('utf8')
      : null
}

const now = '2026-11-18T09:00:00.000Z'

function verifier(outcome: VerifyOutcome): {
  calls: VerifyModelProfileInput[]
  verify: (input: VerifyModelProfileInput) => Promise<VerifyOutcome>
} {
  const calls: VerifyModelProfileInput[] = []
  return {
    calls,
    verify: async (input) => {
      calls.push(input)
      return outcome
    }
  }
}

function overviewOptions() {
  return {
    secrets,
    fallbackModel: '',
    appVersion: '0.1.0',
    electronVersion: '45.0.0',
    dataDirectory: 'C:/data'
  }
}

function save(
  request: Parameters<typeof saveModelProfile>[1],
  verify: (input: VerifyModelProfileInput) => Promise<VerifyOutcome>
) {
  return saveModelProfile(database, request, { ...overviewOptions(), verify, now })
}

const baseRequest = {
  id: null,
  name: 'DeepSeek 官方',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  apiKey: 'sk-new-key-0001'
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-settings-ops-'))
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('saveModelProfile', () => {
  it('新密钥校验通过才落库，状态记成已验证', async () => {
    const check = verifier({ status: 'verified' })

    const result = await save(baseRequest, check.verify)

    expect(result.status).toBe('saved')
    expect(check.calls).toEqual([
      {
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-flash',
        apiKey: 'sk-new-key-0001'
      }
    ])
    expect(result.overview.profiles).toHaveLength(1)
    expect(result.overview.profiles[0]).toMatchObject({
      name: 'DeepSeek 官方',
      apiKeyMask: 'sk-·············0001',
      verification: 'verified',
      lastError: null,
      lastCheckedAt: now,
      lastVerifiedAt: now,
      active: true
    })
    expect(result.overview.activeId).toBe(result.profileId)
    expect(result.overview.activeModel).toBe('deepseek-flash')
  })

  it('密钥被服务端拒绝时不覆盖原来的配置，错误挂在密钥字段上', async () => {
    const accepted = verifier({ status: 'verified' })
    const created = await save(baseRequest, accepted.verify)
    const id = created.profileId as string

    const rejected = verifier({
      status: 'invalid-key',
      error: { code: 'invalid-key', status: 401, requestId: 'req-401' }
    })
    const result = await save(
      {
        id,
        name: '改坏的名字',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'wrong-model',
        apiKey: 'sk-wrong-key'
      },
      rejected.verify
    )

    expect(result.status).toBe('rejected')
    expect(result.field).toBe('apiKey')
    expect(result.error).toMatchObject({ code: 'invalid-key', status: 401, requestId: 'req-401' })
    expect(result.overview.profiles[0]).toMatchObject({
      id,
      name: 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      verification: 'verified'
    })
    expect(readActiveProfile(database, secrets)?.apiKey).toBe('sk-new-key-0001')
  })

  it('新增时密钥被拒就什么都不留', async () => {
    const check = verifier({
      status: 'invalid-key',
      error: { code: 'invalid-key', status: 401 }
    })

    const result = await save(baseRequest, check.verify)

    expect(result).toMatchObject({ status: 'rejected', field: 'apiKey', profileId: null })
    expect(result.overview.profiles).toEqual([])
    expect(listModelProfiles(database, secrets)).toEqual([])
  })

  it('地址或模型名不对时不落库，错误留给表单层面说', async () => {
    const check = verifier({
      status: 'invalid-config',
      error: { code: 'unknown', status: 404 }
    })

    const result = await save({ ...baseRequest, model: 'not-a-model' }, check.verify)

    expect(result).toMatchObject({ status: 'rejected' })
    expect(result.field).toBeUndefined()
    expect(result.overview.profiles).toEqual([])
  })

  it('断网时允许保存为未验证，下次成功调用可以转已验证', async () => {
    const offline = verifier({
      status: 'unverified',
      error: { code: 'network', detail: '连不上' }
    })

    const result = await save(baseRequest, offline.verify)

    expect(result.status).toBe('saved')
    expect(result.overview.profiles[0]).toMatchObject({
      verification: 'unverified',
      lastError: 'network',
      lastCheckedAt: now,
      lastVerifiedAt: null
    })
    expect(readActiveProfile(database, secrets)?.apiKey).toBe('sk-new-key-0001')
  })

  it('编辑但不填新密钥时不发起校验，原密钥与状态都保留', async () => {
    const accepted = verifier({ status: 'verified' })
    const created = await save(baseRequest, accepted.verify)
    const id = created.profileId as string
    const untouched = verifier({ status: 'verified' })

    const result = await save(
      { id, name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-pro' },
      untouched.verify
    )

    expect(untouched.calls).toEqual([])
    expect(result.status).toBe('saved')
    expect(result.overview.profiles[0]).toMatchObject({
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-pro',
      verification: 'verified',
      apiKeyMask: 'sk-·············0001'
    })
    expect(readActiveProfile(database, secrets)?.apiKey).toBe('sk-new-key-0001')
  })

  it('本地模型不填密钥也能存，不试着校验', async () => {
    const check = verifier({ status: 'verified' })

    const result = await save(
      {
        id: null,
        name: '本地 Ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'qwen2.5:7b',
        apiKey: ''
      },
      check.verify
    )

    expect(check.calls).toEqual([])
    expect(result.status).toBe('saved')
    expect(result.overview.profiles[0]?.apiKeyMask).toBeNull()
    expect(result.overview.profiles[0]?.verification).toBe('unverified')
  })

  it('清除密钥后不再显示已验证', async () => {
    const accepted = verifier({ status: 'verified' })
    const created = await save(baseRequest, accepted.verify)

    const result = await save(
      { ...baseRequest, id: created.profileId ?? null, apiKey: null },
      accepted.verify
    )

    expect(result.status).toBe('saved')
    expect(result.overview.profiles[0]).toMatchObject({
      apiKeyMask: null,
      verification: 'unverified',
      lastVerifiedAt: null
    })
  })

  it.each([
    ['name', { name: '   ' }],
    ['baseUrl', { baseUrl: 'api.deepseek.com' }],
    ['model', { model: '' }]
  ] as const)('%s 不合法时指出字段，不落库', async (field, patch) => {
    const check = verifier({ status: 'verified' })

    const result = await save({ ...baseRequest, ...patch }, check.verify)

    expect(result).toMatchObject({ status: 'invalid', field })
    expect(check.calls).toEqual([])
    expect(result.overview.profiles).toEqual([])
  })

  it('编辑不存在的配置时返回 missing', async () => {
    const check = verifier({ status: 'verified' })

    await expect(save({ ...baseRequest, id: 'missing' }, check.verify)).resolves.toMatchObject({
      status: 'missing'
    })
    expect(check.calls).toEqual([])
  })
})

describe('verifySavedModelProfile', () => {
  async function createdProfile(): Promise<string> {
    const accepted = verifier({ status: 'verified' })
    const result = await save(baseRequest, accepted.verify)
    return result.profileId as string
  }

  it('测试当前连接通过：状态转已验证并记下时间', async () => {
    const id = await createdProfile()
    const check = verifier({ status: 'verified' })

    const result = await verifySavedModelProfile(database, id, {
      ...overviewOptions(),
      verify: check.verify,
      now: '2026-11-18T11:00:00.000Z'
    })

    expect(result.status).toBe('verified')
    expect(check.calls).toEqual([
      {
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-flash',
        apiKey: 'sk-new-key-0001'
      }
    ])
    expect(result.overview.profiles[0]).toMatchObject({
      verification: 'verified',
      lastCheckedAt: '2026-11-18T11:00:00.000Z',
      lastVerifiedAt: '2026-11-18T11:00:00.000Z'
    })
  })

  it('测试当前连接被拒：回到未验证并记下原因', async () => {
    const id = await createdProfile()
    const check = verifier({
      status: 'invalid-key',
      error: { code: 'invalid-key', status: 401 }
    })

    const result = await verifySavedModelProfile(database, id, {
      ...overviewOptions(),
      verify: check.verify,
      now: '2026-11-18T11:00:00.000Z'
    })

    expect(result).toMatchObject({ status: 'invalid-key' })
    expect(result.overview.profiles[0]).toMatchObject({
      verification: 'unverified',
      lastError: 'invalid-key',
      lastCheckedAt: '2026-11-18T11:00:00.000Z'
    })
  })

  it('暂时验不了时不把已验证降级，只把失败原因交回界面', async () => {
    const id = await createdProfile()
    const check = verifier({
      status: 'unverified',
      error: { code: 'network', detail: '超时' }
    })

    const result = await verifySavedModelProfile(database, id, {
      ...overviewOptions(),
      verify: check.verify,
      now: '2026-11-18T11:00:00.000Z'
    })

    expect(result).toMatchObject({ status: 'unverified', error: { code: 'network' } })
    expect(result.overview.profiles[0]).toMatchObject({
      verification: 'verified',
      lastError: null,
      lastCheckedAt: now
    })
  })

  it('不传 id 时测试使用中的那套；没有配置时返回 missing', async () => {
    const id = await createdProfile()
    const check = verifier({ status: 'verified' })

    await expect(
      verifySavedModelProfile(database, null, { ...overviewOptions(), verify: check.verify, now })
    ).resolves.toMatchObject({ status: 'verified' })

    const empty = mkdtempSync(join(tmpdir(), 'english-learning-settings-empty-'))
    const other = openDatabase(join(empty, 'test.db'))
    try {
      migrate(other)
      await expect(
        verifySavedModelProfile(other, null, { ...overviewOptions(), verify: check.verify, now })
      ).resolves.toMatchObject({ status: 'missing' })
    } finally {
      other.close()
      rmSync(empty, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
    expect(id).not.toBe('')
  })

  it('配置不存在时返回 missing', async () => {
    const check = verifier({ status: 'verified' })

    await expect(
      verifySavedModelProfile(database, 'missing', { ...overviewOptions(), verify: check.verify, now })
    ).resolves.toMatchObject({ status: 'missing' })
    expect(check.calls).toEqual([])
  })
})

describe('activateProfile 与 deleteProfile', () => {
  async function twoProfiles(): Promise<{ first: string; second: string }> {
    const accepted = verifier({ status: 'verified' })
    const first = await save(baseRequest, accepted.verify)
    const second = await save(
      { ...baseRequest, name: '备用', apiKey: 'sk-second-key-0002' },
      accepted.verify
    )
    return { first: first.profileId as string, second: second.profileId as string }
  }

  it('切换后带回整份设置，使用中跟着换', async () => {
    const { second } = await twoProfiles()

    const result = activateProfile(database, second, overviewOptions())

    expect(result.status).toBe('activated')
    expect(result.overview.activeId).toBe(second)
    expect(result.overview.profiles.find((profile) => profile.id === second)?.active).toBe(
      true
    )
    expect(
      activateProfile(database, 'missing', overviewOptions())
    ).toMatchObject({ status: 'missing' })
  })

  it('删除使用中的配置后没有别的配置顶上来', async () => {
    const { first } = await twoProfiles()

    const result = deleteProfile(database, first, overviewOptions())

    expect(result.status).toBe('deleted')
    expect(result.overview.activeId).toBeNull()
    expect(result.overview.profiles.every((profile) => !profile.active)).toBe(true)
    expect(deleteProfile(database, 'missing', overviewOptions())).toMatchObject({
      status: 'missing'
    })
  })
})

describe('readSettingsOverview', () => {
  it('汇总配置、使用中的模型、阅读默认与主题', async () => {
    const accepted = verifier({ status: 'verified' })
    await save(baseRequest, accepted.verify)

    const overview = readSettingsOverview(database, overviewOptions())

    expect(overview).toMatchObject({
      activeId: overview.profiles[0]?.id,
      activeModel: 'deepseek-flash',
      reading: {
        fontSize: 20,
        lineHeight: 1.8,
        annotationsVisible: true,
        weakHighlight: true
      },
      theme: 'light',
      appVersion: '0.1.0',
      electronVersion: '45.0.0',
      dataDirectory: 'C:/data'
    })
  })

  it('没有配置时模型名回落到环境变量里的那一份', () => {
    const overview = readSettingsOverview(database, {
      ...overviewOptions(),
      fallbackModel: 'deepseek-v4-pro'
    })

    expect(overview).toMatchObject({
      profiles: [],
      activeId: null,
      activeModel: 'deepseek-v4-pro'
    })
  })
})
