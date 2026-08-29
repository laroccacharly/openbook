import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, test } from "vitest"
import {
  cancelBooking,
  createBooking,
  deleteBooking,
} from "@worker/src/db/bookings"
import { patchConfiguration } from "@worker/src/db/configuration"
import { createHoliday } from "@worker/src/db/holidays"
import { createWorkerTimeOff } from "@worker/src/db/timeoff"
import {
  createWeeklySchedule,
  createWorker,
  getOrCreateFullTimeWeeklySchedule,
} from "@worker/src/db/workers"
import {
  findAvailableWorkersForSlot,
  findFirstAvailablePreference,
  findFirstAvailableSlotOnDate,
  findFirstAvailablePreferredSlot,
  findNextAvailableSlot,
} from "@worker/src/scheduler"
import { fixedClock } from "@worker/src/time"
import type { WeeklySchedule } from "@worker/src/types/weekly-schedule"

describe("findAvailableWorkersForSlot", () => {
  const friday10am = new Date("2026-07-31T10:00:00.000Z")
  const options = {
    db: env.DB,
    clock: fixedClock(new Date("2026-07-28T12:00:00.000Z")),
  }
  let weeklySchedule: WeeklySchedule

  beforeEach(async () => {
    await patchConfiguration(env.DB, { timezone: "UTC" })
    weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
  })

  test("returns null when there are no workers", async () => {
    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: friday10am,
      }),
    ).toBeNull()
  })

  test("returns null when the only worker has Friday off", async () => {
    const worker = await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createWorkerTimeOff(env.DB, {
      workerId: worker.id,
      date: "2026-07-31",
    })

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: friday10am,
      }),
    ).toBeNull()
  })

  test("returns the available worker when another has Friday off", async () => {
    const worker1 = await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    const worker2 = await createWorker(env.DB, {
      name: "Worker 2",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createWorkerTimeOff(env.DB, {
      workerId: worker1.id,
      date: "2026-07-31",
    })

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: friday10am,
      }),
    ).toEqual([worker2.id])
  })

  test("returns the full-time worker when the other is part-time Mon–Wed", async () => {
    const worker1 = await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    const partTime = await createWeeklySchedule(env.DB, {
      name: "Part Time",
      weekdays: [1, 2, 3],
      startTime: { hour: 9, minute: 0 },
      endTime: { hour: 17, minute: 0 },
    })
    await createWorker(env.DB, {
      name: "Worker 2",
      weeklyScheduleId: partTime.id,
    })

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: friday10am,
      }),
    ).toEqual([worker1.id])
  })

  test("excludes actively booked workers but not cancelled or deleted bookings", async () => {
    const activeWorker = await createWorker(env.DB, {
      name: "Active booking",
      weeklyScheduleId: weeklySchedule.id,
    })
    const cancelledWorker = await createWorker(env.DB, {
      name: "Cancelled booking",
      weeklyScheduleId: weeklySchedule.id,
    })
    const deletedWorker = await createWorker(env.DB, {
      name: "Deleted booking",
      weeklyScheduleId: weeklySchedule.id,
    })
    const bookingWindow = {
      startDatetime: friday10am,
      endDatetime: new Date("2026-07-31T11:00:00.000Z"),
    }

    await createBooking(env.DB, {
      workerIds: [activeWorker.id],
      ...bookingWindow,
    })
    const cancelled = await createBooking(env.DB, {
      workerIds: [cancelledWorker.id],
      ...bookingWindow,
    })
    const deleted = await createBooking(env.DB, {
      workerIds: [deletedWorker.id],
      ...bookingWindow,
    })
    await cancelBooking(env.DB, cancelled.id)
    await deleteBooking(env.DB, deleted.id)

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 2,
        startDatetime: friday10am,
      }),
    ).toEqual([cancelledWorker.id, deletedWorker.id])
  })

  test.each([
    {
      name: "starts before and ends during the booking",
      startDatetime: new Date("2026-07-31T09:30:00.000Z"),
    },
    {
      name: "starts during and ends after the booking",
      startDatetime: new Date("2026-07-31T10:30:00.000Z"),
    },
  ])(
    "excludes a worker when the requested slot $name",
    async ({ startDatetime }) => {
      const worker = await createWorker(env.DB, {
        name: "Partially occupied",
        weeklyScheduleId: weeklySchedule.id,
      })
      await createBooking(env.DB, {
        workerIds: [worker.id],
        startDatetime: friday10am,
        endDatetime: new Date("2026-07-31T11:00:00.000Z"),
      })

      expect(
        await findAvailableWorkersForSlot(options, {
          durationMinutes: 60,
          workerCount: 1,
          startDatetime,
        }),
      ).toBeNull()
    },
  )

  test.each([
    {
      name: "ends when the booking starts",
      startDatetime: new Date("2026-07-31T09:00:00.000Z"),
    },
    {
      name: "starts when the booking ends",
      startDatetime: new Date("2026-07-31T11:00:00.000Z"),
    },
  ])("allows a back-to-back slot that $name", async ({ startDatetime }) => {
    const worker = await createWorker(env.DB, {
      name: "Back-to-back",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createBooking(env.DB, {
      workerIds: [worker.id],
      startDatetime: friday10am,
      endDatetime: new Date("2026-07-31T11:00:00.000Z"),
    })

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime,
      }),
    ).toEqual([worker.id])
  })

  test("excludes every worker assigned to a multi-worker booking", async () => {
    const bookedWorker1 = await createWorker(env.DB, {
      name: "Booked worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    const bookedWorker2 = await createWorker(env.DB, {
      name: "Booked worker 2",
      weeklyScheduleId: weeklySchedule.id,
    })
    const availableWorker = await createWorker(env.DB, {
      name: "Available worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createBooking(env.DB, {
      workerIds: [bookedWorker1.id, bookedWorker2.id],
      startDatetime: friday10am,
      endDatetime: new Date("2026-07-31T11:00:00.000Z"),
    })

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: friday10am,
      }),
    ).toEqual([availableWorker.id])
  })

  test("applies the global booking buffer after an existing booking", async () => {
    await patchConfiguration(env.DB, { bookingBufferMinutes: 30 })
    const worker = await createWorker(env.DB, {
      name: "Buffered worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createBooking(env.DB, {
      workerIds: [worker.id],
      startDatetime: new Date("2026-07-31T09:00:00.000Z"),
      endDatetime: friday10am,
    })

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: friday10am,
      }),
    ).toBeNull()
    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: new Date("2026-07-31T10:30:00.000Z"),
      }),
    ).toEqual([worker.id])
  })

  test("rejects past and disallowed same-day slots in the shared core", async () => {
    const worker = await createWorker(env.DB, {
      name: "Policy worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, { allowSameDayBookings: false })

    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: new Date("2026-07-27T10:00:00.000Z"),
      }),
    ).toBeNull()
    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: new Date("2026-07-28T13:00:00.000Z"),
      }),
    ).toBeNull()

    await patchConfiguration(env.DB, { allowSameDayBookings: true })
    expect(
      await findAvailableWorkersForSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        startDatetime: new Date("2026-07-28T13:00:00.000Z"),
      }),
    ).toEqual([worker.id])
  })
})

