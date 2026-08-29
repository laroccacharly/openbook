import type { D1Database } from "@cloudflare/workers-types"
import {
  type CreateWorkerTimeOffBodyInput,
  type WorkerTimeOff,
  type WorkerTimeOffCreateInput,
  type WorkerTimeOffRow,
  type WorkerTimeOffUpdate,
  WorkerTimeOffCreateSchema,
  WorkerTimeOffRowSchema,
  WorkerTimeOffUpdateSchema,
  normalizeTimeOffBody,
  normalizeTimeOffCreate,
  timeOffFromRow,
} from "../types/timeoff"

function parseTimeOffRow(row: unknown): WorkerTimeOff {
  return timeOffFromRow(WorkerTimeOffRowSchema.parse(row))
}

export async function createWorkerTimeOff(
  db: D1Database,
  input: WorkerTimeOffCreateInput,
): Promise<WorkerTimeOff> {
  const normalized = normalizeTimeOffCreate(
    WorkerTimeOffCreateSchema.parse(input),
  )
  const result = await db
    .prepare(
      `INSERT INTO worker_timeoff (worker_id, start_time, end_time)
       VALUES (?, ?, ?)
       RETURNING *`,
    )
    .bind(
      normalized.workerId,
      Math.floor(normalized.startDatetime.getTime() / 1000),
      Math.floor(normalized.endDatetime.getTime() / 1000),
    )
    .first()

  if (result === null) {
    throw new Error("Failed to create worker timeoff")
  }
  return parseTimeOffRow(result)
}

/**
 * Creates time off only when the worker has no overlapping window.
 * Returns the existing row when already blocked (idempotent).
 */
export async function createWorkerTimeOffIfAvailable(
  db: D1Database,
  workerId: number,
  body: CreateWorkerTimeOffBodyInput,
): Promise<{ timeOff: WorkerTimeOff; created: boolean }> {
  const range = normalizeTimeOffBody(body)
  const overlapping = await getWorkerTimeOffsOverlapping(
    db,
    range.startDatetime,
    range.endDatetime,
  )
  const existing = overlapping.find((entry) => entry.workerId === workerId)
  if (existing !== undefined) {
    return { timeOff: existing, created: false }
  }

  const timeOff = await createWorkerTimeOff(db, {
    workerId,
    startDatetime: range.startDatetime,
    endDatetime: range.endDatetime,
  })
  return { timeOff, created: true }
}

export async function getWorkerTimeOffById(
  db: D1Database,
  timeOffId: number,
): Promise<WorkerTimeOff | null> {
  const result = await db
    .prepare(`SELECT * FROM worker_timeoff WHERE id = ?`)
    .bind(timeOffId)
    .first()
  if (result === null) {
    return null
  }
  return parseTimeOffRow(result)
}

export async function getWorkerTimeOffsByWorkerId(
  db: D1Database,
  workerId: number,
): Promise<WorkerTimeOff[]> {
  const result = await db
    .prepare(
      `SELECT * FROM worker_timeoff
       WHERE worker_id = ?
       ORDER BY start_time ASC, id ASC`,
    )
    .bind(workerId)
    .all<WorkerTimeOffRow>()
  return result.results.map(parseTimeOffRow)
}

export async function getWorkerTimeOffsOverlapping(
  db: D1Database,
  startDatetime: Date,
  endDatetime: Date,
): Promise<WorkerTimeOff[]> {
  const start = Math.floor(startDatetime.getTime() / 1000)
  const end = Math.floor(endDatetime.getTime() / 1000)
  const result = await db
    .prepare(
      `SELECT * FROM worker_timeoff
       WHERE start_time < ? AND end_time > ?
       ORDER BY start_time ASC, id ASC`,
    )
    .bind(end, start)
    .all<WorkerTimeOffRow>()
  return result.results.map(parseTimeOffRow)
}

export async function updateWorkerTimeOff(
  db: D1Database,
  input: WorkerTimeOffUpdate,
): Promise<WorkerTimeOff | null> {
  const timeOff = WorkerTimeOffUpdateSchema.parse(input)
  const existing = await getWorkerTimeOffById(db, timeOff.id)
  if (existing === null) {
    return null
  }

  await db
    .prepare(
      `UPDATE worker_timeoff SET
         worker_id = ?, start_time = ?, end_time = ?
       WHERE id = ?`,
    )
    .bind(
      timeOff.workerId,
      Math.floor(timeOff.startDatetime.getTime() / 1000),
      Math.floor(timeOff.endDatetime.getTime() / 1000),
      timeOff.id,
    )
    .run()

  return getWorkerTimeOffById(db, timeOff.id)
}

export async function deleteWorkerTimeOff(
  db: D1Database,
  timeOffId: number,
): Promise<boolean> {
  const existing = await getWorkerTimeOffById(db, timeOffId)
  if (existing === null) {
    return false
  }
  await db
    .prepare(`DELETE FROM worker_timeoff WHERE id = ?`)
    .bind(timeOffId)
    .run()
  return true
}
