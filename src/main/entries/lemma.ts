/**
 * 词条的归一键：同一个词或短语共用一个键，常见词形变化归到同一个词条。
 *
 * 产品说明把精确归并交给随包的 ECDICT（exchange 字段与 lemma）。词典接入前（#34），
 * 这里先用规则 + 本机语料做一次保守归并：词库里真实出现过的候选原形优先，
 * 查不到时只接受有把握的拆法（-ed / -ing 的普通词干、复数 -ies→-y 等），
 * 拿不准就保留原样，宁可多一个词条，也不把两个不相干的词并在一起。
 */

export type LemmaLexicon = {
  has(word: string): boolean
}

/**
 * 高频不规则变化。归并键与主词形分开：主词形仍是学习者圈下的那个词形。
 * 同时收录几组容易和普通词尾混淆的复数，避免把 theses 并给 these。
 */
/**
 * 高频不规则变化。只收没有独立常用义的同形词：left（左边）、saw（锯）、
 * found（建立）、felt（毛毡）、rose（玫瑰）、thought（想法）这类等内置词典
 * 接入后交给 ECDICT 判断，这里宁可不并，也不把两个意思并错。
 */
const IRREGULAR: Record<string, string> = {
  am: 'be',
  is: 'be',
  are: 'be',
  was: 'be',
  were: 'be',
  been: 'be',
  being: 'be',
  has: 'have',
  had: 'have',
  having: 'have',
  does: 'do',
  did: 'do',
  done: 'do',
  doing: 'do',
  goes: 'go',
  went: 'go',
  gone: 'go',
  made: 'make',
  took: 'take',
  taken: 'take',
  taking: 'take',
  came: 'come',
  coming: 'come',
  seen: 'see',
  seeing: 'see',
  knew: 'know',
  got: 'get',
  gotten: 'get',
  getting: 'get',
  gave: 'give',
  giving: 'give',
  told: 'tell',
  became: 'become',
  shown: 'show',
  brought: 'bring',
  began: 'begin',
  begun: 'begin',
  beginning: 'begin',
  kept: 'keep',
  held: 'hold',
  wrote: 'write',
  writing: 'write',
  stood: 'stand',
  heard: 'hear',
  meant: 'mean',
  met: 'meet',
  ran: 'run',
  running: 'run',
  paid: 'pay',
  sat: 'sit',
  sitting: 'sit',
  spoke: 'speak',
  spoken: 'speak',
  led: 'lead',
  grew: 'grow',
  losing: 'lose',
  fell: 'fall',
  sent: 'send',
  built: 'build',
  understood: 'understand',
  drew: 'draw',
  broke: 'break',
  risen: 'rise',
  drove: 'drive',
  bought: 'buy',
  wore: 'wear',
  chose: 'choose',
  ate: 'eat',
  eaten: 'eat',
  taught: 'teach',
  caught: 'catch',
  fought: 'fight',
  threw: 'throw',
  slept: 'sleep',
  won: 'win',
  forgot: 'forget',
  sought: 'seek',
  sold: 'sell',
  used: 'use',
  using: 'use',
  uses: 'use',
  died: 'die',
  dying: 'die',
  dies: 'die',
  children: 'child',
  people: 'person',
  men: 'man',
  women: 'woman',
  feet: 'foot',
  teeth: 'tooth',
  mice: 'mouse',
  geese: 'goose',
  knives: 'knife',
  wives: 'wife',
  halves: 'half',
  shelves: 'shelf',
  wolves: 'wolf',
  thieves: 'thief',
  calves: 'calf',
  loaves: 'loaf',
  analyses: 'analysis',
  crises: 'crisis',
  theses: 'thesis',
  hypotheses: 'hypothesis',
  diagnoses: 'diagnosis',
  emphases: 'emphasis',
  phenomena: 'phenomenon',
  criteria: 'criterion'
}

/**
 * 单数或功能词也以 s 结尾，不能按复数拆。规则本身只接受“有把握”的拆法，
 * 这些词再单独挡一层，避免 news→new、this→thi 这类误并。
 */
const PROTECTED = new Set([
  'this',
  'his',
  'its',
  'us',
  'as',
  'is',
  'was',
  'has',
  'does',
  'goes',
  'says',
  'yes',
  'news',
  'series',
  'species',
  'always',
  'perhaps',
  'lens',
  'means'
])

