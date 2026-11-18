import type {
  DictionaryForm,
  DictionaryFormKind,
  DictionarySense
} from '../../shared/dictionary'

/**
 * ECDICT 两个字段的解析：translation 是按行排的中文释义，每行前面常带词性；
 * exchange 是 `p:perceived/d:perceived/...` 形式的词形变化。这里只做纯文本到
 * 结构的转换，查不查得到由词典查询负责。
 */

const FORM_KINDS: Record<string, DictionaryFormKind> = {
  p: 'past',
  d: 'past-participle',
  i: 'present-participle',
  3: 'third-person',
  s: 'plural',
  r: 'comparative',
  t: 'superlative'
}

/** 界面上词形变化的固定顺序：先动词，再名词，最后形容词。 */
const FORM_ORDER: readonly DictionaryFormKind[] = [
  'past',
  'past-participle',
  'present-participle',
  'third-person',
  'plural',
  'comparative',
  'superlative'
]

/**
 * 释义行首的词性前缀，如 `n.`、`vt.`、`abbr.`；`[法]` 这类领域标记不算词性，
 * 整行原样作为释义文本，词性留空。
 */
const POS_PREFIX = /^([A-Za-z]{1,5}\.)\s*(.*)$/u

export function parseSenses(translation: string): DictionarySense[] {
  const senses: DictionarySense[] = []
  for (const raw of translation.split(/\\n|\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const match = POS_PREFIX.exec(line)
    const pos = match?.[1]?.toLowerCase() ?? ''
    const text = (match?.[2] ?? line).trim()
    if (text === '') continue
    senses.push({ pos, text })
  }
  return senses
}

/**
 * 把 exchange 拆成词形变化。`0:`（lemma）与 `1:`（本词形的类别标记）不展示；
 * 同一个词形身兼多类时合成一条，比如 approached 既是过去式也是过去分词。
 */
export function parseForms(exchange: string, word: string): DictionaryForm[] {
  const merged = new Map<string, DictionaryForm>()
  for (const item of exchange.split('/')) {
    const colon = item.indexOf(':')
    if (colon <= 0) continue
    const kind = FORM_KINDS[item.slice(0, colon).trim()]
    if (kind === undefined) continue
    const form = item.slice(colon + 1).trim()
    if (form === '' || form.toLowerCase() === word.toLowerCase()) continue

    const key = form.toLowerCase()
    const existing = merged.get(key)
    if (existing === undefined) {
      merged.set(key, { form, kinds: [kind] })
    } else if (!existing.kinds.includes(kind)) {
      existing.kinds.push(kind)
    }
  }

  return [...merged.values()]
    .map((form) => ({
      ...form,
      kinds: [...form.kinds].sort(
        (left, right) => FORM_ORDER.indexOf(left) - FORM_ORDER.indexOf(right)
      )
    }))
    .sort(
      (left, right) =>
        FORM_ORDER.indexOf(left.kinds[0]) - FORM_ORDER.indexOf(right.kinds[0]) ||
        left.form.localeCompare(right.form)
    )
}

/**
 * ECDICT 的音标混着几种写法：西里尔 ә、ASCII 撇号当重音、ASCII 冒号当长音符。
 * 统一成常见 IPA 记号，显示时才不会出现两种长得像的 schwa。
 */
const PHONETIC_LETTERS: Record<string, string> = {
  'ә': 'ə',
  'є': 'ɛ',
  ε: 'ɛ',
  "'": 'ˈ',
  ':': 'ː'
}

/** 音标偶尔带方括号或斜杠，统一去掉包裹；空音标就是空串。 */
export function cleanPhonetic(phonetic: string): string {
  return phonetic
    .trim()
    .replace(/^[/[]+|[/\]]+$/gu, '')
    .replace(/[әєε':]/gu, (letter) => PHONETIC_LETTERS[letter] ?? letter)
    .replace(/\s+/gu, ' ')
    .trim()
}
