import { askQuestion, createThread, saveAnswer } from '../../src/main/chat/threads'
import type { AppDatabase } from '../../src/main/db/database'
import type { CreateThreadRequest } from '../../src/shared/threads'

/** Add a finished turn to an open fixture database; callers choose which ranges to pin. */
export function seedAnsweredThread(database: AppDatabase, fixture: {
  main?: CreateThreadRequest['main']
  question: string
  answer: string
  model?: string
}): { threadId: string; answerId: string } {
  const created = createThread(database, { main: fixture.main ?? { kind: 'none' } })
  if (created.status !== 'created') throw new Error('线程没建起来')
  const threadId = created.thread.id
  const asked = askQuestion(database, { threadId, text: fixture.question })
  if (asked.status !== 'asked') throw new Error('问题没写进去')
  const saved = saveAnswer(database, {
    threadId, questionId: asked.questionId, text: fixture.answer, thinking: '', phase: 'done',
    ...(fixture.model === undefined ? {} : { model: fixture.model })
  })
  const answerId = saved.status === 'saved' ? saved.thread.turns[0]?.answer?.id : undefined
  if (!answerId) throw new Error('没有保存回答')
  return { threadId, answerId }
}