describe("findFirstAvailablePreferredSlot", () => {
  let weeklySchedule: WeeklySchedule

  beforeEach(async () => {
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
  })

  test("skips past and same-day slots, then returns the first available preference", async () => {
    const worker = await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    // Monday 2026-07-13 12:00 UTC — same calendar day as the second preferred slot
    const options = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T12:00:00.000Z")),
    }

    const availableSlot = await findFirstAvailablePreferredSlot(options, {
      durationMinutes: 60,
      workerCount: 1,
      preferredSlots: [
        { date: "2026-07-10", time: "10:00" }, // past
        { date: "2026-07-13", time: "15:00" }, // same day, disallowed
        { date: "2026-07-14", time: "10:00" }, // Tuesday, available
      ],
    })

    expect(availableSlot).toEqual({
      startDatetime: new Date("2026-07-14T10:00:00.000Z"),
      endDatetime: new Date("2026-07-14T11:00:00.000Z"),
      workerIds: [worker.id],
    })
  })

  test.each([
    {
      allowSameDayBookings: true,
      expectedDate: "2026-07-13",
    },
    {
      allowSameDayBookings: false,
      expectedDate: "2026-07-14",
    },
  ])(
    "uses the database allowSameDayBookings=$allowSameDayBookings setting for preferred slots",
    async ({ allowSameDayBookings, expectedDate }) => {
      const worker = await createWorker(env.DB, {
        name: "Worker 1",
        weeklyScheduleId: weeklySchedule.id,
      })
      await patchConfiguration(env.DB, { allowSameDayBookings })
      const options = {
        db: env.DB,
        clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
      }

      expect(
        await findFirstAvailablePreferredSlot(options, {
          durationMinutes: 60,
          workerCount: 1,
          preferredSlots: [
            { date: "2026-07-13", time: "10:00" },
            { date: "2026-07-14", time: "10:00" },
          ],
        }),
      ).toEqual({
        startDatetime: new Date(`${expectedDate}T10:00:00.000Z`),
        endDatetime: new Date(`${expectedDate}T11:00:00.000Z`),
        workerIds: [worker.id],
      })
    },
  )

  test("returns null when no preferred slot has enough workers", async () => {
    await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    const options = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T12:00:00.000Z")),
    }

    expect(
      await findFirstAvailablePreferredSlot(options, {
        durationMinutes: 60,
        workerCount: 2,
        preferredSlots: [{ date: "2026-07-14", time: "10:00" }],
      }),
    ).toBeNull()
  })

  test("rejects preferred slots outside the configured horizon", async () => {
    await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, { horizonDays: 1 })
    const options = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T12:00:00.000Z")),
    }

    expect(
      await findFirstAvailablePreferredSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        preferredSlots: [{ date: "2026-07-15", time: "10:00" }],
      }),
    ).toBeNull()
  })

  test("skips a booked preference and returns the next preferred slot", async () => {
    const worker = await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createBooking(env.DB, {
      workerIds: [worker.id],
      startDatetime: new Date("2026-07-14T10:00:00.000Z"),
      endDatetime: new Date("2026-07-14T11:00:00.000Z"),
    })
    const options = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T12:00:00.000Z")),
    }

    expect(
      await findFirstAvailablePreferredSlot(options, {
        durationMinutes: 60,
        workerCount: 1,
        preferredSlots: [
          { date: "2026-07-14", time: "10:00" },
          { date: "2026-07-15", time: "10:00" },
        ],
      }),
    ).toEqual({
      startDatetime: new Date("2026-07-15T10:00:00.000Z"),
      endDatetime: new Date("2026-07-15T11:00:00.000Z"),
      workerIds: [worker.id],
    })
  })
})

