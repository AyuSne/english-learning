import { describe, expect, it } from 'vitest'
import { appendInstructionDraft } from './draft'

describe('appendInstructionDraft', () => {
  it('输入框是空的时候直接填入指令', () => {
    expect(appendInstructionDraft('', '请解释语境义')).toBe('请解释语境义')
  })

  it('已有输入时追加在后面，原输入一个字都不丢', () => {
    expect(appendInstructionDraft('先看这个词', '请解释语境义')).toBe(
      '先看这个词\n\n请解释语境义'
    )
  })

  it('原输入以换行结尾时只留一个空行，不堆空行', () => {
    expect(appendInstructionDraft('先看这个词\n\n', '请解释语境义')).toBe(
      '先看这个词\n\n请解释语境义'
    )
  })

  it('只有空白的输入按空处理', () => {
    expect(appendInstructionDraft(' \n ', '请解释语境义')).toBe('请解释语境义')
  })

  it('指令正文原样接上，不改写其中的换行', () => {
    expect(appendInstructionDraft('A', '第一行\n第二行')).toBe('A\n\n第一行\n第二行')
  })

  it('指令正文为空时输入框保持原样', () => {
    expect(appendInstructionDraft('已经写好的草稿', ' \n ')).toBe('已经写好的草稿')
  })
})
