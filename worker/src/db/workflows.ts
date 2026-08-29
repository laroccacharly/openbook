import type { D1Database } from "@cloudflare/workers-types"
import {
  type Workflow,
  type WorkflowRecord,
  WorkflowRowSchema,
  workflowFromRow,
} from "../types/workflow"

export type WorkflowUpdate =
  | { status: "running"; stage?: string }
  | { status: "completed" }
  | { status: "failed"; error: string }
  | { stage: string }

function parseWorkflow(row: unknown): Workflow {
  return workflowFromRow(WorkflowRowSchema.parse(row))
}

export async function createWorkflow(
  db: D1Database,
  input: WorkflowRecord & { workflowInstanceId: string },
): Promise<Workflow> {
  const row = await db
    .prepare(
      `INSERT INTO workflows (
         record_name, record_id, workflow_instance_id, status, stage
       ) VALUES (?, ?, ?, 'queued', 'queued')
       ON CONFLICT(record_name, record_id) DO UPDATE SET
         record_name = record_name
       RETURNING *`,
    )
    .bind(input.recordName, input.recordId, input.workflowInstanceId)
    .first()
  if (row === null) {
    throw new Error("Failed to create workflow")
  }
  return parseWorkflow(row)
}

export async function getWorkflow(
  db: D1Database,
  record: WorkflowRecord,
): Promise<Workflow | null> {
  const row = await db
    .prepare(`SELECT * FROM workflows WHERE record_name = ? AND record_id = ?`)
    .bind(record.recordName, record.recordId)
    .first()
  return row === null ? null : parseWorkflow(row)
}

export async function getWorkflows(
  db: D1Database,
  recordName?: string,
): Promise<Workflow[]> {
  const statement =
    recordName === undefined
      ? db.prepare(`SELECT * FROM workflows ORDER BY created_at DESC, id DESC`)
      : db
          .prepare(
            `SELECT * FROM workflows
       WHERE record_name = ?
       ORDER BY created_at DESC, id DESC`,
          )
          .bind(recordName)
  const result = await statement.all()
  return result.results.map(parseWorkflow)
}

export async function updateWorkflow(
  db: D1Database,
  record: WorkflowRecord,
  update: WorkflowUpdate,
): Promise<Workflow> {
  let sql: string
  let values: (string | number | null)[]

  if ("status" in update) {
    switch (update.status) {
      case "running":
        sql = `UPDATE workflows SET
          status = 'running', stage = COALESCE(?, stage),
          attempt = attempt + 1,
          started_at = COALESCE(started_at, unixepoch()),
          completed_at = NULL, updated_at = unixepoch()`
        values = [update.stage ?? null]
        break
      case "completed":
        sql = `UPDATE workflows SET
          status = 'completed', stage = 'completed', error = NULL,
          failed_at = NULL, completed_at = unixepoch(),
          updated_at = unixepoch()`
        values = []
        break
      case "failed":
        sql = `UPDATE workflows SET
          status = 'failed', error = ?, failed_at = unixepoch(),
          updated_at = unixepoch()`
        values = [update.error]
        break
    }
  } else {
    sql = `UPDATE workflows SET stage = ?, updated_at = unixepoch()`
    values = [update.stage]
  }

  const row = await db
    .prepare(
      `${sql}
       WHERE record_name = ? AND record_id = ?
       RETURNING *`,
    )
    .bind(...values, record.recordName, record.recordId)
    .first()
  if (row === null) {
    throw new Error(
      `Workflow for ${record.recordName} record ${record.recordId} not found`,
    )
  }
  return parseWorkflow(row)
}
