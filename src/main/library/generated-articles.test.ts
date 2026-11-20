import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatError } from '../../shared/chat'
import { canSaveAnswerAsArticle } from '../../renderer/src/chat/turns'
import {
  createGroupThread,
  createThread,
  askQuestion,
  readThreadView,
  saveAnswer,
  saveContinuation,
  switchAnswer,
  updateThreadContext
} from '../chat/threads'
import { importCorpus } from '../corpus/import'
import { createBackup, restoreBackup } from '../data/backup'
import { openDatabase, type AppDatabase } from '../db/database'
import { migrate } from '../db/migrations'
import { collectSelection, readEntrySentenceTarget } from '../entries/queries'
import { deleteEntrySentence } from '../entries/queries'
import { deleteArticle, readArticleDeletionPreview, renameArticle } from './articles'
import { fixtureArticle, writeCorpusDirectory } from '../../testing/corpus-fixture'
import { createPin, readPinBoard } from '../pins/pins'
import { readArticleDetail, readHomeSummary, readLibrary, readReadingPoint, searchLibrary } from './queries'
import { openReadingView, readReadingView, saveReadingPoint } from '../reading/queries'
import { saveGeneratedArticle } from './generated-articles'

const ARTICLE = fixtureArticle({
  id: 'fixture-generated-source',
  sentences: [
    ['Employers approach hiring differently.', 'Approaching a new desk takes patience.'],
    ['Context keeps the skill alive.', 'Repeated words stick.']
  ]
})

type JsonParagraph = {
  id: string
  text: string
  sentences: { ordinal: number; text: string; start: number; end: number }[]
}

let directory: string
let database: AppDatabase
let approachEntryId: string
let contextEntryId: string

function paragraphAt(index: number): JsonParagraph {
  const paragraph = (ARTICLE.json.paragraphs as JsonParagraph[])[index]
  if (!paragraph) throw new Error(`fixture 没有第 ${index} 段`)
  return paragraph
}

function seedWord(needle: string, paragraphIndex: number, at: string): string {
  const paragraph = paragraphAt(paragraphIndex)
  const start = paragraph.text.indexOf(needle)
  if (start < 0) throw new Error(`第 ${paragraphIndex} 段没有 ${needle}`)
  const sentenceOrdinal = paragraph.sentences.findIndex(
    (sentence) => sentence.start <= start && start < sentence.end
  )
  const result = collectSelection(
    database,
    {
      articleId: ARTICLE.id,
      paragraphId: paragraph.id,
      sentenceOrdinal,
      start,
      end: start + needle.length
    },
    { now: at }
  )
  if (result.status === 'rejected') throw new Error(`收 ${needle} 被拒绝：${result.reason}`)
  return result.entry.id
}

/** 用一组词开线程并提一问；返回线程与这一问的 id。 */
function askWithWords(entryIds: readonly string[]): { threadId: string; questionId: string } {
  const created = createGroupThread(database, { entryIds: [...entryIds] })
  if (created.status !== 'created') throw new Error('组词线程没建起来')
  const asked = askQuestion(database, {
    threadId: created.thread.id,
    text: '用这些词写一段英文阅读材料。'
  })
  if (asked.status !== 'asked') throw new Error('提问没写进去')
  return { threadId: created.thread.id, questionId: asked.questionId }
}

function currentAnswerId(threadId: string): string {
  const view = readThreadView(database, threadId)
  const answerId = view?.turns[0]?.answer?.id
  if (!answerId) throw new Error('线程里没有回答')
  return answerId
}

function answerWith(
  input: { threadId: string; questionId: string },
  text: string,
  overrides: {
    phase?: 'done' | 'stopped' | 'error'
    model?: string
    error?: ChatError
  } = {}
): string {
  const saved = saveAnswer(database, {
    threadId: input.threadId,
    questionId: input.questionId,
    text,
    thinking: '',
    phase: overrides.phase ?? 'done',
    ...(overrides.model === undefined ? {} : { model: overrides.model }),
    ...(overrides.error === undefined ? {} : { error: overrides.error })
  })
  if (saved.status !== 'saved') throw new Error('回答没保存')
  return currentAnswerId(input.threadId)
}

