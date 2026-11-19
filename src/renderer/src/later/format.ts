/**
 * 「稍后看」的共用文案。词条页、阅读词条卡与首页都从这里取，
 * 保证同一状态在三处叫同一个名字、给同一句反馈。
 */

export const HOME_LATER_EMPTY =
  '还没有稍后看的词。在词条页或阅读词条卡上标一下，会收到这里。'

export function laterToggleLabel(marked: boolean): string {
  return marked ? '取消稍后看' : '稍后看'
}

export function laterMarkedNotice(mainForm: string): string {
  return `已把「${mainForm}」加入稍后看。`
}

export function laterUnmarkedNotice(mainForm: string): string {
  return `已移除「${mainForm}」的稍后看标记。`
}

/** 首页每行「移除」按钮的无障碍名称：只读「移除」会不知道移的是哪一条。 */
export function laterRemoveLabel(mainForm: string): string {
  return `从稍后看移除 ${mainForm}`
}
