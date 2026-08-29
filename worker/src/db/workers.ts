import type { D1Database } from "@cloudflare/workers-types"
import { getBookingsByWorkerId } from "./bookings"
import { minutesToTime, timeToMinutes } from "../time"
import {
  type Worker,
  type WorkerCreate,
  type WorkerDetailsRow,
  WorkerCreateSchema,
  WorkerDetailsRowSchema,
  WorkerSchema,
} from "../types/worker"
import {
  type WeeklySchedule,
  type WeeklyScheduleCreate,
  WeeklyScheduleCreateSchema,
  WeeklyScheduleRowSchema,
  WeeklyScheduleSchema,
  weeklyScheduleFromRow,
} from "../types/weekly-schedule"

function workerFromDetailsRow(input: unknown): Worker {
  const row = WorkerDetailsRowSchema.parse(input)
  const weekdayFlags = [
    row.sunday,
    row.monday,
    row.tuesday,
    row.wednesday,
    row.thursday,
    row.friday,
    row.saturday,
  ]

  return WorkerSchema.parse({
    id: row.worker_id,
    name: row.worker_name,
    weeklyScheduleId: row.weekly_schedule_id,
    account: row.account_email === null ? null : { email: row.account_email },
    schedule: {
      id: row.weekly_schedule_id,
      name: row.schedule_name,
      weekdays: weekdayFlags.flatMap((enabled, weekday) =>
        enabled === 1 ? [weekday] : [],
      ),
      startTime: minutesToTime(row.start_minutes),
      endTime: minutesToTime(row.end_minutes),
    },
  })
}

const WORKER_DETAILS_SELECT = `SELECT
         workers.id AS worker_id,
         workers.name AS worker_name,
         weekly_schedules.id AS weekly_schedule_id,
         weekly_schedules.name AS schedule_name,
         weekly_schedules.monday,
         weekly_schedules.tuesday,
         weekly_schedules.wednesday,
         weekly_schedules.thursday,
         weekly_schedules.friday,
         weekly_schedules.saturday,
         weekly_schedules.sunday,
         weekly_schedules.start_minutes,
         weekly_schedules.end_minutes,
         auth_user.email AS account_email
       FROM workers
       JOIN weekly_schedules
         ON weekly_schedules.id = workers.weekly_schedule_id
       LEFT JOIN "user" auth_user
         ON auth_user.id = workers.better_auth_user_id`

