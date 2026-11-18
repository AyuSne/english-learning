import { useEffect, useState } from 'react'
import type { DictionaryLookup } from '../../../shared/dictionary'
import { lookupDictionary } from '../api'

/**
 * 三处入口共用的查词状态。词典调用失败（IPC 出错）时按「不可用」显示，
 * 界面不会停在「正在查词典…」；换一个词就作废旧结果。
 */

export type DictionaryLookupState = {
  lookup: DictionaryLookup | null
  loading: boolean
}

export function unavailableLookup(query: string): DictionaryLookup {
  return { status: 'unavailable', query }
}

/** 查一次词；失败也落到「词典不可用」，不把异常抛给界面。 */
export function lookupDictionaryOrUnavailable(word: string): Promise<DictionaryLookup> {
  return lookupDictionary(word).catch(() => unavailableLookup(word))
}

/** 按词查词典；word 为 null 时表示这次不需要查。 */
export function useDictionaryLookup(word: string | null): DictionaryLookupState {
  const [state, setState] = useState<DictionaryLookupState>({ lookup: null, loading: false })

  useEffect(() => {
    if (word === null) {
      setState({ lookup: null, loading: false })
      return
    }
    let active = true
    setState({ lookup: null, loading: true })
    lookupDictionaryOrUnavailable(word).then((lookup) => {
      if (active) {
        setState({ lookup, loading: false })
      }
    })
    return () => {
      active = false
    }
  }, [word])

  return state
}
