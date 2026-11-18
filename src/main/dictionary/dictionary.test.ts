import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeDictionaryFixture } from '../../testing/dictionary-fixture'
import { openDictionary, missingDictionary, type Dictionary } from './dictionary'

let directory: string
let file: string
let dictionary: Dictionary

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'english-learning-dictionary-'))
  file = join(directory, 'ecdict.db')
  writeDictionaryFixture(file, {
    entries: [
      {
        word: 'approach',
        phonetic: "ә'prәutʃ",
        translation: 'n. 方法, 途径\\nvt. 接近, 着手处理\\nvi. 靠近',
        exchange: 'p:approached/d:approached/i:approaching/3:approaches'
      },
      {
        word: 'hire',
        phonetic: "'haiә:",
        translation: 'vt. 雇请, 出租\\nn. 租金',
        exchange: 'p:hired/d:hired/i:hiring/3:hires'
      },
      {
        word: 'left',
        phonetic: 'left',
        translation: 'a. 左边的, 左倾的\\nadv. 在左面\\nleave的过去式和过去分词',
        exchange: '0:leave/1:dp/d:left/p:left'
      },
      {
        word: 'flask',
        translation: '[化] 烧瓶'
      },
      {
        word: 'sail',
        phonetic: 'seɪl',
        translation: 'v. 航行\\nn. 帆',
        exchange: 'p:sailed/d:sailed/i:sailing/3:sails/s:sails/r:sailer/t:sailest'
      },
      {
        word: 'take part',
        translation: 'v. 参加, 参与'
      },
      {
        word: "don't",
        translation: 'abbr. do not 的缩写'
      }
    ],
    lemmas: [
      { form: 'approached', lemma: 'approach' },
      { form: 'approaching', lemma: 'approach' },
      { form: 'approaches', lemma: 'approach' },
      { form: 'hiring', lemma: 'hire' },
      { form: 'testified', lemma: 'testify' }
    ]
  })
  const opened = openDictionary(file)
  if (opened === null) throw new Error('词典没有打开')
  dictionary = opened
})

afterAll(async () => {
  dictionary.close()
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

function lookup(word: string) {
  return dictionary.lookup(word)
}

describe('openDictionary', () => {
  it('查原形时给出音标与按词性分条的中文释义', () => {
    expect(lookup('approach')).toEqual({
      status: 'found',
      query: 'approach',
      via: 'exact',
      entry: {
        word: 'approach',
        phonetic: "əˈprəutʃ",
        senses: [
          { pos: 'n.', text: '方法, 途径' },
          { pos: 'vt.', text: '接近, 着手处理' },
          { pos: 'vi.', text: '靠近' }
        ],
        forms: [
          { form: 'approached', kinds: ['past', 'past-participle'] },
          { form: 'approaching', kinds: ['present-participle'] },
          { form: 'approaches', kinds: ['third-person'] }
        ]
      }
    })
  })

  it('查词形变化时回退到原形，并说明是回退来的', () => {
    const result = lookup('Approaching')
    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.query).toBe('approaching')
    expect(result.via).toBe('lemma')
    expect(result.entry.word).toBe('approach')
    expect(result.entry.phonetic).toBe("əˈprəutʃ")
    expect(result.entry.senses[0]).toEqual({ pos: 'n.', text: '方法, 途径' })
  })

  it('查词前先归一大小写、空白与首尾标点，弯引号也收成直引号', () => {
    expect(lookup('  Approach, ')).toMatchObject({
      status: 'found',
      query: 'approach',
      via: 'exact'
    })
    expect(lookup('don’t')).toMatchObject({
      status: 'found',
      query: "don't",
      via: 'exact'
    })
  })

  it('没收录时明说没收录，而不是猜一个近形词', () => {
    expect(lookup('zyzzyva')).toEqual({ status: 'missing', query: 'zyzzyva' })
    expect(lookup('')).toEqual({ status: 'missing', query: '' })
  })

  it('没有词性前缀的释义原样保留，领域标记不算词性', () => {
    const left = lookup('left')
    expect(left.status).toBe('found')
    if (left.status !== 'found') return
    expect(left.entry.phonetic).toBe('left')
    expect(left.entry.senses).toEqual([
      { pos: 'a.', text: '左边的, 左倾的' },
      { pos: 'adv.', text: '在左面' },
      { pos: '', text: 'leave的过去式和过去分词' }
    ])
    // 过去式与过去分词都写作 left，跟词头一样，不重复列进词形变化。
    expect(left.entry.forms).toEqual([])

    const flask = lookup('flask')
    expect(flask.status).toBe('found')
    if (flask.status !== 'found') return
    expect(flask.entry.phonetic).toBe('')
    expect(flask.entry.senses).toEqual([{ pos: '', text: '[化] 烧瓶' }])
  })

  it('短语按整条查，不拆开逐词还原', () => {
    expect(lookup('Take Part')).toMatchObject({
      status: 'found',
      query: 'take part',
      via: 'exact'
    })
    expect(lookup('take')).toMatchObject({ status: 'missing' })
  })

  it('lemma 指向的原形不在裁剪范围时按没收录处理', () => {
    expect(lookup('testified')).toEqual({ status: 'missing', query: 'testified' })
  })

  it('音标统一成常见 IPA 记号：西里尔 ә、ASCII 撇号与冒号都换掉', () => {
    const hire = lookup('hire')
    expect(hire.status).toBe('found')
    if (hire.status !== 'found') return
    expect(hire.entry.phonetic).toBe('ˈhaiəː')
  })

  it('词形变化合并同形、按固定顺序返回', () => {
    const sail = lookup('sail')
    expect(sail.status).toBe('found')
    if (sail.status !== 'found') return
    expect(sail.entry.forms).toEqual([
      { form: 'sailed', kinds: ['past', 'past-participle'] },
      { form: 'sailing', kinds: ['present-participle'] },
      { form: 'sails', kinds: ['third-person', 'plural'] },
      { form: 'sailer', kinds: ['comparative'] },
      { form: 'sailest', kinds: ['superlative'] }
    ])
  })
})

describe('lemmaOf', () => {
  it('原形给自己，词形变化回原形，查不到给 null', () => {
    expect(dictionary.lemmaOf('approach')).toBe('approach')
    expect(dictionary.lemmaOf('Approaching')).toBe('approach')
    expect(dictionary.lemmaOf('Hiring')).toBe('hire')
    expect(dictionary.lemmaOf('zyzzyva')).toBeNull()
    expect(dictionary.lemmaOf('')).toBeNull()
  })
})

describe('词典不可用', () => {
  it('库文件不在时打开失败，查询回答「不可用」', () => {
    expect(openDictionary(join(directory, 'missing.db'))).toBeNull()
    expect(missingDictionary().lookup('approach')).toEqual({
      status: 'unavailable',
      query: 'approach'
    })
  })
})
