import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { startSseStub, unusedBaseUrl, type SseStub, type StubScript } from '../../testing/sse-stub'
import { verifyModelProfile } from './verify'

const stubs: SseStub[] = []
const hanging: Array<{ close(): Promise<void> }> = []

afterEach(async () => {
  await Promise.all(stubs.splice(0).map((stub) => stub.close()))
  await Promise.all(hanging.splice(0).map((server) => server.close()))
})

async function stub(script: StubScript): Promise<SseStub> {
  const created = await startSseStub(script)
  stubs.push(created)
  return created
}

async function hangingServer(): Promise<string> {
  const server = createServer(() => {
    // 故意不响应，交给校验自己的超时。
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  hanging.push({
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  })
  return `http://127.0.0.1:${address.port}`
}

describe('verifyModelProfile', () => {
  it('发一次最小请求：地址、模型、密钥与最小请求体都对得上', async () => {
    const target = await stub({ kind: 'status', status: 200 })

    await expect(
      verifyModelProfile({
        baseUrl: `${target.baseUrl}/`,
        model: 'deepseek-flash',
        apiKey: 'sk-test-key'
      })
    ).resolves.toEqual({ status: 'verified' })

    const request = target.requests[0]
    expect(request?.url).toBe('/chat/completions')
    expect(request?.method).toBe('POST')
    expect(request?.headers.authorization).toBe('Bearer sk-test-key')
    expect(request?.body).toMatchObject({
      model: 'deepseek-flash',
      stream: false,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }]
    })
  })

  it('接口地址已经写到 /chat/completions 时不再重复拼', async () => {
    const target = await stub({ kind: 'status', status: 200 })

    await verifyModelProfile({
      baseUrl: `${target.baseUrl}/chat/completions`,
      model: 'deepseek-flash',
      apiKey: 'sk-test-key'
    })

    expect(target.requests[0]?.url).toBe('/chat/completions')
  })

  it('本地模型不填密钥时不发 Authorization', async () => {
    const target = await stub({ kind: 'status', status: 200 })

    await expect(
      verifyModelProfile({
        baseUrl: target.baseUrl,
        model: 'qwen2.5:7b',
        apiKey: ''
      })
    ).resolves.toEqual({ status: 'verified' })

    expect(target.requests[0]?.headers.authorization).toBeUndefined()
  })

  it.each([401, 403] as const)('HTTP %i 判为密钥无效，并带状态码与 request id', async (status) => {
    const target = await stub({ kind: 'status', status })

    const outcome = await verifyModelProfile({
      baseUrl: target.baseUrl,
      model: 'deepseek-flash',
      apiKey: 'sk-wrong'
    })

    expect(outcome).toMatchObject({
      status: 'invalid-key',
      error: { code: 'invalid-key', status, requestId: `stub-${status}` }
    })
  })

  it.each([400, 404, 422] as const)('HTTP %i 判为配置不对（地址或模型名）', async (status) => {
    const target = await stub({ kind: 'status', status })

    await expect(
      verifyModelProfile({
        baseUrl: target.baseUrl,
        model: 'not-a-model',
        apiKey: 'sk-test-key'
      })
    ).resolves.toMatchObject({ status: 'invalid-config', error: { status } })
  })

  it('HTTP 402 是余额问题，密钥本身有效', async () => {
    const target = await stub({ kind: 'status', status: 402 })

    await expect(
      verifyModelProfile({
        baseUrl: target.baseUrl,
        model: 'deepseek-flash',
        apiKey: 'sk-test-key'
      })
    ).resolves.toEqual({ status: 'verified' })
  })

  it.each([429, 500, 503] as const)('HTTP %i 只说明现在验不了，不判密钥错', async (status) => {
    const target = await stub({ kind: 'status', status })

    await expect(
      verifyModelProfile({
        baseUrl: target.baseUrl,
        model: 'deepseek-flash',
        apiKey: 'sk-test-key'
      })
    ).resolves.toMatchObject({ status: 'unverified', error: { status } })
  })

  it('连不上时判为未验证，不说密钥错', async () => {
    const outcome = await verifyModelProfile({
      baseUrl: await unusedBaseUrl(),
      model: 'deepseek-flash',
      apiKey: 'sk-test-key'
    })

    expect(outcome).toMatchObject({ status: 'unverified', error: { code: 'network' } })
    expect(outcome.status === 'unverified' ? outcome.error.status : undefined).toBeUndefined()
  })

  it('超时判为未验证，不挂住保存', async () => {
    const baseUrl = await hangingServer()

    const outcome = await verifyModelProfile(
      { baseUrl, model: 'deepseek-flash', apiKey: 'sk-test-key' },
      { timeoutMs: 80 }
    )

    expect(outcome).toMatchObject({ status: 'unverified', error: { code: 'network' } })
  })

  it('接口地址不是 http(s) 时直接判配置错，不发请求', async () => {
    await expect(
      verifyModelProfile({
        baseUrl: 'api.deepseek.com',
        model: 'deepseek-flash',
        apiKey: 'sk-test-key'
      })
    ).resolves.toMatchObject({ status: 'invalid-config' })
  })
})
