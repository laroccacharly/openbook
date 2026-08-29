import type { D1Database } from "@cloudflare/workers-types"
import {
  completeLlmTask,
  createLlmTask,
  failLlmTask,
  resetLlmTask,
} from "../db/llm-tasks"
import type { LlmTaskType } from "../types/llm-task"

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export async function runPersistedTask<T>(options: {
  db: D1Database
  messageId: number
  taskType: LlmTaskType
  languageModelId: string
  systemPrompt: string
  run: () => Promise<T>
}): Promise<T> {
  const task = await createLlmTask(options.db, {
    messageId: options.messageId,
    taskType: options.taskType,
    languageModelId: options.languageModelId,
    systemPrompt: options.systemPrompt,
  })

  if (task.completedAt !== null) {
    if (task.result === null) {
      throw new Error(
        `Completed llm task ${task.id} (${options.taskType}) has no result`,
      )
    }
    return task.result as T
  }

  await resetLlmTask(options.db, task.id, {
    languageModelId: options.languageModelId,
    systemPrompt: options.systemPrompt,
  })

  const startedAt = Date.now()
  try {
    const result = await options.run()
    await completeLlmTask(options.db, task.id, result, Date.now() - startedAt)
    return result
  } catch (error) {
    await failLlmTask(
      options.db,
      task.id,
      errorMessage(error),
      Date.now() - startedAt,
    )
    throw error
  }
}
