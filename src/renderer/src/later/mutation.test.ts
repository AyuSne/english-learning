import { describe, expect, it } from 'vitest'
import type { SetEntryLaterResult } from '../../../shared/entries'
import {
  createLaterMarkRunner,
  type LaterMarkHandlers,
  type LaterMarkRequest
} from './mutation'

/**
 * 「稍后看」唯一的写入流程：成功文案、缺失词条、失败文案都由这里决定；
 * 晚到的响应要么带自己的词条 id、要么被 cancel / 后一次请求作废，绝不串到别的词条上。
 */

type Deferred = {
  resolve: (result: SetEntryLaterResult) => void
  reject: (error: unknown) => void
}

function deferredSend(): {
  send: (request: { entryId: string; later: boolean }) => Promise<SetEntryLaterResult>
  pending: Map<string, Deferred>
  calls: Array<{ entryId: string; later: boolean }>
} {
  const pending = new Map<string, Deferred>()
  const calls: Array<{ entryId: string; later: boolean }> = []
  return {
    pending,
    calls,
    send(request) {
      calls.push(request)
      return new Promise<SetEntryLaterResult>((resolve, reject) => {
        pending.set(request.entryId, { resolve, reject })
      })
    }
  }
}

function request(entryId: string): LaterMarkRequest {
  return { entryId, mainForm: entryId, later: true }
}

function recorder(): {
  handlers: LaterMarkHandlers
  settled: Array<{ entryId: string; markedAt: string | null; notice: string }>
  missing: string[]
  errors: Array<{ entryId: string; message: string }>
} {
  const settled: Array<{ entryId: string; markedAt: string | null; notice: string }> = []
  const missing: string[] = []
  const errors: Array<{ entryId: string; message: string }> = []
  return {
    settled,
    missing,
    errors,
    handlers: {
      onSettled: (change) =>
        settled.push({
          entryId: change.entryId,
          markedAt: change.markedAt,
          notice: change.notice
        }),
      onMissing: (entryId) => missing.push(entryId),
      onError: (failure) => errors.push(failure)
    }
  }
}

describe('createLaterMarkRunner', () => {
  it('标记成功后给现成的「已加入」文案与标记时间', async () => {
    const { send, pending } = deferredSend()
    const runner = createLaterMarkRunner(send)
    const { handlers, settled } = recorder()

    const done = runner.run(request('entry-1'), handlers)
    pending.get('entry-1')?.resolve({ status: 'marked', markedAt: '2026-11-18T08:10:00.000Z' })

    await expect(done).resolves.toEqual({
      status: 'marked',
      markedAt: '2026-11-18T08:10:00.000Z'
    })
    expect(settled).toEqual([
      {
        entryId: 'entry-1',
        markedAt: '2026-11-18T08:10:00.000Z',
        notice: '已把「entry-1」加入稍后看。'
      }
    ])
  })

  it('取消标记后给「已移除」文案，markedAt 为 null', async () => {
    const { send, pending } = deferredSend()
    const runner = createLaterMarkRunner(send)
    const { handlers, settled } = recorder()

    const done = runner.run({ ...request('entry-1'), later: false }, handlers)
    pending.get('entry-1')?.resolve({ status: 'unmarked' })

    await done
    expect(settled).toEqual([
      {
        entryId: 'entry-1',
        markedAt: null,
        notice: '已移除「entry-1」的稍后看标记。'
      }
    ])
  })

  it('词条不存在默认交给页面处理，首页可以选择当成已移除', async () => {
    const first = deferredSend()
    const runner = createLaterMarkRunner(first.send)
    const recorded = recorder()
    const done = runner.run(request('entry-1'), recorded.handlers)
    first.pending.get('entry-1')?.resolve({ status: 'missing' })
    await done
    expect(recorded.missing).toEqual(['entry-1'])
    expect(recorded.settled).toEqual([])

    const second = deferredSend()
    const home = recorder()
    const homeRunner = createLaterMarkRunner(second.send)
    const homeDone = homeRunner.run(request('entry-1'), {
      ...home.handlers,
      missingAsSettled: true
    })
    second.pending.get('entry-1')?.resolve({ status: 'missing' })
    await homeDone
    expect(home.settled).toEqual([
      {
        entryId: 'entry-1',
        markedAt: null,
        notice: '已移除「entry-1」的稍后看标记。'
      }
    ])
    expect(home.missing).toEqual([])
  })

  it('请求失败按页面自己的说法给一句人话', async () => {
    const { send, pending } = deferredSend()
    const runner = createLaterMarkRunner(send)
    const { handlers, errors } = recorder()

    const done = runner.run(request('entry-1'), {
      ...handlers,
      failureMessage: '这条稍后看没有移除。'
    })
    pending.get('entry-1')?.reject(new Error('Error invoking remote method: boom'))

    await expect(done).resolves.toBeNull()
    expect(errors).toEqual([{ entryId: 'entry-1', message: '这条稍后看没有移除。' }])
  })

  it('cancel 之后在途响应作废，不再回调任何页面', async () => {
    const { send, pending } = deferredSend()
    const runner = createLaterMarkRunner(send)
    const { handlers, settled, errors } = recorder()

    const done = runner.run(request('entry-1'), handlers)
    runner.cancel()
    pending.get('entry-1')?.resolve({ status: 'marked', markedAt: '2026-11-18T08:10:00.000Z' })

    await expect(done).resolves.toBeNull()
    expect(settled).toEqual([])
    expect(errors).toEqual([])
  })

  it('后一次请求作废前一次：晚到的 A 不会把结果写到 B 上', async () => {
    const { send, pending } = deferredSend()
    const runner = createLaterMarkRunner(send)
    const { handlers, settled } = recorder()

    const first = runner.run(request('entry-a'), handlers)
    const second = runner.run(request('entry-b'), handlers)

    pending.get('entry-b')?.resolve({ status: 'marked', markedAt: '2026-11-18T08:20:00.000Z' })
    await second
    pending.get('entry-a')?.resolve({ status: 'marked', markedAt: '2026-11-18T08:10:00.000Z' })
    await expect(first).resolves.toBeNull()

    expect(settled).toEqual([
      {
        entryId: 'entry-b',
        markedAt: '2026-11-18T08:20:00.000Z',
        notice: '已把「entry-b」加入稍后看。'
      }
    ])
  })
})
