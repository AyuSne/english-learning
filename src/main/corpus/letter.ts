import type { ArticleKind } from '../../shared/library'

/**
 * 长篇匹配按原卷字母显示段首；仔细阅读不显示。语料约定段落 id 就是 A–P 的字母，
 * 万一 id 不是字母，按段序补一个；超过 P 的段不再编号，不发明原卷没有的字母。
 * 阅读页的段首字母与词条页的「段 D」都用这一处。
 */
export function paragraphLetter(
  kind: ArticleKind,
  id: string,
  ordinal: number
): string | null {
  if (kind !== 'long_match') {
    return null
  }
  if (/^[A-P]$/.test(id)) {
    return id
  }
  return ordinal >= 0 && ordinal < 16 ? String.fromCharCode(65 + ordinal) : null
}