describe("findFirstAvailableSlotOnDate", () => {
  beforeEach(async () => {
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
  })

  test("returns the earliest available slot on the requested date", async () => {
    const laterSchedule = await createWeeklySchedule(env.DB, {
      name: "Later",
      weekdays: [1, 2, 3, 4, 5],
      startTime: { hour: 10, minute: 0 },
      endTime: { hour: 17, minute: 0 },
    })
    const earlierSchedule = await createWeeklySchedule(env.DB, {
      name: "Earlier",
      weekdays: [1, 2, 3, 4, 5],
      startTime: { hour: 9, minute: 0 },
      endTime: { hour: 17, minute: 0 },
    })
    await createWorker(env.DB, {
      name: "Later worker",
      weeklyScheduleId: laterSchedule.id,
    })
    const earlierWorker = await createWorker(env.DB, {
      name: "Earlier worker",
      weeklyScheduleId: earlierSchedule.id,
    })

    expect(
      await findFirstAvailableSlotOnDate(
        {
          db: env.DB,
          clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
        },
        {
          date: "2026-07-14",
          durationMinutes: 60,
          workerCount: 1,
        },
      ),
    ).toEqual({
      startDatetime: new Date("2026-07-14T09:00:00.000Z"),
      endDatetime: new Date("2026-07-14T10:00:00.000Z"),
      workerIds: [earlierWorker.id],
    })
  })

  test("resumes after a booking and its configured buffer", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Buffered worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, { bookingBufferMinutes: 30 })
    await createBooking(env.DB, {
      workerIds: [worker.id],
      startDatetime: new Date("2026-07-14T09:00:00.000Z"),
      endDatetime: new Date("2026-07-14T10:00:00.000Z"),
    })

    expect(
      await findFirstAvailableSlotOnDate(
        {
          db: env.DB,
          clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
        },
        {
          date: "2026-07-14",
          durationMinutes: 60,
          workerCount: 1,
        },
      ),
    ).toEqual({
      startDatetime: new Date("2026-07-14T10:30:00.000Z"),
      endDatetime: new Date("2026-07-14T11:30:00.000Z"),
      workerIds: [worker.id],
    })
  })

  test("waits until the required workers are simultaneously available", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker1 = await createWorker(env.DB, {
      name: "Worker 1",
      weeklyScheduleId: weeklySchedule.id,
    })
    const worker2 = await createWorker(env.DB, {
      name: "Worker 2",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createWorkerTimeOff(env.DB, {
      workerId: worker2.id,
      startDatetime: new Date("2026-07-14T09:00:00.000Z"),
      endDatetime: new Date("2026-07-14T12:00:00.000Z"),
    })

    expect(
      await findFirstAvailableSlotOnDate(
        {
          db: env.DB,
          clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
        },
        {
          date: "2026-07-14",
          durationMinutes: 60,
          workerCount: 2,
        },
      ),
    ).toEqual({
      startDatetime: new Date("2026-07-14T12:00:00.000Z"),
      endDatetime: new Date("2026-07-14T13:00:00.000Z"),
      workerIds: [worker1.id, worker2.id],
    })
  })

  test("does not roll an unavailable requested date into another day", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    await createWorker(env.DB, {
      name: "Worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createHoliday(env.DB, { date: "2026-07-14" })

    expect(
      await findFirstAvailableSlotOnDate(
        {
          db: env.DB,
          clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
        },
        {
          date: "2026-07-14",
          durationMinutes: 60,
          workerCount: 1,
        },
      ),
    ).toBeNull()
  })

  test("rejects disallowed same-day dates and dates outside the horizon", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    await createWorker(env.DB, {
      name: "Worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, { horizonDays: 1 })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    await expect(
      findFirstAvailableSlotOnDate(context, {
        date: "2026-07-13",
        durationMinutes: 60,
        workerCount: 1,
      }),
    ).resolves.toBeNull()
    await expect(
      findFirstAvailableSlotOnDate(context, {
        date: "2026-07-15",
        durationMinutes: 60,
        workerCount: 1,
      }),
    ).resolves.toBeNull()
  })
})

