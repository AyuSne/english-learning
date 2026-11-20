/**
 * 搜索命中片段的公共契约：片段文本与关键词区间。
 *
 * 词条页左栏用它给出「为什么命中」，全局搜索（词条 / 文章两组）直接复用
 * 同一套结构，不再各自拼一套片段与高亮规则。片段只在这里算一次，界面只按区间切 <mark>。
 * 具体命中类型的定位字段由各有明确组合的领域类型表达（见 `EntrySearchHit`）。
 */

/** 片段里要高亮的一段，UTF-16 偏移，直接落在 `SearchSnippet.text` 上。 */
export type SearchRange = {
  start: number
  end: number
}

/** 一段命中片段：压成一行的原文 + 关键词位置。 */
export type SearchSnippet = {
  text: string
  ranges: SearchRange[]
}

/** 片段切出来的一段，界面直接渲染成普通文字或 <mark>。 */
export type SearchSnippetPart = {
  text: string
  highlighted: boolean
}

/** 命中处前后各取的字符数。 */
export const SEARCH_SNIPPET_CONTEXT = 48

/** 没有命中或片段过长时的截断上限（含结尾省略号）。 */
export const SEARCH_SNIPPET_MAX_LENGTH = 160

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

/**
 * 从一段正文里截出命中片段：学习内容里的换行、连续空白压成一行，
 * 命中处前后各留 `context` 个字符，两端被切掉时加省略号；`ranges` 是命中词
 * 在最终片段里的位置，大小写不敏感，片段里每一处命中都会标出来。
 *
 * 查询为空或找不到时只返回压好的一行（找不到时限长），`ranges` 为空。
 */
export function buildSearchSnippet(
  text: string,
  rawQuery: string,
  options: { context?: number; maxLength?: number } = {}
): SearchSnippet {
  const query = rawQuery.trim()
  const collapsed = collapseWhitespace(text)
  const maxLength = options.maxLength ?? SEARCH_SNIPPET_MAX_LENGTH
  if (query === '') {
    return { text: clip(collapsed, maxLength), ranges: [] }
  }

  const needle = query.toLowerCase()
  const index = collapsed.toLowerCase().indexOf(needle)
  if (index < 0) {
    return { text: clip(collapsed, maxLength), ranges: [] }
  }

  const context = options.context ?? SEARCH_SNIPPET_CONTEXT
  let start = Math.max(0, index - context)
  let end = Math.min(collapsed.length, index + needle.length + context)
  // 尽量不切在半个词上；命中词本身始终完整留在片段里。
  if (start > 0) {
    const space = collapsed.indexOf(' ', start)
    if (space >= 0 && space < index) {
      start = space + 1
    }
  }
  if (end < collapsed.length) {
    const space = collapsed.lastIndexOf(' ', end)
    if (space > index + needle.length) {
      end = space
    }
  }

  const prefix = start > 0 ? '…' : ''
  const suffix = end < collapsed.length ? '…' : ''
  const body = collapsed.slice(start, end)
  const bodyLower = body.toLowerCase()
  const ranges: SearchRange[] = []
  let from = 0
  while (from <= bodyLower.length - needle.length) {
    const hit = bodyLower.indexOf(needle, from)
    if (hit < 0) break
    ranges.push({ start: prefix.length + hit, end: prefix.length + hit + needle.length })
    from = hit + needle.length
  }

  return { text: `${prefix}${body}${suffix}`, ranges }
}

/**
 * 把片段按高亮区间切成顺序片段。越界区间夹到文本内，互相重叠时后一段从上一段末尾接着切，
 * 保证拼回去与片段文本逐字一致、界面不会漏字或重复。
 */
export function splitSearchSnippet(snippet: SearchSnippet): SearchSnippetPart[] {
  const parts: SearchSnippetPart[] = []
  let cursor = 0
  for (const range of snippet.ranges) {
    const start = Math.max(cursor, Math.min(range.start, snippet.text.length))
    const end = Math.max(start, Math.min(range.end, snippet.text.length))
    if (end <= start) continue
    if (start > cursor) {
      parts.push({ text: snippet.text.slice(cursor, start), highlighted: false })
    }
    parts.push({ text: snippet.text.slice(start, end), highlighted: true })
    cursor = end
  }
  if (cursor < snippet.text.length) {
    parts.push({ text: snippet.text.slice(cursor), highlighted: false })
  }
  return parts
}
