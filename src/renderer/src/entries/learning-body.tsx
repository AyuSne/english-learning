import { Markdown } from '../markdown/markdown'
import { parseMarkdown } from '../markdown/parse-markdown'

/** 学习内容正文与回答复用同一套 Markdown 排版。 */
export function LearningBody({ body }: { body: string }) {
  return <Markdown className="entry-note-body" blocks={parseMarkdown(body)} />
}
