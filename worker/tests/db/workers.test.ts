import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { createBooking } from "@worker/src/db/bookings"
import { createWorkerTimeOff } from "@worker/src/db/timeoff"
import {
  createWorker,
  deleteWorker,
  getOrCreateFullTimeWorker,
  getOrCreateFullTimeWeeklySchedule,
  getOrCreateWeeklySchedule,
  getWeeklyScheduleByName,
  getWorkerById,
  getWorkerByName,
  WorkerDeleteError,
} from "@worker/src/db/workers"

describe("workers", () => {
  const db = env.DB

  test("enforces unique worker names and getOrCreateFullTimeWorker reuses them", async () => {
    const first = await getOrCreateFullTimeWorker(db, "Alice")
    expect(first.name).toBe("Alice")
    expect(first.schedule.name).toBe("full-time")

    const again = await getOrCreateFullTimeWorker(db, "Alice")
    expect(again).toEqual(first)

    expect(await getWorkerByName(db, "Alice")).toEqual(first)
    expect(await getWorkerByName(db, "missing")).toBeNull()

    const schedule = await getOrCreateFullTimeWeeklySchedule(db)
    await expect(
      createWorker(db, {
        name: "Alice",
        weeklyScheduleId: schedule.id,
      }),
    ).rejects.toThrow()
  })

  test("getOrCreateWeeklySchedule reuses schedules by name", async () => {
    const input = {
      name: "weekends",
      weekdays: [0, 6],
      startTime: { hour: 8, minute: 0 },
      endTime: { hour: 16, minute: 0 },
    }

    const created = await getOrCreateWeeklySchedule(db, input)
    expect(created.weekdays).toEqual([0, 6])

    const again = await getOrCreateWeeklySchedule(db, input)
    expect(again).toEqual(created)

    expect(await getWeeklyScheduleByName(db, "weekends")).toEqual(created)
    expect(await getWeeklyScheduleByName(db, "missing-schedule")).toBeNull()
  })

  test("deletes a worker, linked auth user, and time off", async () => {
    const schedule = await getOrCreateFullTimeWeeklySchedule(db)
    const worker = await createWorker(db, {
      name: "Delete me",
      weeklyScheduleId: schedule.id,
    })
    await createWorkerTimeOff(db, {
      workerId: worker.id,
      date: "2026-07-31",
    })
    const authUserId = "worker-delete-test-user"
    await db
      .prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
      )
      .bind(authUserId, worker.name, "delete-me@example.com")
      .run()
    await db
      .prepare("UPDATE workers SET better_auth_user_id = ? WHERE id = ?")
      .bind(authUserId, worker.id)
      .run()

    const linkedWorker = await getWorkerById(db, worker.id)
    const deleted = await deleteWorker(db, worker.id)
    expect(deleted).toEqual(linkedWorker)
    expect(await getWorkerById(db, worker.id)).toBeNull()
    expect(
      await db
        .prepare('SELECT id FROM "user" WHERE id = ?')
        .bind(authUserId)
        .first(),
    ).toBeNull()
    expect(
      await db
        .prepare("SELECT id FROM worker_timeoff WHERE worker_id = ?")
        .bind(worker.id)
        .first(),
    ).toBeNull()
  })

  test("deleteWorker rejects workers with active bookings", async () => {
    const schedule = await getOrCreateFullTimeWeeklySchedule(db)
    const worker = await createWorker(db, {
      name: "Booked worker",
      weeklyScheduleId: schedule.id,
    })
    await createBooking(db, {
      workerIds: [worker.id],
      startDatetime: new Date("2026-09-01T14:00:00.000Z"),
      endDatetime: new Date("2026-09-01T15:00:00.000Z"),
      description: "Active booking",
    })

    await expect(deleteWorker(db, worker.id)).rejects.toBeInstanceOf(
      WorkerDeleteError,
    )
    expect(await getWorkerById(db, worker.id)).toEqual(worker)
  })

  test("deleteWorker returns null for missing workers", async () => {
    expect(await deleteWorker(db, 999999)).toBeNull()
  })
})