describe("findFirstAvailablePreference", () => {
  beforeEach(async () => {
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
  })

  test("resolves exact and date-only preferences in customer order", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createBooking(env.DB, {
      workerIds: [worker.id],
      startDatetime: new Date("2026-07-14T09:00:00.000Z"),
      endDatetime: new Date("2026-07-14T10:00:00.000Z"),
    })

    expect(
      await findFirstAvailablePreference(
        {
          db: env.DB,
          clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
        },
        {
          durationMinutes: 60,
          workerCount: 1,
          preferences: [
            { date: "2026-07-14", time: "09:00" },
            { date: "2026-07-14", time: null },
            { date: "2026-07-15", time: "13:00" },
          ],
        },
      ),
    ).toEqual({
      basis: "first_on_date",
      slot: {
        startDatetime: new Date("2026-07-14T10:00:00.000Z"),
        endDatetime: new Date("2026-07-14T11:00:00.000Z"),
        workerIds: [worker.id],
      },
    })
  })

  test("continues to a later exact preference when a date has no availability", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createHoliday(env.DB, { date: "2026-07-14" })

    expect(
      await findFirstAvailablePreference(
        {
          db: env.DB,
          clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
        },
        {
          durationMinutes: 60,
          workerCount: 1,
          preferences: [
            { date: "2026-07-14", time: null },
            { date: "2026-07-15", time: "13:00" },
          ],
        },
      ),
    ).toEqual({
      basis: "exact_time",
      slot: {
        startDatetime: new Date("2026-07-15T13:00:00.000Z"),
        endDatetime: new Date("2026-07-15T14:00:00.000Z"),
        workerIds: [worker.id],
      },
    })
  })

  test("returns null when none of the preferences are available", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    await createWorker(env.DB, {
      name: "Worker",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createHoliday(env.DB, { date: "2026-07-14" })

    await expect(
      findFirstAvailablePreference(
        {
          db: env.DB,
          clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
        },
        {
          durationMinutes: 60,
          workerCount: 1,
          preferences: [{ date: "2026-07-14", time: null }],
        },
      ),
    ).resolves.toBeNull()
  })
})

