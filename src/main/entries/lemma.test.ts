import { describe, expect, it } from 'vitest'
import { resolveLemma, type LemmaLexicon } from './lemma'

function lexicon(...words: string[]): LemmaLexicon {
  const known = new Set(words.map((word) => word.toLowerCase()))
  return { has: (word) => known.has(word.toLowerCase()) }
}

describe('resolveLemma', () => {
  it('原形与大小写、首尾空白、标点归一', () => {
    expect(resolveLemma('approach', lexicon())).toBe('approach')
    expect(resolveLemma('  Approach  ', lexicon())).toBe('approach')
    expect(resolveLemma('approach,', lexicon())).toBe('approach')
  })

  it('常见词形变化归到同一个键：-ed / -ing / -es / -s', () => {
    expect(resolveLemma('approached', lexicon('approach'))).toBe('approach')
    expect(resolveLemma('approaching', lexicon('approach'))).toBe('approach')
    expect(resolveLemma('approaches', lexicon('approach'))).toBe('approach')
    expect(resolveLemma('studied', lexicon('study'))).toBe('study')
    expect(resolveLemma('studies', lexicon('study'))).toBe('study')
    expect(resolveLemma('carried', lexicon('carry'))).toBe('carry')
    expect(resolveLemma('making', lexicon('make'))).toBe('make')
    expect(resolveLemma('running', lexicon('run'))).toBe('run')
    expect(resolveLemma('watches', lexicon('watch'))).toBe('watch')
    expect(resolveLemma('classes', lexicon('class'))).toBe('class')
    expect(resolveLemma('boxes', lexicon('box'))).toBe('box')
    expect(resolveLemma('used', lexicon('use'))).toBe('use')
  })

  it('同一词形有多个可能原形时，用词库里真实存在的那个', () => {
    expect(resolveLemma('hoped', lexicon('hop', 'hope'))).toBe('hope')
    expect(resolveLemma('uses', lexicon('us', 'use'))).toBe('use')
    expect(resolveLemma('buses', lexicon('bus'))).toBe('bus')
    expect(resolveLemma('movies', lexicon('movie'))).toBe('movie')
    expect(resolveLemma('focuses', lexicon('focus'))).toBe('focus')
  })

  it('不规则变化按表归并', () => {
    expect(resolveLemma('children', lexicon())).toBe('child')
    expect(resolveLemma('went', lexicon())).toBe('go')
    expect(resolveLemma('written', lexicon('write'))).toBe('written')
    expect(resolveLemma('analyses', lexicon())).toBe('analysis')
  })

  it('有独立常用义的同形词不按不规则变化硬并', () => {
    expect(resolveLemma('left', lexicon('leave'))).toBe('left')
    expect(resolveLemma('saw', lexicon('see'))).toBe('saw')
    expect(resolveLemma('found', lexicon('find'))).toBe('found')
    expect(resolveLemma('rose', lexicon('rise'))).toBe('rose')
    expect(resolveLemma('thought', lexicon('think'))).toBe('thought')
  })

  it('派生词独立成条，不按词缀硬拆', () => {
    expect(resolveLemma('approachable', lexicon('approach'))).toBe('approachable')
    expect(resolveLemma('teacher', lexicon('teach'))).toBe('teacher')
    expect(resolveLemma('quickly', lexicon('quick'))).toBe('quickly')
    expect(resolveLemma('learner', lexicon('learn'))).toBe('learner')
  })

  it('短语按整条归一，不拆单词', () => {
    expect(resolveLemma('  Take   Part ', lexicon())).toBe('take part')
    expect(resolveLemma('take part', lexicon())).toBe('take part')
  })

  it('词库里查不到候选时只做有把握的归并', () => {
    expect(resolveLemma('approached', lexicon())).toBe('approach')
    expect(resolveLemma('running', lexicon())).toBe('run')
    expect(resolveLemma('hoped', lexicon())).toBe('hoped')
    expect(resolveLemma('thing', lexicon())).toBe('thing')
    expect(resolveLemma('spring', lexicon())).toBe('spring')
  })

  it('避免把普通单数、功能词当成复数词尾', () => {
    expect(resolveLemma('news', lexicon('new'))).toBe('news')
    expect(resolveLemma('this', lexicon('thi'))).toBe('this')
    expect(resolveLemma('series', lexicon('sery'))).toBe('series')
    expect(resolveLemma('species', lexicon('specy'))).toBe('species')
    expect(resolveLemma('lens', lexicon('len'))).toBe('lens')
  })
})
