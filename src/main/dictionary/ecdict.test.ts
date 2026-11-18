import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDictionary, type Dictionary } from './dictionary'

/**
 * 随包词典是构建产物，这里按用户实际会查的样子验一遍：音标、按词性分条的释义、
 * 词形变化回退到原形，以及裁剪范围外的词明说没收录。
 */

const file = resolve(process.cwd(), 'assets/dictionary/ecdict.db')
let dictionary: Dictionary

beforeAll(() => {
  const opened = openDictionary(file)
  if (opened === null) throw new Error(`随包词典打不开：${file}`)
  dictionary = opened
})

afterAll(() => {
  dictionary.close()
})

describe('随包词典', () => {
  it('能查到音标与按词性分条的中文释义', () => {
    const result = dictionary.lookup('reciprocate')
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.via).toBe('exact')
    expect(result.entry.phonetic).not.toBe('')
    expect(result.entry.senses[0]).toMatchObject({ pos: 'vt.' })
    expect(result.entry.senses[0]?.text).toContain('回报')
    expect(result.entry.senses[1]).toMatchObject({ pos: 'vi.' })
  })

  it('63 篇语料里出现的词收得进来', () => {
    expect(dictionary.lookup('pedagogy')).toMatchObject({ status: 'found', via: 'exact' })
  })

  it('词形变化回退到原形', () => {
    const cases: [string, string][] = [
      ['approached', 'approach'],
      ['approaching', 'approach'],
      ['went', 'go'],
      ['scientists', 'scientist'],
      ['hiring', 'hire']
    ]
    for (const [form, base] of cases) {
      const result = dictionary.lookup(form)
      expect(result).toMatchObject({ status: 'found', via: 'lemma' })
      if (result.status === 'found') {
        expect(result.entry.word).toBe(base)
        expect(result.entry.phonetic).not.toBe('')
      }
    }
  })

  it('选词归并用的 lemma 键跟查询结果一致', () => {
    expect(dictionary.lemmaOf('drank')).toBe('drink')
    expect(dictionary.lemmaOf('Approaching')).toBe('approach')
    expect(dictionary.lemmaOf('approachable')).toBe('approachable')
    expect(dictionary.lemmaOf('zyzzyva')).toBeNull()
  })

  it('有独立常用义的同形词仍是原词条，不硬并进变化表', () => {
    const left = dictionary.lookup('left')
    expect(left).toMatchObject({ status: 'found', via: 'exact' })
    if (left.status === 'found') {
      expect(left.entry.senses.map((sense) => sense.pos)).toContain('a.')
    }
  })

  it('ECDICT 没收录的词（含语料里的专名）都明说没收录', () => {
    expect(dictionary.lookup('zyzzyva')).toMatchObject({ status: 'missing', query: 'zyzzyva' })
    // 63 篇语料里出现的公司名，ECDICT 没有这个词条。
    expect(dictionary.lookup('illuminum')).toMatchObject({ status: 'missing' })
  })
})