type Candidate = {
  form: string
  /** 没有词库佐证时也可以接受的拆法。 */
  confident: boolean
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

function isVowel(letter: string | undefined): boolean {
  return letter !== undefined && VOWELS.has(letter)
}

function isConsonant(letter: string | undefined): boolean {
  return letter !== undefined && !VOWELS.has(letter)
}

/** 词干是否以同一个辅音字母结尾（running → runn，stopped → stopp）。 */
function endsWithDoubleConsonant(stem: string): boolean {
  const last = stem.at(-1)
  return last !== undefined && isConsonant(last) && stem.at(-2) === last
}

/** 词干是否是“辅—元—辅”，且最后的辅音不是词根本来就重复的那一个。 */
function isConsonantVowelConsonant(stem: string): boolean {
  return (
    stem.length >= 3 &&
    isConsonant(stem.at(-3)) &&
    isVowel(stem.at(-2)) &&
    isConsonant(stem.at(-1)) &&
    !isConsonant(stem.at(-4))
  )
}

function hasVowel(text: string): boolean {
  return Array.from(text).some((letter) => isVowel(letter))
}

function stripEdges(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

function normalize(surface: string): string {
  return surface
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function candidateList(word: string): Candidate[] {
  const candidates: Candidate[] = []
  const add = (form: string, confident: boolean): void => {
    if (form.length < 2 || form === word) return
    if (candidates.some((candidate) => candidate.form === form)) return
    candidates.push({ form, confident })
  }

  if (word.endsWith("'s") && word.length > 2) {
    add(word.slice(0, -2), true)
  }

  if (word.length > 4 && word.endsWith('ies')) {
    add(`${word.slice(0, -3)}y`, true)
    add(word.slice(0, -1), false)
  } else if (
    word.endsWith('sses') ||
    word.endsWith('shes') ||
    word.endsWith('ches') ||
    word.endsWith('xes') ||
    word.endsWith('zes')
  ) {
    add(word.slice(0, -2), true)
  } else if (word.length >= 4 && word.endsWith('es')) {
    add(word.slice(0, -1), false)
    add(word.slice(0, -2), false)
  } else if (word.length >= 4 && word.endsWith('s') && !word.endsWith('ss')) {
    add(word.slice(0, -1), false)
  }

  if (word.length > 4 && word.endsWith('ied')) {
    add(`${word.slice(0, -3)}y`, true)
  } else if (word.length >= 4 && word.endsWith('ed')) {
    const stem = word.slice(0, -2)
    if (stem.length >= 3 && hasVowel(stem)) {
      if (endsWithDoubleConsonant(stem)) {
        add(stem, false)
        add(stem.slice(0, -1), true)
      } else if (isConsonantVowelConsonant(stem)) {
        // hoped：词干是 hop，但英语拼写里原形是 hope；拿不准就不在没词库时硬猜。
        add(`${stem}e`, false)
        add(stem, false)
      } else {
        add(stem, true)
        add(`${stem}e`, false)
      }
    }
  }

  if (word.length >= 5 && word.endsWith('ing')) {
    const stem = word.slice(0, -3)
    if (stem.length >= 3 && hasVowel(stem)) {
      if (endsWithDoubleConsonant(stem)) {
        add(stem, false)
        add(stem.slice(0, -1), true)
      } else if (isConsonantVowelConsonant(stem)) {
        add(`${stem}e`, false)
        add(stem, false)
      } else {
        add(stem, true)
        add(`${stem}e`, false)
      }
    }
  }

  return candidates
}

/**
 * 一个词或短语的归一键。`lexicon` 用来判断候选原形是否真实存在——阅读页传的是
 * 本机语料里出现过的词形与已有词条的键；词典接入后换成 ECDICT 的 lemma 即可。
 */
export function resolveLemma(surface: string, lexicon: LemmaLexicon): string {
  const normalized = normalize(surface)
  if (normalized === '') {
    return ''
  }

  // 短语按整条比较，不拆开逐词还原词形。
  if (normalized.includes(' ')) {
    return stripEdges(normalized)
  }

  const word = stripEdges(normalized)
  if (word === '') {
    return normalized
  }

  const irregular = IRREGULAR[word]
  if (irregular !== undefined) {
    return irregular
  }
  if (PROTECTED.has(word)) {
    return word
  }

  const candidates = candidateList(word)
  for (const candidate of candidates) {
    if (lexicon.has(candidate.form)) {
      return candidate.form
    }
  }

  const confident = candidates.find((candidate) => candidate.confident)
  return confident?.form ?? word
}
