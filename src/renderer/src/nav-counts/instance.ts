import { loadNavCounts } from '../api'
import { subscribeNavCountsInvalidated } from './invalidation'
import { createNavCountsStore } from './store'

/**
 * 全局唯一一份计数状态：进入应用与每次换页时非阻塞重查（由 App 的路由 effect 触发），
 * 之后只在写成功的失效信号到来时补查。模块级单例，不随某个页面挂载/卸载而丢；
 * 阅读页收起全局栏时也能照常更新。
 */
export const navCountsStore = createNavCountsStore({
  load: loadNavCounts,
  subscribeInvalidation: subscribeNavCountsInvalidated
})
