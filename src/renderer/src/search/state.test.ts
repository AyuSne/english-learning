import { describe, expect, it } from 'vitest'
import type { GlobalSearchResults } from '../../../shared/global-search'
import {
  INITIAL_SEARCH_MACHINE,
  searchReducer,
  type SearchAction,
  type SearchMachine
} from './state'

function send(machine: SearchMachine, ...actions: SearchAction[]): SearchMachine {
  return actions.reduce(searchReducer, machine)
}

const emptyResults = (query: string): GlobalSearchResults => ({
  query,
  entries: [],
  articles: []
})

describe('searchReducer', () => {
  it('初始是空闲态，没有查询', () => {
    expect(INITIAL_SEARCH_MACHINE.state).toEqual({ status: 'idle', query: '' })
    expect(INITIAL_SEARCH_MACHINE.requestId).toBe(0)
  })

  it('输入后进入加载态，用去掉首尾空白的查询，并换一代请求', () => {
    const machine = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: '  hiring  ' })
    expect(machine.state).toEqual({ status: 'loading', query: 'hiring' })
    expect(machine.requestId).toBe(1)
  })

  it('查询与原查询相同（忽略首尾空白）时不重复发请求', () => {
    const loading = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'hiring' })
    expect(send(loading, { type: 'query-changed', query: ' hiring ' })).toBe(loading)
  })

  it('命中后按两组给结果，两组都空时是明确的空结果态', () => {
    const loading = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'hiring' })
    const results: GlobalSearchResults = {
      query: 'hiring',
      entries: [
        {
          entryId: 'entry-1',
          mainForm: 'approach',
          hit: {
            match: 'sentence',
            snippet: { text: 'Employers approach hiring differently.', ranges: [{ start: 18, end: 24 }] },
            entryId: 'entry-1',
            entrySentenceId: 'sentence-1',
            noteId: null,
            articleId: 'article-1',
            paragraphId: '1',
            sentenceOrdinal: 0
          }
        }
      ],
      articles: [
        {
          article: {
            id: 'article-1',
            title: '2026年6月 · 第1套 · 仔细阅读 Passage One',
            kind: 'careful_reading',
            sourceType: 'exam',
            kindLabel: '仔细阅读 Passage One',
            sessionLabel: '2026年6月',
            setLabel: '第1套',
            wordCount: 20,
            progress: { state: 'unread', percent: 0 },
            lastOpenedAt: null
          },
          match: 'body',
          snippet: { text: 'Employers approach hiring differently.', ranges: [{ start: 18, end: 24 }] },
          paragraphId: '1',
          sentenceOrdinal: 0
        }
      ]
    }
    const loaded = send(loading, {
      type: 'loaded',
      requestId: loading.requestId,
      query: 'hiring',
      results
    })
    expect(loaded.state).toEqual({ status: 'results', query: 'hiring', results })

    const cleared = send(
      INITIAL_SEARCH_MACHINE,
      { type: 'query-changed', query: 'zzz' },
      {
        type: 'loaded',
        requestId: 1,
        query: 'zzz',
        results: emptyResults('zzz')
      }
    )
    expect(cleared.state).toEqual({ status: 'empty', query: 'zzz' })
  })

  it('出错时保留查询并给出明确文案', () => {
    const loading = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'hiring' })
    const failed = send(loading, {
      type: 'failed',
      requestId: loading.requestId,
      query: 'hiring',
      message: '搜索没有完成，再试一次。'
    })
    expect(failed.state).toEqual({
      status: 'error',
      query: 'hiring',
      message: '搜索没有完成，再试一次。'
    })
  })

  it('清空输入回到空闲态，并作废还在路上的请求', () => {
    const loading = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'hiring' })
    const cleared = send(loading, { type: 'query-changed', query: '   ' })
    expect(cleared.state).toEqual({ status: 'idle', query: '' })
    expect(cleared.requestId).toBe(2)
  })

  it('关闭也回到空闲态，并作废还在路上的请求', () => {
    const loading = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'hiring' })
    const closed = send(loading, { type: 'closed' })
    expect(closed.state).toEqual({ status: 'idle', query: '' })
    expect(closed.requestId).toBe(2)
  })

  it('出错后可以重试同一查询，并换一代请求', () => {
    const loading = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'hiring' })
    const failed = send(loading, {
      type: 'failed',
      requestId: loading.requestId,
      query: 'hiring',
      message: '搜索没有完成，再试一次。'
    })
    const retried = send(failed, { type: 'retry' })
    expect(retried.state).toEqual({ status: 'loading', query: 'hiring' })
    expect(retried.requestId).toBe(failed.requestId + 1)
    expect(send(INITIAL_SEARCH_MACHINE, { type: 'retry' })).toBe(INITIAL_SEARCH_MACHINE)
  })

  it('快速改词后，旧请求的回复不会覆盖新查询的状态', () => {
    const first = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'zebra' })
    const second = send(first, { type: 'query-changed', query: 'hiring' })
    const stale = send(second, {
      type: 'loaded',
      requestId: first.requestId,
      query: 'zebra',
      results: {
        query: 'zebra',
        entries: [],
        articles: [
          {
            article: {
              id: 'article-1',
              title: 'A',
              kind: 'careful_reading',
              sourceType: 'exam',
              kindLabel: '仔细阅读 Passage One',
              sessionLabel: '',
              setLabel: '',
              wordCount: 1,
              progress: { state: 'unread', percent: 0 },
              lastOpenedAt: null
            },
            match: 'body',
            snippet: { text: 'zebra', ranges: [] },
            paragraphId: null,
            sentenceOrdinal: null
          }
        ]
      }
    })
    expect(stale.state).toEqual({ status: 'loading', query: 'hiring' })
    expect(stale.requestId).toBe(second.requestId)

    const failedStale = send(second, {
      type: 'failed',
      requestId: first.requestId,
      query: 'zebra',
      message: '旧请求失败'
    })
    expect(failedStale.state).toEqual({ status: 'loading', query: 'hiring' })
  })

  it('关闭后晚到的回复也不会把搜索重新打开', () => {
    const loading = send(INITIAL_SEARCH_MACHINE, { type: 'query-changed', query: 'hiring' })
    const closed = send(loading, { type: 'closed' })
    const late = send(closed, {
      type: 'loaded',
      requestId: loading.requestId,
      query: 'hiring',
      results: emptyResults('hiring')
    })
    expect(late).toBe(closed)
  })
})
