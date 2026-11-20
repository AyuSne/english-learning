import { describe, expect, it } from 'vitest'
import { affectsNavCounts, COUNT_AFFECTING_CHANNELS } from './counts'
import { IPC_CHANNELS } from './ipc-contract'

/**
 * 全局栏计数的失效清单是这一票的审计结果：这里把它锁成契约，
 * 新增写 channel 时若忘了判断「会不会改变词条/文章/未归档数」，改动会被看见。
 */
describe('COUNT_AFFECTING_CHANNELS', () => {
  it('覆盖所有会改变计数的现有写路径', () => {
    expect([...COUNT_AFFECTING_CHANNELS].sort()).toEqual(
      [
        // 新增词条与删除/搬动原句
        'reading:collect',
        'entries:delete-sentence',
        'entries:merge',
        'entries:move-sentence',
        'entries:reselect-sentence',
        // 只写标记，但仍会重查确认口径没有漂移
        'entries:later',
        // 文章删除、存为 AI 文章与语料重新导入
        'library:delete',
        'library:save-generated',
        'library:reimport',
        // 钉住的新增、换落点、删除、批量归位与撤销
        'pins:create',
        'pins:move',
        'pins:delete',
        'pins:file-all',
        'pins:restore',
        // 删线程保留钉住；恢复备份整库替换
        'chat:delete',
        'settings:restore'
      ].sort()
    )
  })

  it('清单里的 channel 都是契约里的真实 channel，读查询不触发失效', () => {
    for (const channel of COUNT_AFFECTING_CHANNELS) {
      expect(IPC_CHANNELS).toContain(channel)
      expect(affectsNavCounts(channel)).toBe(true)
    }
    for (const read of [
      'app:bootstrap',
      'counts:summary',
      'home:summary',
      'library:list',
      'library:detail',
      'library:delete-preview',
      'entries:list',
      'entries:page',
      'pins:board',
      'chat:list',
      'chat:thread',
      'settings:overview'
    ]) {
      expect(affectsNavCounts(read)).toBe(false)
    }
  })
})
