import type { D1Database } from "@cloudflare/workers-types"
import {
  type LlmTask,
  type LlmTaskCreateInput,
  LlmTaskCreateSchema,
  LlmTaskRowSchema,
  llmTaskFromRow,
} from "../types/llm-task"

function parseLlmTaskRow(row: unknown): LlmTask {
  return llmTaskFromRow(LlmTaskRowSchema.parse(row))
}

export async function createLlmTask(
  db: D1Database,
  input: LlmTaskCreateInput,
): Promise<LlmTask> {
  const task = LlmTaskCreateSchema.parse(input)
  const result = await db
    .prepare(
      `INSERT INTO llm_tasks (message_id, task_type, model, system_prompt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(message_id, task_type) DO UPDATE SET
         message_id = message_id
       RETURNING *`,
    )
    .bind(
      task.messageId,
      task.taskType,
      task.languageModelId,
      task.systemPrompt,
    )
    .first()

  if (result === null) {
    throw new Error("Failed to create llm task")
  }
  return parseLlmTaskRow(result)
}

export async function resetLlmTask(
  db: D1Database,
  taskId: number,
  input: { languageModelId: string; systemPrompt: string },
): Promise<LlmTask | null> {
  const existing = await getLlmTaskById(db, taskId)
  if (existing === null) {
    return null
  }

  await db
    .prepare(
      `UPDATE llm_tasks
       SET model = ?, system_prompt = ?,
           failed_at = NULL, error = NULL, duration_ms = NULL,
           attempt = attempt + 1
       WHERE id = ?`,
    )
    .bind(input.languageModelId, input.systemPrompt, taskId)
    .run()

  return getLlmTaskById(db, taskId)
}

export async function completeLlmTask(
  db: D1Database,
  taskId: number,
  result: unknown,
  durationMs: number,
): Promise<LlmTask | null> {
  const existing = await getLlmTaskById(db, taskId)
  if (existing === null) {
    return null
  }

  const completedAt = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `UPDATE llm_tasks
       SET result = ?, completed_at = ?, failed_at = NULL, error = NULL,
           duration_ms = ?
       WHERE id = ?`,
    )
    .bind(JSON.stringify(result), completedAt, durationMs, taskId)
    .run()

  return getLlmTaskById(db, taskId)
}

export async function failLlmTask(
  db: D1Database,
  taskId: number,
  error: string,
  durationMs: number,
): Promise<LlmTask | null> {
  const existing = await getLlmTaskById(db, taskId)
  if (existing === null) {
    return null
  }

  const failedAt = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `UPDATE llm_tasks
       SET failed_at = ?, error = ?, duration_ms = ?
       WHERE id = ?`,
    )
    .bind(failedAt, error, durationMs, taskId)
    .run()

  return getLlmTaskById(db, taskId)
}

export async function getLlmTaskById(
  db: D1Database,
  taskId: number,
): Promise<LlmTask | null> {
  const result = await db
    .prepare(`SELECT * FROM llm_tasks WHERE id = ?`)
    .bind(taskId)
    .first()
  if (result === null) {
    return null
  }
  return parseLlmTaskRow(result)
}

export async function getLlmTasks(db: D1Database): Promise<LlmTask[]> {
  const result = await db
    .prepare(`SELECT * FROM llm_tasks ORDER BY id DESC`)
    .all()

  return result.results.map(parseLlmTaskRow)
}

export async function getLlmTasksByMessageId(
  db: D1Database,
  messageId: number,
): Promise<LlmTask[]> {
  const result = await db
    .prepare(
      `SELECT * FROM llm_tasks
       WHERE message_id = ?
       ORDER BY id ASC`,
    )
    .bind(messageId)
    .all()

  return result.results.map(parseLlmTaskRow)
}
