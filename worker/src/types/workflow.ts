import { z } from "zod"

export const WorkflowStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
])

export const WorkflowRecordSchema = z.object({
  recordName: z.string().min(1),
  recordId: z.number().int().positive(),
})

export type WorkflowRecord = z.infer<typeof WorkflowRecordSchema>

export const WorkflowRowSchema = z.object({
  id: z.number().int(),
  record_name: z.string().min(1),
  record_id: z.number().int().positive(),
  workflow_instance_id: z.string().min(1),
  status: WorkflowStatusSchema,
  stage: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  error: z.string().nullable(),
  started_at: z.number().int().nullable(),
  completed_at: z.number().int().nullable(),
  failed_at: z.number().int().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

export type WorkflowRow = z.infer<typeof WorkflowRowSchema>

export const WorkflowSchema = WorkflowRecordSchema.extend({
  id: z.number().int(),
  workflowInstanceId: z.string().min(1),
  status: WorkflowStatusSchema,
  stage: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  error: z.string().nullable(),
  startedAt: z.number().int().nullable(),
  completedAt: z.number().int().nullable(),
  failedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type Workflow = z.infer<typeof WorkflowSchema>

export function workflowFromRow(row: WorkflowRow): Workflow {
  return WorkflowSchema.parse({
    id: row.id,
    recordName: row.record_name,
    recordId: row.record_id,
    workflowInstanceId: row.workflow_instance_id,
    status: row.status,
    stage: row.stage,
    attempt: row.attempt,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}
