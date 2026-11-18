#!/usr/bin/env node
/**
 * 生成随包离线词典：把 ECDICT 的 ecdict.csv 裁剪成一份只读 SQLite。
 *
 * 收录范围（与 docs/product-scope.md「已确认的内置词典」一致）：
 *   - 两万核心词：BNC / 当代语料词频前 20000，或牛津三千；
 *   - 四六级标签词；
 *   - 首批 63 篇语料里出现过的词形；
 *   - 这些词条在 exchange 里指向的原形，以及各词形变化到原形的映射。
 *
 * 同一个词形的条目如果只是「X 的过去式」这类没有词性分条的薄释义，就不当词头，
 * 只在 lemma 表里指回原形，查 approached 得到的是 approach。
 *
 * 用法：
 *   node tools/build-dictionary.mjs --source <ecdict.csv> [--corpus docs/corpus]
 *     [--out assets/dictionary/ecdict.db] [--license <LICENSE 文件>]
 *
 * 源数据：ECDICT（https://github.com/skywind3000/ECDICT），MIT。
 * 生成的库只读，随应用分发，运行时不联网、不调用模型。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'

const SCHEMA_VERSION = 1
const FREQUENCY_LIMIT = 20000
const FORM_KINDS = ['p', 'd', 'i', '3', 's', 'r', 't']

function parseArguments(argv) {
  const options = {
    source: null,
    corpus: 'docs/corpus',
    out: 'assets/dictionary/ecdict.db',
    license: null
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!['--source', '--corpus', '--out', '--license'].includes(flag) || value === undefined) {
      throw new Error(`不认识参数 ${flag ?? ''}；用法见脚本头部注释。`)
    }
    options[flag.slice(2)] = value
    index += 1
  }
  if (options.source === null) {
    throw new Error('缺少 --source：指向 ECDICT 的 ecdict.csv。')
  }
  return options
}

/** 逐字符解析 CSV：字段里可以有逗号、引号与换行，换行统一成 \n。 */
function parseCsv(source) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += character
      }
      continue
    }
    if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (character !== '\r') {
      field += character
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function wordKey(word) {
  return word.trim().toLowerCase()
}

function readEcdict(file) {
  const raw = readFileSync(file)
  const rows = parseCsv(raw.toString('utf8'))
  const header = rows[0]
  if (header === undefined) throw new Error('ECDICT CSV 是空的。')
  const columns = new Map(header.map((name, index) => [name.trim(), index]))
  for (const required of ['word', 'phonetic', 'translation', 'tag', 'bnc', 'frq', 'oxford', 'exchange']) {
    if (!columns.has(required)) {
      throw new Error(`ECDICT CSV 缺少 ${required} 字段。`)
    }
  }
  const entries = []
  for (const row of rows.slice(1)) {
    const read = (name) => (row[columns.get(name)] ?? '').trim()
    entries.push({
      word: read('word'),
      phonetic: read('phonetic'),
      translation: read('translation'),
      tag: read('tag'),
      bnc: Number(read('bnc')) || 0,
      frq: Number(read('frq')) || 0,
      oxford: read('oxford'),
      exchange: read('exchange')
    })
  }
  return { entries, sha256: createHash('sha256').update(raw).digest('hex') }
}

/** 语料里真正出现过的词形；连字符与所有格再拆出基础形，方便收录到词头。 */
function readCorpusWords(directory) {
  const words = new Set()
  const addToken = (value) => {
    const token = value.replace(/[’‘]/g, "'").toLowerCase()
    if (token === '') return
    words.add(token)
    const [beforeApostrophe] = token.split("'")
    if (beforeApostrophe && beforeApostrophe !== token) words.add(beforeApostrophe)
    if (token.includes('-')) {
      for (const part of token.split('-')) {
        if (part !== '') words.add(part)
      }
    }
  }

  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.json') || file === 'manifest.json') continue
    const article = JSON.parse(readFileSync(join(directory, file), 'utf8'))
    for (const paragraph of article.paragraphs ?? []) {
      for (const match of String(paragraph.text ?? '').matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
        addToken(match[0].replace(/^['’-]+|['’-]+$/g, ''))
      }
    }
    for (const annotation of article.annotations ?? []) {
      if (typeof annotation.surface === 'string') addToken(annotation.surface)
    }
  }
  return words
}

function isCore(entry) {
  if (entry.oxford === '1') return true
  if (entry.frq > 0 && entry.frq <= FREQUENCY_LIMIT) return true
  if (entry.bnc > 0 && entry.bnc <= FREQUENCY_LIMIT) return true
  return /\bcet[46]\b/.test(entry.tag)
}

function baseKeyOf(entry) {
  const match = /(?:^|\/)0:([^/]+)/.exec(entry.exchange)
  return match?.[1]?.trim().toLowerCase() ?? null
}

/** 词形是否带词性分条；没有的话多半是「X的过去式」这类变体薄释义。 */
function hasPartOfSpeech(entry) {
  return entry.translation.split(/\\n|\r?\n/).some((line) => /^[A-Za-z]{1,5}\.\s*\S/.test(line.trim()))
}

/** 整条释义都在说「这是 X 的某个词形」，就算它带了词性也不当词头。 */
const VARIANT_GLOSS =
  /的(?:过去式|过去分词|现在分词|复数|名词复数|ing形式|比较级|最高级)|[(（][^)）]*(?:过去式|过去分词|现在分词|名词复数|复数|ing形式|比较级|最高级)[^)）]*[)）]/u

