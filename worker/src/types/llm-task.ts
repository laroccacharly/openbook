import { z } from "zod"

export const LlmTaskTypeSchema = z.enum([
  "first_pass",
  "extract_datetimes",
  "extract_required_information",
  "extract_job",
  "compose_response",
])

export type LlmTaskType = z.infer<typeof LlmTaskTypeSchema>

export const LlmTaskRowSchema = z.object({
  id: z.number().int(),
  message_id: z.number().int(),
  task_type: z.string(),
  result: z.string().nullable(),
  model: z.string(),
  system_prompt: z.string(),
  created_at: z.number().int(),
  completed_at: z.number().int().nullable(),
  failed_at: z.number().int().nullable(),
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  attempt: z.number().int(),
})

export type LlmTaskRow = z.infer<typeof LlmTaskRowSchema>

export const LlmTaskCreateSchema = z.object({
  messageId: z.number().int(),
  taskType: LlmTaskTypeSchema,
  languageModelId: z.string().min(1),
  systemPrompt: z.string().min(1),
})

export type LlmTaskCreateInput = z.input<typeof LlmTaskCreateSchema>
export type LlmTaskCreate = z.infer<typeof LlmTaskCreateSchema>

export const LlmTaskSchema = z.object({
  id: z.number().int(),
  messageId: z.number().int(),
  taskType: z.string(),
  result: z.unknown().nullable(),
  languageModelId: z.string(),
  systemPrompt: z.string(),
  createdAt: z.number().int(),
  completedAt: z.number().int().nullable(),
  failedAt: z.number().int().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  attempt: z.number().int(),
})

export type LlmTask = z.infer<typeof LlmTaskSchema>

export function llmTaskFromRow(row: LlmTaskRow): LlmTask {
  return LlmTaskSchema.parse({
    id: row.id,
    messageId: row.message_id,
    taskType: row.task_type,
    result: row.result === null ? null : JSON.parse(row.result),
    languageModelId: row.model,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    error: row.error,
    durationMs: row.duration_ms,
    attempt: row.attempt,
  })
}
