import type { GlobalSearchResults } from '../../../shared/global-search'

/**
 * 全局搜索覆盖层的纯状态机。界面只负责把输入、IPC 回复、关闭动作翻译成这里的
 * action；「快速改词 / 清空 / 关闭后旧回复不能覆盖新状态」这条规则只写一次：
 *
 * - 每次查询变化都换一代 `requestId`，回复必须带回同一代才被接受；
 * - 旧回复、旧失败、关闭之后才到的回复一律原样返回当前状态，连一次重渲染都不触发；
 * - 查询按去首尾空白后的值比较，不重复发同一个请求。
 */

export type SearchState =
  | { status: 'idle'; query: '' }
  | { status: 'loading'; query: string }
  | { status: 'results'; query: string; results: GlobalSearchResults }
  | { status: 'empty'; query: string }
  | { status: 'error'; query: string; message: string }

export type SearchMachine = {
  state: SearchState
  /** 最近一次查询的代次；晚到的旧回复靠它丢弃。 */
  requestId: number
}

export type SearchAction =
  | { type: 'query-changed'; query: string }
  | {
      type: 'loaded'
      requestId: number
      query: string
      results: GlobalSearchResults
    }
  | { type: 'failed'; requestId: number; query: string; message: string }
  | { type: 'retry' }
  | { type: 'closed' }

export const INITIAL_SEARCH_MACHINE: SearchMachine = {
  state: { status: 'idle', query: '' },
  requestId: 0
}

export function searchReducer(
  current: SearchMachine,
  action: SearchAction
): SearchMachine {
  switch (action.type) {
    case 'query-changed': {
      const query = action.query.trim()
      if (query === '') {
        if (current.state.status === 'idle') return current
        return { state: { status: 'idle', query: '' }, requestId: current.requestId + 1 }
      }
      if (query === current.state.query) return current
      return { state: { status: 'loading', query }, requestId: current.requestId + 1 }
    }
    case 'loaded': {
      if (action.requestId !== current.requestId) return current
      const hasHits =
        action.results.entries.length > 0 || action.results.articles.length > 0
      return {
        state: hasHits
          ? { status: 'results', query: action.query, results: action.results }
          : { status: 'empty', query: action.query },
        requestId: current.requestId
      }
    }
    case 'failed': {
      if (action.requestId !== current.requestId) return current
      return {
        state: { status: 'error', query: action.query, message: action.message },
        requestId: current.requestId
      }
    }
    case 'retry': {
      const query = current.state.status === 'idle' ? '' : current.state.query
      if (query === '') return current
      return { state: { status: 'loading', query }, requestId: current.requestId + 1 }
    }
    case 'closed': {
      if (current.state.status === 'idle') return current
      return { state: { status: 'idle', query: '' }, requestId: current.requestId + 1 }
    }
  }
}