function saveArticle(threadId: string, answerId: string, title?: string) {
  return saveGeneratedArticle(database, {
    threadId,
    answerId,
    ...(title === undefined ? {} : { title })
  })
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-generated-'))
  const corpusDirectory = join(directory, 'corpus')
  writeCorpusDirectory(corpusDirectory, [ARTICLE])
  database = openDatabase(join(directory, 'test.db'))
  migrate(database)
  importCorpus(database, { directory: corpusDirectory })
  approachEntryId = seedWord('approach', 0, '2026-11-18T08:00:00.000Z')
  contextEntryId = seedWord('Context', 1, '2026-11-18T08:05:00.000Z')
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

describe('saveGeneratedArticle', () => {
  it('保存整条回答：进 AI 段、正文按段与句写入、详情带来源词', () => {
    const input = askWithWords([approachEntryId, contextEntryId])
    const answerId = answerWith(
      input,
      'Approach changes how we read. Context keeps it alive.\r\n\r\n' +
        'A second paragraph has two sentences. The last one has no period'
    )

    const saved = saveArticle(input.threadId, answerId)

    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') return
    expect(saved.article.sourceType).toBe('ai')
    expect(saved.article.kindLabel).toBe('AI 生成')
    expect(saved.article.sessionLabel).toBe('')
    expect(saved.article.setLabel).toBe('')
    expect(saved.article.wordCount).toBe(21)
    expect(saved.article.paragraphCount).toBe(2)
    expect(saved.article.sentenceCount).toBe(4)
    expect(saved.article.sourceWords).toEqual([
      { entryId: approachEntryId, mainForm: 'approach' },
      { entryId: contextEntryId, mainForm: 'Context' }
    ])

    // 文章库：真题仍按场次，生成文章单独一段；总数含 AI，场次数不含。
    const listing = readLibrary(database)
    expect(listing.sessions).toHaveLength(1)
    expect(listing.sessionCount).toBe(1)
    expect(listing.articleCount).toBe(2)
    expect(listing.aiArticles.map((article) => article.id)).toEqual([saved.article.id])
    expect(listing.aiArticles[0]).toMatchObject({ sourceType: 'ai', kindLabel: 'AI 生成' })

    // 正文结构与阅读页共用：段序、句序、段内 UTF-16 偏移，页码为空。
    const reading = readReadingView(database, saved.article.id)
    expect(reading).not.toBeNull()
    if (reading === null) return
    expect(reading.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'Approach changes how we read. Context keeps it alive.',
      'A second paragraph has two sentences. The last one has no period'
    ])
    expect(reading.paragraphs.map((paragraph) => paragraph.letter)).toEqual([null, null])
    for (const paragraph of reading.paragraphs) {
      expect(paragraph.sentences).toHaveLength(2)
      for (const sentence of paragraph.sentences) {
        expect(sentence.text).toBe(paragraph.text.slice(sentence.start, sentence.end))
        expect(sentence.page).toBeNull()
      }
    }
    expect(reading.paragraphs[0]?.sentences.map((sentence) => sentence.ordinal)).toEqual([0, 1])
    expect(reading.article.sourceType).toBe('ai')

    // 正文参与既有文章搜索，不用另一套全局搜索。
    const found = searchLibrary(database, 'context keeps it alive')
    expect(found.results.map((result) => result.article.id)).toContain(saved.article.id)
    expect(found.results.find((result) => result.article.id === saved.article.id)?.matched).toBe(
      'body'
    )

    // 阅读位置与首页「继续阅读」走同一条既有链路，不需要 AI 专用分支。
    const opened = openReadingView(database, saved.article.id, {
      now: '2026-11-18T10:00:00.000Z'
    })
    expect(opened?.readingPoint).toMatchObject({ paragraphOrdinal: 1, sentenceOrdinal: 1 })
    const secondParagraph = opened?.paragraphs[1]
    if (!secondParagraph) throw new Error('没有第二段')
    expect(
      saveReadingPoint(
        database,
        {
          articleId: saved.article.id,
          paragraphId: secondParagraph.id,
          sentenceOrdinal: 0
        },
        { now: '2026-11-18T10:05:00.000Z' }
      )
    ).toEqual({ saved: true })
    expect(readReadingPoint(database, saved.article.id)).toMatchObject({
      paragraphOrdinal: 2,
      sentenceOrdinal: 1
    })
    expect(readHomeSummary(database).continueReading?.article.id).toBe(saved.article.id)
  })

  it('挂单词条的线程也能存为文章：来源就是那个词条，主对象类型不变', () => {
    const created = createThread(database, {
      main: { kind: 'entry', entryId: approachEntryId }
    })
    if (created.status !== 'created') throw new Error('词条线程没建起来')
    expect(created.thread.main).toMatchObject({ kind: 'entry', entryId: approachEntryId })
    const asked = askQuestion(database, {
      threadId: created.thread.id,
      text: '围绕这个词写一段。'
    })
    if (asked.status !== 'asked') throw new Error('提问没写进去')
    const answerId = answerWith(
      { threadId: created.thread.id, questionId: asked.questionId },
      'A single word can seed a whole article. It still reads like prose.'
    )

    const saved = saveArticle(created.thread.id, answerId)
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') return
    expect(saved.article.sourceWords).toEqual([
      { entryId: approachEntryId, mainForm: 'approach' }
    ])
    expect(saved.article.title).toBe('approach')
    // 存为文章不改线程主对象：仍是词条线程。
    expect(readThreadView(database, created.thread.id)?.main.kind).toBe('entry')
  })

  it('重复保存每次新建一篇：旧篇正文与来源不被覆盖', () => {
    const input = askWithWords([approachEntryId])
    const answerId = answerWith(input, 'First saved body. It stays put.')
    const first = saveArticle(input.threadId, answerId)
    const second = saveArticle(input.threadId, answerId)
    expect(first.status).toBe('saved')
    expect(second.status).toBe('saved')
    if (first.status !== 'saved' || second.status !== 'saved') return

    expect(second.article.id).not.toBe(first.article.id)
    const listing = readLibrary(database)
    expect(listing.aiArticles).toHaveLength(2)
    expect(listing.aiArticles.map((article) => article.id)).toEqual([
      second.article.id,
      first.article.id
    ])
    expect(listing.articleCount).toBe(3)
    // 两篇都还是独立的正文，没有被后一次保存改写。
    expect(readReadingView(database, first.article.id)?.paragraphs[0]?.text).toBe(
      'First saved body. It stays put.'
    )
    expect(readReadingView(database, second.article.id)?.paragraphs[0]?.text).toBe(
      'First saved body. It stays put.'
    )
  })

  it('保存的是当前显示版本；继续生成接在同一篇回答里，切回旧版存的是旧版', () => {
    const input = askWithWords([approachEntryId])
    const firstVersion = answerWith(input, 'Version one body. It has two sentences.')
    const firstSave = saveArticle(input.threadId, firstVersion)
    expect(firstSave.status).toBe('saved')

    const secondVersion = answerWith(input, 'Version two body. It replaces the view.')
    expect(secondVersion).not.toBe(firstVersion)
    const secondSave = saveArticle(input.threadId, secondVersion)
    expect(secondSave.status).toBe('saved')
    if (firstSave.status !== 'saved' || secondSave.status !== 'saved') return
    expect(readReadingView(database, firstSave.article.id)?.paragraphs[0]?.text).toBe(
      'Version one body. It has two sentences.'
    )
    expect(readReadingView(database, secondSave.article.id)?.paragraphs[0]?.text).toBe(
      'Version two body. It replaces the view.'
    )

    // 继续生成：第二次保存的正文接上继续写出来的内容。
    const continued = saveContinuation(database, {
      threadId: input.threadId,
      answerId: secondVersion,
      text: ' A continued sentence follows.',
      thinking: '',
      phase: 'done'
    })
    expect(continued.status).toBe('saved')
    const continuedSave = saveArticle(input.threadId, secondVersion)
    expect(continuedSave.status).toBe('saved')
    if (continuedSave.status !== 'saved') return
    expect(readReadingView(database, continuedSave.article.id)?.paragraphs[0]?.text).toBe(
      'Version two body. It replaces the view. A continued sentence follows.'
    )

    // 切回第一版：界面显示哪一版，存的就是哪一版。
    const questionId = readThreadView(database, input.threadId)?.turns[0]?.question.id
    if (questionId === undefined) throw new Error('没有这一问')
    const switched = switchAnswer(database, {
      threadId: input.threadId,
      questionId,
      answerId: firstVersion
    })
    expect(switched.status).toBe('switched')
    const switchedSave = saveArticle(input.threadId, firstVersion)
    expect(switchedSave.status).toBe('saved')
    if (switchedSave.status !== 'saved') return
    expect(readReadingView(database, switchedSave.article.id)?.paragraphs[0]?.text).toBe(
      'Version one body. It has two sentences.'
    )
  })

  it('早先停止或出错、后来成功续写后，保存的是当前完整正文而不是历史状态', () => {
    for (const phase of ['stopped', 'error'] as const) {
      const input = askWithWords([approachEntryId])
      const answerId = answerWith(input, 'Readers approach ', {
        phase,
        ...(phase === 'error' ? { error: { code: 'network' as const } } : {})
      })
      const continued = saveContinuation(database, {
        threadId: input.threadId,
        answerId,
        text: 'new ideas with patience.',
        thinking: '',
        phase: 'done'
      })
      expect(continued.status).toBe('saved')

      // 规范语义按最后一段聚合：成功续写后整条回答是 done，历史段状态只留在日志里。
      const turn = readThreadView(database, input.threadId)?.turns[0]
      expect(turn?.answer?.text).toBe('Readers approach new ideas with patience.')
      expect(turn?.answer?.phase).toBe('done')
      expect(turn?.answer?.error).toBeNull()
      expect(canSaveAnswerAsArticle(turn!.question, turn!.answer, false)).toBe(true)

      const saved = saveArticle(input.threadId, answerId)
      expect(saved.status).toBe('saved')
      if (saved.status !== 'saved') continue
      expect(readReadingView(database, saved.article.id)?.paragraphs[0]?.text).toBe(
        'Readers approach new ideas with patience.'
      )
    }
  })

  it('完成→停止→再成功续写仍可保存整版；最后一段停了就继续拒绝', () => {
    const input = askWithWords([approachEntryId])
    const answerId = answerWith(input, 'First complete sentence. ')
    expect(
      saveContinuation(database, {
        threadId: input.threadId,
        answerId,
        text: 'A stopped middle. ',
        thinking: '',
        phase: 'stopped'
      }).status
    ).toBe('saved')
    expect(saveArticle(input.threadId, answerId)).toEqual({
      status: 'rejected',
      reason: 'incomplete'
    })
    expect(
      saveContinuation(database, {
        threadId: input.threadId,
        answerId,
        text: 'A finished ending.',
        thinking: '',
        phase: 'done'
      }).status
    ).toBe('saved')

    const saved = saveArticle(input.threadId, answerId)
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') return
    expect(readReadingView(database, saved.article.id)?.paragraphs[0]?.text).toBe(
      'First complete sentence. A stopped middle. A finished ending.'
    )
  })

  it('回答正文里的 Markdown 标记原样保存，不偷偷改写给阅读页', () => {
    const input = askWithWords([approachEntryId])
    const body = '**Approach** stays visible. *Context* stays literal too.'
    const answerId = answerWith(input, body)

    const saved = saveArticle(input.threadId, answerId)
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') return
    expect(readReadingView(database, saved.article.id)?.paragraphs[0]?.text).toBe(body)
  })

  it('拒绝未完成、空正文、没有词上下文与不存在的回答', () => {
    const input = askWithWords([approachEntryId])

    const stopped = answerWith(input, 'Half an answer.', { phase: 'stopped' })
    expect(saveArticle(input.threadId, stopped)).toEqual({
      status: 'rejected',
      reason: 'incomplete'
    })
    const errored = answerWith(input, 'Broken answer.', { phase: 'error' })
    expect(saveArticle(input.threadId, errored)).toEqual({
      status: 'rejected',
      reason: 'incomplete'
    })
    const empty = answerWith(input, '   ')
    expect(saveArticle(input.threadId, empty)).toEqual({ status: 'rejected', reason: 'empty' })

    // 根回答完成、但继续生成中断：整条仍算未完成，不能把半截正文存成文章。
    const continued = answerWith(input, 'A complete start.')
    const stoppedContinuation = saveContinuation(database, {
      threadId: input.threadId,
      answerId: continued,
      text: ' A half-written continuation.',
      thinking: '',
      phase: 'stopped'
    })
    expect(stoppedContinuation.status).toBe('saved')
    expect(saveArticle(input.threadId, continued)).toEqual({
      status: 'rejected',
      reason: 'incomplete'
    })

    const blank = createGrouplessThread()
    expect(saveArticle(blank.threadId, blank.answerId)).toEqual({
      status: 'rejected',
      reason: 'no-word-context'
    })

    expect(saveArticle(input.threadId, 'no-such-answer')).toEqual({ status: 'missing' })
    expect(saveArticle('no-such-thread', empty)).toEqual({ status: 'missing' })

    const done = answerWith(input, 'A complete answer body.')
    expect(saveArticle(input.threadId, done, 'x'.repeat(201))).toEqual({
      status: 'rejected',
      reason: 'too-long'
    })
  })

  it('来源词只认提这一问时的上下文快照，后来改线程上下文不影响来源', () => {
    const input = askWithWords([approachEntryId])
    const answerId = answerWith(input, 'Snapshot article body. It has two sentences.')

    // 回答之后把上下文换成另一个词（甚至清空），保存时来源仍是提问时的 approach。
    updateThreadContext(database, { threadId: input.threadId, items: [] })
    const saved = saveArticle(input.threadId, answerId)
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') return
    expect(saved.article.sourceWords).toEqual([{ entryId: approachEntryId, mainForm: 'approach' }])

    // 再开一条带着另一个词的新线程问一句，来源只跟着那一问。
    const second = askWithWords([contextEntryId])
    const secondAnswer = answerWith(second, 'Another article body. Two sentences here.')
    const secondSave = saveArticle(second.threadId, secondAnswer)
    expect(secondSave.status).toBe('saved')
    if (secondSave.status !== 'saved') return
    expect(secondSave.article.sourceWords).toEqual([
      { entryId: contextEntryId, mainForm: 'Context' }
    ])
  })

  it('重命名保留来源；来源词被删后详情不崩、也不再给出可点的链接', () => {
    const input = askWithWords([approachEntryId])
    const answerId = answerWith(input, 'Rename article body. Two sentences live here.')
    const saved = saveArticle(input.threadId, answerId)
    if (saved.status !== 'saved') throw new Error('没保存')

    const renamed = renameArticle(database, {
      articleId: saved.article.id,
      title: '我的生成文章'
    })
    expect(renamed.status).toBe('renamed')
    const afterRename = readArticleDetail(database, saved.article.id)
    expect(afterRename?.title).toBe('我的生成文章')
    expect(afterRename?.sourceWords).toEqual([
      { entryId: approachEntryId, mainForm: 'approach' }
    ])

    // 删掉来源词的唯一一条原句：词条按既有规则消失，文章的来源记录保留但读不到名字。
    const sentence = database
      .prepare('SELECT id FROM entry_sentence WHERE entry_id = ? LIMIT 1')
      .get(approachEntryId) as { id: string }
    expect(deleteEntrySentence(database, sentence.id).status).toBe('deleted')

    const afterDelete = readArticleDetail(database, saved.article.id)
    expect(afterDelete?.sourceWords).toEqual([{ entryId: approachEntryId, mainForm: null }])
    expect(readLibrary(database).aiArticles.map((article) => article.id)).toEqual([
      saved.article.id
    ])
  })

  it('生成文章走既有阅读选词与收原句：原句回链到这篇与对应句子', () => {
    const input = askWithWords([approachEntryId])
    const answerId = answerWith(
      input,
      'Approach makes the page clear. Context holds the meaning.'
    )
    const saved = saveArticle(input.threadId, answerId)
    if (saved.status !== 'saved') throw new Error('没保存')

    const reading = readReadingView(database, saved.article.id)
    const paragraph = reading?.paragraphs[0]
    if (!paragraph) throw new Error('没有第一段')
    const start = paragraph.text.indexOf('mean')
    expect(start).toBeGreaterThanOrEqual(0)
    const sentence = paragraph.sentences.find(
      (candidate) => candidate.start <= start && start < candidate.end
    )
    if (!sentence) throw new Error('选区不在句子里')

    const collected = collectSelection(database, {
      articleId: saved.article.id,
      paragraphId: paragraph.id,
      sentenceOrdinal: sentence.ordinal,
      start,
      end: start + 'meaning'.length
    })
    expect(collected.status).toBe('collected')
    if (collected.status === 'rejected') return
    expect(collected.sentence.articleId).toBe(saved.article.id)
    expect(collected.sentence.sentenceText).toBe('Context holds the meaning.')

    // 词条页的「回到原文」需要这条原句能定位回生成文章。
    const target = readEntrySentenceTarget(database, collected.sentence.id)
    expect(target?.sentence.articleId).toBe(saved.article.id)
    expect(target?.sentence.articleTitle).toBe(saved.article.title)
    expect(target?.sentence.sentenceText).toBe('Context holds the meaning.')
  })

  it('备份与恢复保留生成文章、来源词与段落句子', async () => {
    const input = askWithWords([approachEntryId])
    const answerId = answerWith(
      input,
      'Backup keeps this article. Its sentences stay readable.'
    )
    const saved = saveArticle(input.threadId, answerId)
    if (saved.status !== 'saved') throw new Error('没保存')

    const backupFile = join(directory, 'snapshot-backup.db')
    await createBackup(database, { file: backupFile, now: '2026-11-18T10:00:00.000Z' })

    // 模拟资料库里的这篇文章丢失，再从备份整体恢复。
    database.prepare('DELETE FROM article WHERE id = ?').run(saved.article.id)
    expect(readLibrary(database).aiArticles).toEqual([])

    const restored = await restoreBackup(database, {
      file: backupFile,
      snapshotDirectory: join(directory, 'snapshots'),
      now: '2026-11-18T10:05:00.000Z'
    })
    expect(restored.status).toBe('restored')

    const detail = readArticleDetail(database, saved.article.id)
    expect(detail?.title).toBe(saved.article.title)
    expect(detail?.sourceWords).toEqual([
      { entryId: approachEntryId, mainForm: 'approach' }
    ])
    expect(readReadingView(database, saved.article.id)?.paragraphs[0]?.text).toBe(
      'Backup keeps this article. Its sentences stay readable.'
    )
    expect(readLibrary(database).aiArticles.map((article) => article.id)).toEqual([
      saved.article.id
    ])
  })

  it('删除生成文章与其他文章同规则：原句关联清掉，挂在本篇的钉住转未归档且快照保留', () => {
    const input = askWithWords([approachEntryId])
    const answerId = answerWith(
      input,
      'Approach grows with practice. A pin lives on this article.'
    )
    const saved = saveArticle(input.threadId, answerId)
    if (saved.status !== 'saved') throw new Error('没保存')

    const reading = readReadingView(database, saved.article.id)
    const paragraph = reading?.paragraphs[0]
    if (!paragraph) throw new Error('没有第一段')
    const start = paragraph.text.indexOf('Approach')
    const sentence = paragraph.sentences.find(
      (candidate) => candidate.start <= start && start < candidate.end
    )
    if (!sentence) throw new Error('选区不在句子里')
    const collected = collectSelection(database, {
      articleId: saved.article.id,
      paragraphId: paragraph.id,
      sentenceOrdinal: sentence.ordinal,
      start,
      end: start + 'Approach'.length
    })
    if (collected.status === 'rejected') throw new Error('没收集成功')

    const pinned = createPin(database, {
      threadId: input.threadId,
      answerId,
      start: 0,
      end: 'Approach grows with practice.'.length,
      target: { kind: 'article', articleId: saved.article.id }
    })
    expect(pinned.status).toBe('pinned')

    const preview = readArticleDeletionPreview(database, saved.article.id)
    expect(preview).toMatchObject({
      sentenceAssociationCount: 1,
      affectedEntryCount: 1,
      survivingEntryCount: 1,
      articlePinCount: 1
    })
    if (preview === null) throw new Error('没有预览')

    const deleted = deleteArticle(database, {
      articleId: saved.article.id,
      confirmed: preview
    })
    expect(deleted.status).toBe('deleted')
    expect(readLibrary(database).aiArticles).toEqual([])
    expect(readLibrary(database).articleCount).toBe(1)

    // 钉住快照不随文章删除消失，落点转为未归档。
    const board = readPinBoard(database, null)
    expect(board.unfiledCount).toBe(1)
    expect(board.unfiledPins[0]?.capturedText).toBe('Approach grows with practice.')
    expect(board.unfiledPins[0]?.target.kind).toBe('unfiled')
  })
})

/** 没有词上下文的空白线程：用来证明「带词」是存文章的必要条件。 */
function createGrouplessThread(): { threadId: string; answerId: string } {
  const created = createThread(database, { main: { kind: 'none' } })
  if (created.status !== 'created') throw new Error('空白线程没建起来')
  const threadId = created.thread.id
  const asked = askQuestion(database, { threadId, text: '没有带词的一问。' })
  if (asked.status !== 'asked') throw new Error('提问没写进去')
  const saved = saveAnswer(database, {
    threadId,
    questionId: asked.questionId,
    text: 'A body without any word context.',
    thinking: '',
    phase: 'done'
  })
  if (saved.status !== 'saved') throw new Error('回答没保存')
  return { threadId, answerId: currentAnswerId(threadId) }
}
