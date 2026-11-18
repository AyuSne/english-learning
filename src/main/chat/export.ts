import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { ChatThreadView } from '../../shared/threads'
import { fileStamp } from '../file-stamp'

/**
 * 线程导出：一行一条 JSON，按当前这一支的顺序排。
 * 不是真源，只求读得懂、能 diff：线程头 + 提问 + 回答，正文与思维链原样保留。
 * 大致照 Pi 的条目形状（id / parentId / 时间戳），不要的那几版回答不进来。
 */
export function threadJsonl(view: ChatThreadView): string {
  const lines: string[] = [
    JSON.stringify({
      type: 'thread',
      version: 1,
      id: view.id,
      title: view.title,
      main: view.main,
      context: view.context,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt
    })
  ]

  let parentId: string | null = null
  for (const turn of view.turns) {
    lines.push(
      JSON.stringify({
        type: 'question',
        id: turn.question.id,
        parentId,
        createdAt: turn.question.createdAt,
        text: turn.question.text
      })
    )

    const answer = turn.answer
    if (answer === null) {
      parentId = turn.question.id
      continue
    }
    lines.push(
      JSON.stringify({
        type: 'answer',
        id: answer.id,
        parentId: turn.question.id,
        createdAt: answer.createdAt,
        model: answer.model,
        phase: answer.phase,
        ...(answer.thinking === '' ? {} : { thinking: answer.thinking }),
        ...(answer.thinkingMs > 0 ? { thinkingMs: answer.thinkingMs } : {}),
        ...(answer.error === null ? {} : { error: answer.error }),
        text: answer.text
      })
    )
    parentId = answer.id
  }

  return lines.map((line) => `${line}\n`).join('')
}

/** 标题清掉 Windows 不认的字符，限长；空标题就只留 thread 前缀。 */
function safeTitle(title: string): string {
  return title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-. ]+|[-. ]+$/g, '')
    .slice(0, 40)
    .replace(/[-. ]+$/g, '')
}

export function threadExportFileName(title: string, at: Date): string {
  const name = safeTitle(title)
  const stamp = fileStamp(at)
  return name === '' ? `thread-${stamp}.jsonl` : `thread-${name}-${stamp}.jsonl`
}

export type ThreadFileResult = { status: 'saved'; file: string } | { status: 'failed' }

/**
 * 把一条线程写到用户选定的文件。UTF-8 不带 BOM——带 BOM 的 JSONL
 * 第一行按 JSON 解析会失败。写不进去时只回 failed，不把路径细节抛给界面。
 */
export function writeThreadJsonl(
  view: ChatThreadView,
  options: { file: string }
): ThreadFileResult {
  const content = threadJsonl(view)
  const file = resolve(options.file)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content, 'utf8')
  } catch {
    return { status: 'failed' }
  }
  return { status: 'saved', file }
}