function isVariantOnly(entry) {
  const lines = entry.translation
    .split(/\\n|\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  return lines.length > 0 && lines.every((line) => VARIANT_GLOSS.test(line))
}

function formsOf(entry) {
  const forms = new Set()
  for (const item of entry.exchange.split('/')) {
    const colon = item.indexOf(':')
    if (colon <= 0) continue
    if (!FORM_KINDS.includes(item.slice(0, colon).trim())) continue
    const form = item.slice(colon + 1).trim().toLowerCase()
    if (form !== '' && form !== entry.word.trim().toLowerCase()) forms.add(form)
  }
  return forms
}

function selectDictionary(rows, corpusWords) {
  const byKey = new Map()
  for (const row of rows) {
    const key = wordKey(row.word)
    if (key === '' || row.translation === '') continue
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, row)
      continue
    }
    // 同词形多行时优先保留带音标、释义更全的一行，结果才稳定。
    if (existing.phonetic === '' && row.phonetic !== '') byKey.set(key, row)
  }

  const selected = new Set()
  for (const [key, entry] of byKey) {
    if (isCore(entry) || corpusWords.has(key)) selected.add(key)
  }

  // 语料里的变体词形会带出它的原形，保证 lemma 回退有落点。
  let grew = true
  while (grew) {
    grew = false
    for (const key of [...selected]) {
      const base = baseKeyOf(byKey.get(key))
      if (base !== null && byKey.has(base) && !selected.has(base)) {
        selected.add(base)
        grew = true
      }
    }
  }

  const headwords = new Map()
  const stubs = new Map()
  for (const key of selected) {
    const entry = byKey.get(key)
    const base = baseKeyOf(entry)
    if (base !== null && selected.has(base) && (!hasPartOfSpeech(entry) || isVariantOnly(entry))) {
      stubs.set(key, base)
      continue
    }
    headwords.set(key, entry)
  }

  const lemmas = new Map()
  // 变体可能指向另一个变体（0: 链条），一路走到真正的词头再落 lemma。
  const resolveHeadword = (start) => {
    let current = start
    const seen = new Set()
    while (!headwords.has(current)) {
      if (seen.has(current)) return null
      seen.add(current)
      const next = stubs.get(current)
      if (next === undefined) return null
      current = next
    }
    return current
  }

  for (const [form, base] of stubs) {
    const target = resolveHeadword(base)
    if (target !== null && target !== form && !headwords.has(form)) lemmas.set(form, target)
  }
  for (const [key, entry] of headwords) {
    for (const form of formsOf(entry)) {
      if (headwords.has(form) || lemmas.has(form)) continue
      lemmas.set(form, key)
    }
  }

  const unresolved = [...corpusWords].filter(
    (word) => !headwords.has(word) && !lemmas.has(word)
  )
  return { headwords, lemmas, unresolved, sourceRows: rows.length, byKey }
}

function writeDatabase(file, dictionary, metadata) {
  rmSync(file, { force: true })
  const database = new Database(file)
  database.pragma('journal_mode = OFF')
  database.pragma('synchronous = OFF')
  database.exec(`
    CREATE TABLE entry (
      key TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      phonetic TEXT NOT NULL,
      translation TEXT NOT NULL,
      exchange TEXT NOT NULL
    );
    CREATE TABLE lemma (
      form TEXT PRIMARY KEY,
      lemma TEXT NOT NULL
    );
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const insertEntry = database.prepare(
    'INSERT INTO entry (key, word, phonetic, translation, exchange) VALUES (?, ?, ?, ?, ?)'
  )
  const insertLemma = database.prepare('INSERT INTO lemma (form, lemma) VALUES (?, ?)')
  const insertMeta = database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)')

  database.transaction(() => {
    for (const [key, entry] of dictionary.headwords) {
      insertEntry.run(key, entry.word, entry.phonetic, entry.translation, entry.exchange)
    }
    for (const [form, lemma] of dictionary.lemmas) {
      insertLemma.run(form, lemma)
    }
    for (const [key, value] of Object.entries(metadata)) {
      insertMeta.run(key, String(value))
    }
  })()

  database.exec('VACUUM')
  database.close()
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const sourceFile = resolve(options.source)
  const corpusDirectory = resolve(options.corpus)
  const outputFile = resolve(options.out)

  console.log(`读 ${sourceFile} …`)
  const { entries, sha256 } = readEcdict(sourceFile)
  const corpusWords = readCorpusWords(corpusDirectory)
  console.log(`ECDICT ${entries.length} 行；语料词形 ${corpusWords.size} 个`)

  const dictionary = selectDictionary(entries, corpusWords)
  mkdirSync(dirname(outputFile), { recursive: true })
  const metadata = {
    schema_version: SCHEMA_VERSION,
    source: 'ECDICT',
    source_url: 'https://github.com/skywind3000/ECDICT',
    source_sha256: sha256,
    license: 'MIT',
    frequency_limit: FREQUENCY_LIMIT,
    source_rows: dictionary.sourceRows,
    corpus_forms: corpusWords.size,
    corpus_unresolved: dictionary.unresolved.length,
    entry_count: dictionary.headwords.size,
    lemma_count: dictionary.lemmas.size
  }

  writeDatabase(outputFile, dictionary, metadata)
  if (options.license !== null) {
    const licenseFile = resolve(dirname(outputFile), 'LICENSE-ECDICT')
    writeFileSync(licenseFile, readFileSync(resolve(options.license)))
    console.log(`版权声明：${licenseFile}`)
  }

  const bytes = readFileSync(outputFile).length
  console.log(
    `写出 ${outputFile}：${dictionary.headwords.size} 条词头、` +
      `${dictionary.lemmas.size} 条词形映射，${(bytes / 1024 / 1024).toFixed(2)} MB`
  )
  console.log(`语料词形查不到 ${dictionary.unresolved.length} 个`)
  if (dictionary.unresolved.length > 0) {
    console.log(`  ${dictionary.unresolved.slice(0, 60).join('、')}`)
  }
}

main()
