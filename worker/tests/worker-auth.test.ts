import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { generateTemporaryPassword } from "@worker/src/auth/provision-worker-account"
import { createBooking, getBookingsByWorkerId } from "@worker/src/db/bookings"

describe("worker authentication helpers", () => {
  test("generates strong one-time temporary passwords", () => {
    const first = generateTemporaryPassword()
    const second = generateTemporaryPassword()
    expect(first).toHaveLength(24)
    expect(second).toHaveLength(24)
    expect(first).not.toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9!@#$%^&*]+$/)
    expect(() => generateTemporaryPassword(15)).toThrow(/at least 16/)
  })

  test("returns only active bookings assigned to the linked worker id", async () => {
    const assigned = await createBooking(env.DB, {
      workerIds: [7001],
      startDatetime: new Date("2026-09-01T14:00:00.000Z"),
      endDatetime: new Date("2026-09-01T15:00:00.000Z"),
      description: "Assigned worker booking",
    })
    await createBooking(env.DB, {
      workerIds: [7002],
      startDatetime: new Date("2026-09-01T16:00:00.000Z"),
      endDatetime: new Date("2026-09-01T17:00:00.000Z"),
      description: "Different worker booking",
    })

    const bookings = await getBookingsByWorkerId(env.DB, 7001)
    expect(bookings.map(({ id }) => id)).toContain(assigned.id)
    expect(bookings.every(({ workerIds }) => workerIds.includes(7001))).toBe(
      true,
    )
  })
})
