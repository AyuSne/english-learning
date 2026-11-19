import type { EntrySentence } from '../../../shared/entries'

/**
 * 「本篇选词」的文案与切片：计数、段落标签，以及把原句切成
 * 「前 / 圈下的词 / 后」。都是纯函数，界面不自己拼字符串。
 */

/** 「3 个词条 · 5 条原句」；词条数按不同词条算，不是原句数。 */
export function articleWordsSummaryText(summary: {
  wordEntryCount: number
  collectedSentenceCount: number
}): string {
  return `${summary.wordEntryCount} 个词条 · ${summary.collectedSentenceCount} 条原句`
}

/** 长篇匹配写原卷字母，仔细阅读写第几段。 */
export function paragraphWordsLabel(paragraph: {
  ordinal: number
  letter: string | null
}): string {
  return paragraph.letter ?? `第 ${paragraph.ordinal} 段`
}

export function paragraphWordsCountText(count: number): string {
  return `${count} 个词条`
}

export type SentenceParts = {
  before: string
  surface: string
  after: string
}

/**
 * 按存下的段内偏移把原句切三段，界面把中间那段标成当时圈下的词。
 * 偏移与原文对不上时整句不标——宁可少一个高亮，也不吞字或错位。
 */
export function splitSentenceSurface(
  sentence: Pick<EntrySentence, 'sentenceText' | 'surface' | 'surfaceOffset'>
): SentenceParts {
  const { sentenceText, surface, surfaceOffset } = sentence
  const start = surfaceOffset
  const aligned =
    surface !== '' &&
    start >= 0 &&
    start + surface.length <= sentenceText.length &&
    sentenceText.slice(start, start + surface.length) === surface
  if (!aligned) {
    return { before: sentenceText, surface: '', after: '' }
  }
  return {
    before: sentenceText.slice(0, start),
    surface,
    after: sentenceText.slice(start + surface.length)
  }
}