export async function createWeeklySchedule(
  db: D1Database,
  input: WeeklyScheduleCreate,
): Promise<WeeklySchedule> {
  const schedule = WeeklyScheduleCreateSchema.parse(input)
  const enabled = new Set(schedule.weekdays)
  const scheduleRow = await db
    .prepare(
      `INSERT INTO weekly_schedules (
         name, monday, tuesday, wednesday, thursday,
         friday, saturday, sunday, start_minutes, end_minutes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      schedule.name,
      Number(enabled.has(1)),
      Number(enabled.has(2)),
      Number(enabled.has(3)),
      Number(enabled.has(4)),
      Number(enabled.has(5)),
      Number(enabled.has(6)),
      Number(enabled.has(0)),
      timeToMinutes(schedule.startTime),
      timeToMinutes(schedule.endTime),
    )
    .first<{ id: number }>()

  if (scheduleRow === null) {
    throw new Error("Failed to create weekly schedule")
  }

  return WeeklyScheduleSchema.parse({
    id: scheduleRow.id,
    ...schedule,
  })
}

export async function getWeeklyScheduleByName(
  db: D1Database,
  name: string,
): Promise<WeeklySchedule | null> {
  const existing = await db
    .prepare(
      `SELECT id, name, monday, tuesday, wednesday, thursday,
              friday, saturday, sunday, start_minutes, end_minutes
       FROM weekly_schedules
       WHERE name = ?
       ORDER BY id ASC
       LIMIT 1`,
    )
    .bind(name)
    .first()
  if (existing === null) {
    return null
  }
  return weeklyScheduleFromRow(WeeklyScheduleRowSchema.parse(existing))
}

export async function getOrCreateWeeklySchedule(
  db: D1Database,
  input: WeeklyScheduleCreate,
): Promise<WeeklySchedule> {
  const existing = await getWeeklyScheduleByName(db, input.name)
  if (existing !== null) {
    return existing
  }
  return createWeeklySchedule(db, input)
}

/** Mon–Fri 09:00–17:00. Reuses the schedule named "full-time" when present. */
export async function getOrCreateFullTimeWeeklySchedule(
  db: D1Database,
): Promise<WeeklySchedule> {
  const existing = await db
    .prepare(
      `SELECT id, name, monday, tuesday, wednesday, thursday,
              friday, saturday, sunday, start_minutes, end_minutes
       FROM weekly_schedules
       WHERE name = ?
       ORDER BY id ASC
       LIMIT 1`,
    )
    .bind("full-time")
    .first()

  if (existing !== null) {
    return weeklyScheduleFromRow(WeeklyScheduleRowSchema.parse(existing))
  }

  return createWeeklySchedule(db, {
    name: "full-time",
    weekdays: [1, 2, 3, 4, 5],
    startTime: { hour: 9, minute: 0 },
    endTime: { hour: 17, minute: 0 },
  })
}

export async function createWorker(
  db: D1Database,
  input: WorkerCreate,
): Promise<Worker> {
  const worker = WorkerCreateSchema.parse(input)
  const workerRow = await db
    .prepare(
      `INSERT INTO workers (name, weekly_schedule_id)
       VALUES (?, ?)
       RETURNING id`,
    )
    .bind(worker.name, worker.weeklyScheduleId)
    .first<{ id: number }>()

  if (workerRow === null) {
    throw new Error("Failed to create worker")
  }

  const created = await getWorkerById(db, workerRow.id)
  if (created === null) {
    throw new Error("Failed to load created worker")
  }
  return created
}

export async function getWorkerByName(
  db: D1Database,
  name: string,
): Promise<Worker | null> {
  const result = await db
    .prepare(`${WORKER_DETAILS_SELECT} WHERE workers.name = ?`)
    .bind(name)
    .first()
  if (result === null) {
    return null
  }
  return workerFromDetailsRow(result)
}

export async function getOrCreateFullTimeWorker(
  db: D1Database,
  name: string,
): Promise<Worker> {
  const existing = await getWorkerByName(db, name)
  if (existing !== null) {
    return existing
  }

  const schedule = await getOrCreateFullTimeWeeklySchedule(db)
  return createWorker(db, {
    name,
    weeklyScheduleId: schedule.id,
  })
}

export async function getWorkerById(
  db: D1Database,
  workerId: number,
): Promise<Worker | null> {
  const result = await db
    .prepare(`${WORKER_DETAILS_SELECT} WHERE workers.id = ?`)
    .bind(workerId)
    .first()
  if (result === null) {
    return null
  }
  return workerFromDetailsRow(result)
}

export async function getWorkers(db: D1Database): Promise<Worker[]> {
  const result = await db
    .prepare(`${WORKER_DETAILS_SELECT} ORDER BY workers.id ASC`)
    .all<WorkerDetailsRow>()

  return result.results.map(workerFromDetailsRow)
}

export class WorkerDeleteError extends Error {
  readonly code: "has_active_bookings"

  constructor(code: "has_active_bookings", message: string) {
    super(message)
    this.code = code
    this.name = "WorkerDeleteError"
  }
}

export async function deleteWorker(
  db: D1Database,
  workerId: number,
): Promise<Worker | null> {
  const worker = await getWorkerById(db, workerId)
  if (worker === null) {
    return null
  }

  const activeBookings = await getBookingsByWorkerId(db, workerId)
  if (activeBookings.length > 0) {
    throw new WorkerDeleteError(
      "has_active_bookings",
      "Worker has active bookings",
    )
  }

  await db
    .prepare("DELETE FROM worker_timeoff WHERE worker_id = ?")
    .bind(workerId)
    .run()

  const authUser = await db
    .prepare("SELECT better_auth_user_id FROM workers WHERE id = ?")
    .bind(workerId)
    .first<{ better_auth_user_id: string | null }>()
  if (authUser?.better_auth_user_id !== null && authUser !== null) {
    await db
      .prepare('DELETE FROM "user" WHERE id = ?')
      .bind(authUser.better_auth_user_id)
      .run()
  }

  const deleted = await db
    .prepare("DELETE FROM workers WHERE id = ?")
    .bind(workerId)
    .run()
  if (deleted.meta.changes !== 1) {
    throw new Error("Failed to delete worker")
  }

  return worker
}