describe("findNextAvailableSlot", () => {
  test('returns "Not enough workers" when there are no workers', async () => {
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: false,
      message: "Not enough workers (0 of 1)",
    })
  })

  test('returns "Not enough workers" when the requested worker count exceeds the pool', async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(
      await findNextAvailableSlot(context, {
        workerCount: 2,
      }),
    ).toEqual({
      success: false,
      message: "Not enough workers (1 of 2)",
    })
  })

  test("returns the earliest start across different worker schedules", async () => {
    const laterSchedule = await createWeeklySchedule(env.DB, {
      name: "Later",
      weekdays: [1, 2, 3, 4, 5],
      startTime: { hour: 10, minute: 0 },
      endTime: { hour: 17, minute: 0 },
    })
    const earlierSchedule = await createWeeklySchedule(env.DB, {
      name: "Earlier",
      weekdays: [1, 2, 3, 4, 5],
      startTime: { hour: 9, minute: 0 },
      endTime: { hour: 17, minute: 0 },
    })
    await createWorker(env.DB, {
      name: "Later worker",
      weeklyScheduleId: laterSchedule.id,
    })
    const earlierWorker = await createWorker(env.DB, {
      name: "Earlier worker",
      weeklyScheduleId: earlierSchedule.id,
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: true,
      startDatetime: new Date("2026-07-14T09:00:00.000Z"),
      endDatetime: new Date("2026-07-14T10:00:00.000Z"),
      workerIds: [earlierWorker.id],
    })
  })

  test.each([
    {
      allowSameDayBookings: true,
      expectedDate: "2026-07-13",
    },
    {
      allowSameDayBookings: false,
      expectedDate: "2026-07-14",
    },
  ])(
    "uses the database allowSameDayBookings=$allowSameDayBookings setting for the next available slot",
    async ({ allowSameDayBookings, expectedDate }) => {
      const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
      const worker = await createWorker(env.DB, {
        name: "Alice",
        weeklyScheduleId: weeklySchedule.id,
      })
      await patchConfiguration(env.DB, {
        timezone: "UTC",
        allowSameDayBookings,
      })
      const context = {
        db: env.DB,
        clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
      }

      expect(await findNextAvailableSlot(context)).toEqual({
        success: true,
        startDatetime: new Date(`${expectedDate}T09:00:00.000Z`),
        endDatetime: new Date(`${expectedDate}T10:00:00.000Z`),
        workerIds: [worker.id],
      })
    },
  )

  test("resumes later the same day after partial-day time off", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createWorkerTimeOff(env.DB, {
      workerId: worker.id,
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T12:00:00.000Z"),
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: true,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: true,
      startDatetime: new Date("2026-07-13T12:00:00.000Z"),
      endDatetime: new Date("2026-07-13T13:00:00.000Z"),
      workerIds: [worker.id],
    })
  })

  test("waits until two workers are simultaneously available", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker1 = await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    const worker2 = await createWorker(env.DB, {
      name: "Bob",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createWorkerTimeOff(env.DB, {
      workerId: worker2.id,
      startDatetime: new Date("2026-07-13T09:00:00.000Z"),
      endDatetime: new Date("2026-07-13T12:00:00.000Z"),
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: true,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context, { workerCount: 2 })).toEqual({
      success: true,
      startDatetime: new Date("2026-07-13T12:00:00.000Z"),
      endDatetime: new Date("2026-07-13T13:00:00.000Z"),
      workerIds: [worker1.id, worker2.id],
    })
  })

  test("moves to the next working day when same-day bookings are enabled after hours", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: true,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T17:30:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: true,
      startDatetime: new Date("2026-07-14T09:00:00.000Z"),
      endDatetime: new Date("2026-07-14T10:00:00.000Z"),
      workerIds: [worker.id],
    })
  })

  test("rolls a Friday request forward to Monday", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-17T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: true,
      startDatetime: new Date("2026-07-20T09:00:00.000Z"),
      endDatetime: new Date("2026-07-20T10:00:00.000Z"),
      workerIds: [worker.id],
    })
  })

  test("skips a holiday and returns the next available day", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createHoliday(env.DB, { date: "2026-07-14" })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: true,
      startDatetime: new Date("2026-07-15T09:00:00.000Z"),
      endDatetime: new Date("2026-07-15T10:00:00.000Z"),
      workerIds: [worker.id],
    })
  })

  test("returns no availability when the duration exceeds the workday", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(
      await findNextAvailableSlot(context, { durationMinutes: 10 * 60 }),
    ).toEqual({
      success: false,
      message: "No available slot found",
    })
  })

  test("uses the configured search horizon", async () => {
    const wednesdayOnly = await createWeeklySchedule(env.DB, {
      name: "Wednesday only",
      weekdays: [3],
      startTime: { hour: 9, minute: 0 },
      endTime: { hour: 17, minute: 0 },
    })
    const worker = await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: wednesdayOnly.id,
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
      horizonDays: 1,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: false,
      message: "No available slot found",
    })

    await patchConfiguration(env.DB, { horizonDays: 2 })
    expect(await findNextAvailableSlot(context)).toEqual({
      success: true,
      startDatetime: new Date("2026-07-15T09:00:00.000Z"),
      endDatetime: new Date("2026-07-15T10:00:00.000Z"),
      workerIds: [worker.id],
    })
  })

  test("skips a slot when the worker is on time off", async () => {
    const weeklySchedule = await getOrCreateFullTimeWeeklySchedule(env.DB)
    const worker = await createWorker(env.DB, {
      name: "Alice",
      weeklyScheduleId: weeklySchedule.id,
    })
    await createWorkerTimeOff(env.DB, {
      workerId: worker.id,
      date: "2026-07-14",
    })
    await patchConfiguration(env.DB, {
      timezone: "UTC",
      allowSameDayBookings: false,
    })
    const context = {
      db: env.DB,
      clock: fixedClock(new Date("2026-07-13T08:00:00.000Z")),
    }

    expect(await findNextAvailableSlot(context)).toEqual({
      success: true,
      startDatetime: new Date("2026-07-15T09:00:00.000Z"),
      endDatetime: new Date("2026-07-15T10:00:00.000Z"),
      workerIds: [worker.id],
    })
  })
})
