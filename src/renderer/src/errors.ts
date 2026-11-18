/** 渲染层里把未知错误变成能给用户看的一句话。 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
