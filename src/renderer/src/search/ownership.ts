/**
 * 搜索界面的点击归属：覆盖层本身，以及触发打开搜索的入口。
 *
 * 底页那些「点别处就收起当前面板 / 选中 / 定位」的 document 监听必须先让这些事件过去。
 * 否则用户一按搜索入口，pointerdown/mousedown 会先把阅读词条卡、定位高亮、对话来源
 * 高亮或设置面板清掉，等搜索关掉就再也回不来。判断集中在这里，入口加一个就带
 * `data-search-trigger`，不再让每个页面各抄一份 class 检查。
 */

const SEARCH_UI_SELECTOR = '.global-search, [data-search-trigger]'

/** 这次指针事件是否属于搜索覆盖层或它的入口。 */
export function searchUiOwns(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SEARCH_UI_SELECTOR) !== null
}
