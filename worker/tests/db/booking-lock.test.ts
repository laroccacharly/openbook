import { env } from "cloudflare:workers"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  BookingLockTimeoutError,
  releaseBookingLock,
  tryAcquireBookingLock,
  withBookingLock,
} from "@worker/src/db/booking-lock"
import {
  BookingLockLostError,
  createBookingWithLock,
} from "@worker/src/db/bookings"

describe("booking lock", () => {
  const db = env.DB

  afterEach(() => {
    vi.useRealTimers()
  })

  test("acquires exclusively, releases by owner, and increments the fencing token", async () => {
    const first = await tryAcquireBookingLock(db, {
      owner: "first",
      nowMs: 1_000,
      leaseDurationMs: 500,
    })
    expect(first).toEqual({
      owner: "first",
      expiresAtMs: 1_500,
      fencingToken: 1,
    })

    expect(
      await tryAcquireBookingLock(db, {
        owner: "second",
        nowMs: 1_100,
        leaseDurationMs: 500,
      }),
    ).toBeNull()
    expect(
      await releaseBookingLock(db, {
        owner: "not-the-owner",
        expiresAtMs: 1_500,
        fencingToken: 1,
      }),
    ).toBe(false)
    expect(await releaseBookingLock(db, first!)).toBe(true)

    const second = await tryAcquireBookingLock(db, {
      owner: "second",
      nowMs: 1_100,
      leaseDurationMs: 500,
    })
    expect(second?.fencingToken).toBe(2)
  })

  test("allows an expired lease to be replaced and fences out its former owner", async () => {
    const expired = await tryAcquireBookingLock(db, {
      owner: "expired",
      nowMs: 1_000,
      leaseDurationMs: 100,
    })
    const current = await tryAcquireBookingLock(db, {
      owner: "current",
      nowMs: 1_100,
      leaseDurationMs: 100,
    })

    expect(current?.fencingToken).toBe(2)
    expect(await releaseBookingLock(db, expired!)).toBe(false)
    await expect(
      createBookingWithLock(
        db,
        {
          workerIds: [1],
          startDatetime: new Date("2026-07-13T09:00:00.000Z"),
          endDatetime: new Date("2026-07-13T10:00:00.000Z"),
        },
        expired!,
        1_100,
      ),
    ).rejects.toBeInstanceOf(BookingLockLostError)
  })

  test("waits for an expired lock and then runs with the default clock and sleeper", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    await tryAcquireBookingLock(db, {
      owner: "holder",
      nowMs: Date.now(),
      leaseDurationMs: 100,
    })

    const acquired = withBookingLock(db, async (lease) => lease, {
      leaseDurationMs: 100,
      acquireTimeoutMs: 200,
      retryDelayMs: 25,
    })
    await vi.advanceTimersByTimeAsync(100)

    await expect(acquired).resolves.toMatchObject({
      fencingToken: 2,
      expiresAtMs: 1_200,
    })
  })

  test("times out after bounded retries", async () => {
    await tryAcquireBookingLock(db, {
      owner: "holder",
      nowMs: 1_000,
      leaseDurationMs: 1_000,
    })
    let nowMs = 1_000
    const sleeps: number[] = []

    await expect(
      withBookingLock(
        db,
        async () => {
          throw new Error("callback should not run")
        },
        {
          owner: "waiter",
          now: () => nowMs,
          sleep: async (durationMs) => {
            sleeps.push(durationMs)
            nowMs += durationMs
          },
          leaseDurationMs: 100,
          acquireTimeoutMs: 50,
          retryDelayMs: 20,
        },
      ),
    ).rejects.toBeInstanceOf(BookingLockTimeoutError)
    expect(sleeps).toEqual([20, 20, 10])
  })

  test("releases the lease when the protected callback throws", async () => {
    const failure = new Error("booking failed")
    await expect(
      withBookingLock(
        db,
        async () => {
          throw failure
        },
        {
          owner: "failing-owner",
          now: () => 1_000,
          sleep: async () => {},
          leaseDurationMs: 100,
          acquireTimeoutMs: 100,
          retryDelayMs: 10,
        },
      ),
    ).rejects.toBe(failure)

    const next = await tryAcquireBookingLock(db, {
      owner: "next-owner",
      nowMs: 1_000,
      leaseDurationMs: 100,
    })
    expect(next).not.toBeNull()
  })
})
