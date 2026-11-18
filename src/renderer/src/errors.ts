/** 渲染层里把未知错误变成能给用户看的一句话。 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const GENERIC_FAILURE = '这次操作没有完成，再试一次。'

/**
 * 给人看的失败文案。业务错误已经是一句人话，原样用；IPC 远程调用失败包出来的
 * 技术信息（channel 名、No handler）对用户没有意义，换成调用处给的兜底文案。
 * 原始信息仍留在 messageOf 里，排查时不会丢。
 */
export function failureText(error: unknown, fallback: string = GENERIC_FAILURE): string {
  if (error === undefined || error === null) {
    return fallback
  }
  const message = messageOf(error).trim()
  if (message === '') {
    return fallback
  }
  const technical =
    /Error invoking remote method/i.test(message) ||
    /No handler registered/i.test(message) ||
    /could not be cloned/i.test(message)
  return technical ? fallback : message
}
