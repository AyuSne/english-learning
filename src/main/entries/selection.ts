import type { CollectRejection } from '../../shared/entries'

/**
 * 选区的统一读法：落在句子范围内、两端空白收紧、必须包含字母或数字。
 * 选词与重新圈定都用这一处，保证两次算出来的原句与原文逐字一致。
 */
export type ReadSelection =
  | { status: 'ok'; surface: string; start: number; end: number }
  | { status: 'rejected'; reason: CollectRejection }

export function readEntrySelection(
  text: string,
  sentence: { char_start: number; char_end: number },
  start: number,
  end: number
): ReadSelection {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { status: 'rejected', reason: 'range' }
  }
  if (start < sentence.char_start || start >= sentence.char_end) {
    return { status: 'rejected', reason: 'range' }
  }
  if (end > sentence.char_end || end < start) {
    return { status: 'rejected', reason: 'range' }
  }
  if (end === start) {
    return { status: 'rejected', reason: 'empty' }
  }

  let trimmedStart = start
  let trimmedEnd = end
  while (trimmedStart < trimmedEnd && isWhitespace(text[trimmedStart])) {
    trimmedStart += 1
  }
  while (trimmedEnd > trimmedStart && isWhitespace(text[trimmedEnd - 1])) {
    trimmedEnd -= 1
  }
  if (trimmedEnd <= trimmedStart) {
    return { status: 'rejected', reason: 'empty' }
  }

  const surface = text.slice(trimmedStart, trimmedEnd)
  // 只圈到标点或空白时不建原句：那不是学习者想收的词或短语。
  if (!/[\p{L}\p{N}]/u.test(surface)) {
    return { status: 'rejected', reason: 'empty' }
  }
  return { status: 'ok', surface, start: trimmedStart, end: trimmedEnd }
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character)
}
