import { useSyncExternalStore } from 'react'
import { navCountsStore } from './instance'
import type { NavCountsState } from './store'

/** 全局栏计数；counts 为 null 时表示还没读到，界面不显示数字。 */
export function useNavCounts(): NavCountsState {
  return useSyncExternalStore(
    navCountsStore.subscribe,
    navCountsStore.getState,
    navCountsStore.getState
  )
}
