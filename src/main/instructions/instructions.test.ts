import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LEARNING_INSTRUCTION_EXAMPLES } from '../../shared/learning-instructions'
import type { LearningInstruction } from '../../shared/learning-instructions'
import { openDatabase, type AppDatabase } from '../db/database'
import { LATEST_SCHEMA_VERSION, migrate, readSchemaVersion } from '../db/migrations'
import {
  copyLearningInstruction,
  createLearningInstruction,
  deleteLearningInstruction,
  readLearningInstructions,
  updateLearningInstruction
} from './instructions'

const T0 = '2026-11-20T01:00:00.000Z'
const T1 = '2026-11-20T01:05:00.000Z'
const T2 = '2026-11-20T01:10:00.000Z'

let directory: string
let file: string
let database: AppDatabase

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'english-learning-instructions-'))
  file = join(directory, 'test.db')
  database = openDatabase(file)
  migrate(database)
})

afterEach(() => {
  database.close()
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

function save(name: string, body: string, now: string = T0): LearningInstruction {
  const result = createLearningInstruction(database, { name, body }, { now })
  if (result.status !== 'saved') {
    throw new Error(`没保存成功：${result.status}`)
  }
  return result.instruction
}

describe('学习指令的保存与列表', () => {
  it('空库没有指令；六条内置示例只是只读示例，不写进用户记录', () => {
    expect(readLearningInstructions(database)).toEqual([])
    expect(LEARNING_INSTRUCTION_EXAMPLES.map((example) => example.name)).toEqual([
      '词义与用法',
      '例句',
      '近义辨析',
      '助记',
      '多义词',
      '生成文章'
    ])
    expect(database.prepare('SELECT COUNT(*) AS count FROM learning_instruction').get()).toEqual({
      count: 0
    })
  })

  it('把当前输入存成命名指令，列表里带名称与更新时间', () => {
    const instruction = save('  我的问法  ', '  请结合原句解释这个词。  ', T0)

    expect(instruction).toMatchObject({
      name: '我的问法',
      body: '请结合原句解释这个词。',
      createdAt: T0,
      updatedAt: T0
    })
    expect(instruction.id).not.toBe('')
    expect(readLearningInstructions(database)).toEqual([instruction])
  })

  it('按更新时间倒序，刚改过的排在最前', () => {
    const first = save('第一条', '正文一', T0)
    const second = save('第二条', '正文二', T1)
    expect(readLearningInstructions(database).map((item) => item.id)).toEqual([
      second.id,
      first.id
    ])

    updateLearningInstruction(
      database,
      { instructionId: first.id, name: '第一条', body: '正文一改' },
      { now: T2 }
    )

    expect(readLearningInstructions(database).map((item) => item.name)).toEqual([
      '第一条',
      '第二条'
    ])
  })

  it('名称或正文全空时拒绝，不留下半条记录', () => {
    expect(createLearningInstruction(database, { name: '  ', body: '正文' })).toEqual({
      status: 'rejected',
      reason: 'empty-name'
    })
    expect(createLearningInstruction(database, { name: '名称', body: ' \n ' })).toEqual({
      status: 'rejected',
      reason: 'empty-body'
    })
    expect(readLearningInstructions(database)).toEqual([])
  })
})

describe('修改与重命名学习指令', () => {
  it('正文可改、名称可改；创建时间不动，更新时间前移', () => {
    const created = save('旧名', '旧正文', T0)

    const renamed = updateLearningInstruction(
      database,
      { instructionId: created.id, name: '新名', body: '旧正文' },
      { now: T1 }
    )
    expect(renamed.status).toBe('saved')
    if (renamed.status !== 'saved') return
    expect(renamed.instruction).toMatchObject({
      id: created.id,
      name: '新名',
      body: '旧正文',
      createdAt: T0,
      updatedAt: T1
    })

    const edited = updateLearningInstruction(
      database,
      { instructionId: created.id, name: '新名', body: '新正文' },
      { now: T2 }
    )
    expect(edited.status).toBe('saved')
    if (edited.status !== 'saved') return
    expect(edited.instruction).toMatchObject({
      name: '新名',
      body: '新正文',
      createdAt: T0,
      updatedAt: T2
    })
    expect(readLearningInstructions(database)).toEqual([edited.instruction])
  })

  it('改不存在的指令返回 missing；改成空名称或空正文时拒绝且不动旧内容', () => {
    const created = save('原名', '原正文', T0)

    expect(
      updateLearningInstruction(database, {
        instructionId: 'nope',
        name: '名称',
        body: '正文'
      })
    ).toEqual({ status: 'missing' })
    expect(
      updateLearningInstruction(database, {
        instructionId: created.id,
        name: '   ',
        body: '正文'
      })
    ).toEqual({ status: 'rejected', reason: 'empty-name' })
    expect(
      updateLearningInstruction(database, {
        instructionId: created.id,
        name: '名称',
        body: '   '
      })
    ).toEqual({ status: 'rejected', reason: 'empty-body' })
    expect(readLearningInstructions(database)).toEqual([created])
  })
})

describe('复制学习指令', () => {
  it('复制出独立的一条：正文相同、名称带副本，改副本不影响原指令', () => {
    const original = save('我的问法', '请解释这个词。', T0)

    const copied = copyLearningInstruction(database, { instructionId: original.id }, { now: T1 })
    expect(copied.status).toBe('saved')
    if (copied.status !== 'saved') return
    expect(copied.instruction).toMatchObject({
      name: '我的问法（副本）',
      body: '请解释这个词。',
      createdAt: T1,
      updatedAt: T1
    })
    expect(copied.instruction.id).not.toBe(original.id)
    expect(readLearningInstructions(database).map((item) => item.id)).toEqual([
      copied.instruction.id,
      original.id
    ])

    updateLearningInstruction(
      database,
      { instructionId: copied.instruction.id, name: copied.instruction.name, body: '副本改过' },
      { now: T2 }
    )

    expect(readLearningInstructions(database).find((item) => item.id === original.id)).toEqual(
      original
    )
  })

  it('复制不存在的指令返回 missing', () => {
    expect(copyLearningInstruction(database, { instructionId: 'nope' })).toEqual({
      status: 'missing'
    })
  })
})

describe('删除学习指令', () => {
  it('删除后列表里不再有，再删返回 missing', () => {
    const created = save('要删的', '正文', T0)

    expect(deleteLearningInstruction(database, { instructionId: created.id })).toEqual({
      status: 'deleted'
    })
    expect(readLearningInstructions(database)).toEqual([])
    expect(deleteLearningInstruction(database, { instructionId: created.id })).toEqual({
      status: 'missing'
    })
  })
})

describe('重启后仍能读自定义指令', () => {
  it('关掉数据库再用同一个文件打开，保存的指令、正文与更新时间都在', () => {
    const created = save('重启也在', '请给我三个例句。', T1)

    database.close()
    database = openDatabase(file)

    expect(readSchemaVersion(database)).toBe(LATEST_SCHEMA_VERSION)
    expect(readLearningInstructions(database)).toEqual([created])
  })
})
