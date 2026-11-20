import type { SearchSnippet } from '../../../shared/search'
import { splitSearchSnippet } from '../../../shared/search'

/**
 * 命中片段只按服务端给的区间切 `<mark>`，不拼 HTML、不重算关键词位置；
 * 词条页左栏与全局搜索共用这一份渲染。
 */
export function SearchSnippetText({ snippet }: { snippet: SearchSnippet }) {
  return (
    <>
      {splitSearchSnippet(snippet).map((part, index) =>
        part.highlighted ? (
          <mark key={index}>{part.text}</mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  )
}
