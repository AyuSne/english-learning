/**
 * 内置离线词典的查询契约。渲染层只认这里返回的形状：音标、按词性分条的中文释义与
 * 词形变化，查不到时明确区分「没收录」与「词典没随包加载」。
 *
 * 词典只回答「这个词是什么」，不解释它在原文语境里的意思，也不调用模型。
 */

/** ECDICT exchange 字段里的词形变化类别。 */
export type DictionaryFormKind =
  | 'past'
  | 'past-participle'
  | 'present-participle'
  | 'third-person'
  | 'plural'
  | 'comparative'
  | 'superlative'

/** 一个词形变化；同一个词形可能身兼两类，比如 sailed 既是过去式也是过去分词。 */
export type DictionaryForm = {
  form: string
  kinds: DictionaryFormKind[]
}

/** 一条中文释义。词性前缀单独拿出来，界面上按词性分条显示。 */
export type DictionarySense = {
  /** 词性缩写，如 n. / vt. / adj.；没有词性前缀时是空串。 */
  pos: string
  /** 去掉词性前缀后的中文释义。 */
  text: string
}

export type DictionaryEntry = {
  /** 词典里的词头，小写。 */
  word: string
  /** 音标，已去掉包裹的斜杠或方括号；没有时是空串。 */
  phonetic: string
  senses: DictionarySense[]
  forms: DictionaryForm[]
}

/** 查一次词的结果。query 是归一后的查词形，界面拿它回显。 */
export type DictionaryLookup =
  | {
      status: 'found'
      query: string
      /** exact = 这个词形本身就是词头；lemma = 由词形变化回退到原形。 */
      via: 'exact' | 'lemma'
      entry: DictionaryEntry
    }
  | { status: 'missing'; query: string }
  | { status: 'unavailable'; query: string }

export type DictionaryLookupRequest = {
  /** 圈下的原样词形；归一交给主进程。 */
  word: string
}
