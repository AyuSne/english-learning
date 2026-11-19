/**
 * 选用学习指令或内置示例时，把正文追加到既有草稿后面，绝不覆盖用户已经写下的内容。
 * 草稿末尾的空白先收掉，只留一个空行分隔；指令正文本身原样保留。
 */
export function appendInstructionDraft(draft: string, instruction: string): string {
  const text = instruction.trim()
  if (text === '') {
    return draft
  }
  const existing = draft.trimEnd()
  if (existing === '') {
    return text
  }
  return `${existing}\n\n${text}`
}
