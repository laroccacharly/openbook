import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, test } from "vitest"
import {
  createWorkerTimeOff,
  createWorkerTimeOffIfAvailable,
  deleteWorkerTimeOff,
  getWorkerTimeOffById,
  getWorkerTimeOffsByWorkerId,
  getWorkerTimeOffsOverlapping,
  updateWorkerTimeOff,
} from "@worker/src/db/timeoff"
import {
  getOrCreateFullTimeWeeklySchedule,
  createWorker,
} from "@worker/src/db/workers"
import type { Worker } from "@worker/src/types/worker"

describe("worker timeoff CRUD", () => {
  const db = env.DB
  let worker: Worker

  beforeEach(async () => {
    const schedule = await getOrCreateFullTimeWeeklySchedule(db)
    worker = await createWorker(db, {
      name: "Alice",
      weeklyScheduleId: schedule.id,
    })
  })

  test("creates a full-day window from a date and reads it back", async () => {
    const created = await createWorkerTimeOff(db, {
      workerId: worker.id,
      date: "2026-07-31",
    })

    expect(created.workerId).toBe(worker.id)
    expect(created.startDatetime).toEqual(new Date("2026-07-31T00:00:00.000Z"))
    expect(created.endDatetime).toEqual(new Date("2026-08-01T00:00:00.000Z"))
    expect(await getWorkerTimeOffById(db, created.id)).toEqual(created)
    expect(await getWorkerTimeOffsByWorkerId(db, worker.id)).toEqual([created])
  })

  test("creates an explicit datetime range", async () => {
    const created = await createWorkerTimeOff(db, {
      workerId: worker.id,
      startDatetime: new Date("2026-07-31T12:00:00.000Z"),
      endDatetime: new Date("2026-07-31T16:00:00.000Z"),
    })

    expect(created.startDatetime).toEqual(new Date("2026-07-31T12:00:00.000Z"))
    expect(created.endDatetime).toEqual(new Date("2026-07-31T16:00:00.000Z"))
  })

  test("returns null for missing ids", async () => {
    expect(await getWorkerTimeOffById(db, 999_999)).toBeNull()
  })

  test("finds overlapping timeoff windows", async () => {
    const created = await createWorkerTimeOff(db, {
      workerId: worker.id,
      date: "2026-07-31",
    })

    expect(
      await getWorkerTimeOffsOverlapping(
        db,
        new Date("2026-07-31T10:00:00.000Z"),
        new Date("2026-07-31T11:00:00.000Z"),
      ),
    ).toEqual([created])
    expect(
      await getWorkerTimeOffsOverlapping(
        db,
        new Date("2026-08-01T10:00:00.000Z"),
        new Date("2026-08-01T11:00:00.000Z"),
      ),
    ).toEqual([])
  })

  test("createWorkerTimeOffIfAvailable creates once then returns existing", async () => {
    const first = await createWorkerTimeOffIfAvailable(db, worker.id, {
      date: "2026-07-31",
    })
    expect(first.created).toBe(true)
    expect(first.timeOff.workerId).toBe(worker.id)

    const second = await createWorkerTimeOffIfAvailable(db, worker.id, {
      date: "2026-07-31",
    })
    expect(second.created).toBe(false)
    expect(second.timeOff).toEqual(first.timeOff)
  })

  test("updates and deletes timeoff", async () => {
    const created = await createWorkerTimeOff(db, {
      workerId: worker.id,
      date: "2026-07-31",
    })

    const updated = await updateWorkerTimeOff(db, {
      id: created.id,
      workerId: worker.id,
      startDatetime: new Date("2026-08-01T00:00:00.000Z"),
      endDatetime: new Date("2026-08-02T00:00:00.000Z"),
    })
    expect(updated).toEqual({
      ...created,
      startDatetime: new Date("2026-08-01T00:00:00.000Z"),
      endDatetime: new Date("2026-08-02T00:00:00.000Z"),
    })

    expect(
      await updateWorkerTimeOff(db, {
        id: 999_999,
        workerId: worker.id,
        startDatetime: new Date("2026-08-01T00:00:00.000Z"),
        endDatetime: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ).toBeNull()

    expect(await deleteWorkerTimeOff(db, created.id)).toBe(true)
    expect(await getWorkerTimeOffById(db, created.id)).toBeNull()
    expect(await deleteWorkerTimeOff(db, created.id)).toBe(false)
  })
})
