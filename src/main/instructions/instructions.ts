import { randomUUID } from 'node:crypto'
import type {
  CreateLearningInstructionRequest,
  LearningInstruction,
  LearningInstructionResult,
  UpdateLearningInstructionRequest
} from '../../shared/learning-instructions'
import type { AppDatabase } from '../db/database'

/**
 * 学习指令的读写：一张独立表，只存学习者自己保存的指令。
 * 六条内置示例是只读常量，不进这张表，因此改名、复制、删除都碰不到示例。
 */

type InstructionRow = {
  id: string
  name: string
  body: string
  created_at: string
  updated_at: string
}

function toInstruction(row: InstructionRow): LearningInstruction {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function readRow(database: AppDatabase, instructionId: string): InstructionRow | undefined {
  return database
    .prepare(
      `SELECT id, name, body, created_at, updated_at
         FROM learning_instruction WHERE id = ?`
    )
    .get(instructionId) as InstructionRow | undefined
}

function readInstruction(
  database: AppDatabase,
  instructionId: string
): LearningInstruction | null {
  const row = readRow(database, instructionId)
  return row ? toInstruction(row) : null
}

/** 列表按更新时间倒序：刚改过或刚保存的排在最前。 */
export function readLearningInstructions(database: AppDatabase): LearningInstruction[] {
  const rows = database
    .prepare(
      `SELECT id, name, body, created_at, updated_at
         FROM learning_instruction
         ORDER BY updated_at DESC, id DESC`
    )
    .all() as InstructionRow[]
  return rows.map(toInstruction)
}

/** 把当前输入存成一条命名指令；名称与正文都去掉两端空白，全空就不保存。 */
export function createLearningInstruction(
  database: AppDatabase,
  request: CreateLearningInstructionRequest,
  options: { now?: string } = {}
): LearningInstructionResult {
  const name = request.name.trim()
  if (name === '') {
    return { status: 'rejected', reason: 'empty-name' }
  }
  const body = request.body.trim()
  if (body === '') {
    return { status: 'rejected', reason: 'empty-body' }
  }

  const now = options.now ?? new Date().toISOString()
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO learning_instruction (id, name, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, name, body, now, now)

  const instruction = readInstruction(database, id)
  return instruction ? { status: 'saved', instruction } : { status: 'missing' }
}

/** 同时改名称与正文；旧稿不保留，创建时间不动。 */
export function updateLearningInstruction(
  database: AppDatabase,
  request: UpdateLearningInstructionRequest,
  options: { now?: string } = {}
): LearningInstructionResult {
  const existing = readRow(database, request.instructionId)
  if (!existing) {
    return { status: 'missing' }
  }
  const name = request.name.trim()
  if (name === '') {
    return { status: 'rejected', reason: 'empty-name' }
  }
  const body = request.body.trim()
  if (body === '') {
    return { status: 'rejected', reason: 'empty-body' }
  }

  const now = options.now ?? new Date().toISOString()
  database
    .prepare('UPDATE learning_instruction SET name = ?, body = ?, updated_at = ? WHERE id = ?')
    .run(name, body, now, existing.id)

  const instruction = readInstruction(database, existing.id)
  return instruction ? { status: 'saved', instruction } : { status: 'missing' }
}

/** 复制成一条独立的新指令：正文照抄，名称加「（副本）」，之后互不影响。 */
export function copyLearningInstruction(
  database: AppDatabase,
  request: { instructionId: string },
  options: { now?: string } = {}
): LearningInstructionResult {
  const existing = readRow(database, request.instructionId)
  if (!existing) {
    return { status: 'missing' }
  }

  const now = options.now ?? new Date().toISOString()
  const id = randomUUID()
  database
    .prepare(
      `INSERT INTO learning_instruction (id, name, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, `${existing.name}（副本）`, existing.body, now, now)

  const instruction = readInstruction(database, id)
  return instruction ? { status: 'saved', instruction } : { status: 'missing' }
}

/** 真删，不留墓碑；示例不在表里，删不到。 */
export function deleteLearningInstruction(
  database: AppDatabase,
  request: { instructionId: string }
): LearningInstructionResult {
  const result = database
    .prepare('DELETE FROM learning_instruction WHERE id = ?')
    .run(request.instructionId)
  return result.changes > 0 ? { status: 'deleted' } : { status: 'missing' }
}
