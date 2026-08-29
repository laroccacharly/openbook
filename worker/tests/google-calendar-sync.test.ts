import { env, exports } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { API_PREFIX } from "@infra/routes"
import { patchConfiguration } from "@worker/src/db/configuration"
import { createBooking, deleteBooking } from "@worker/src/db/bookings"
import {
  claimCreationRetry,
  claimDeletion,
  getEventByBookingId,
  insertPendingEvent,
  markDeleteFailed,
  markFailed,
  markSynchronized,
} from "@worker/src/db/google-calendar-events"
import {
  requestGoogleCalendarSync,
  retryGoogleCalendarDeletion,
  retryGoogleCalendarSync,
} from "@worker/src/google-calendar/google-calendar-sync"
import { TEST_BOOK_API_KEY } from "./fixtures/api-key"
import { testApiClient } from "./fixtures/api-client"

const credentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
}

const bookingInput = {
  workerIds: [7],
  startDatetime: new Date("2026-08-15T14:00:00.000Z"),
  endDatetime: new Date("2026-08-15T16:00:00.000Z"),
  description: "Deep clean",
}

async function connectGoogleCalendar() {
  await env.DB.prepare(
    `INSERT INTO google_calendar_connection (id, refresh_token, email)
     VALUES (1, 'refresh-token', 'owner@example.com')`,
  ).run()
}

function googleFetcher(
  options: { createStatus?: number; deleteStatus?: number } = {},
) {
  const requests: Request[] = []
  const fetcher: typeof fetch = async (fetchInput, init) => {
    const request = new Request(fetchInput, init)
    requests.push(request)
    if (request.url === "https://oauth2.googleapis.com/token") {
      return Response.json({ access_token: "access-token" })
    }
    if (request.method === "POST") {
      const status = options.createStatus ?? 200
      if (status !== 200) {
        return new Response("Google failure", { status })
      }
      return Response.json({ id: "google-event-123" })
    }
    return new Response(null, { status: options.deleteStatus ?? 204 })
  }
  return { requests, fetcher }
}

async function seedFailedAssociation(bookingId: number) {
  const record = await insertPendingEvent(env.DB, {
    bookingId,
    connectionId: 1,
    calendarId: "primary",
  })
  const failed = await markFailed(env.DB, record.id, "Google create failed")
  if (failed === null) {
    throw new Error("Failed to seed failed association")
  }
  return failed
}

function apiRequest(path: string, init: { method?: string } = {}) {
  return exports.default.fetch(
    new Request(`http://localhost${API_PREFIX}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${TEST_BOOK_API_KEY}` },
    }),
  )
}

describe("Google Calendar sync service", () => {
  test("retries a failed creation and records synchronization", async () => {
    await connectGoogleCalendar()
    const booking = await createBooking(env.DB, bookingInput)
    const failed = await seedFailedAssociation(booking.id)
    const { fetcher } = googleFetcher()

    const sync = await retryGoogleCalendarSync(
      env.DB,
      credentials,
      booking.id,
      fetcher,
    )

    expect(sync.status).toBe("synchronized")
    expect(sync.lastError).toBeNull()
    const record = await getEventByBookingId(env.DB, booking.id)
    expect(record?.google_event_id).toBe("google-event-123")
    expect(record?.attempt_count).toBe(failed.attempt_count + 1)
  })

  test("rejects creation retries from ineligible states", async () => {
    await connectGoogleCalendar()
    const booking = await createBooking(env.DB, bookingInput)
    const record = await insertPendingEvent(env.DB, {
      bookingId: booking.id,
      connectionId: 1,
      calendarId: "primary",
    })
    await markSynchronized(env.DB, record.id, "google-event-123")
    const { requests, fetcher } = googleFetcher()

    await expect(
      retryGoogleCalendarSync(env.DB, credentials, booking.id, fetcher),
    ).rejects.toMatchObject({
      name: "GoogleCalendarSyncError",
      reason: "ineligible_state",
    })
    expect(requests).toHaveLength(0)
  })

  test("allows only one concurrent claim of a failed record", async () => {
    await connectGoogleCalendar()
    const booking = await createBooking(env.DB, bookingInput)
    const failed = await seedFailedAssociation(booking.id)

    const [first, second] = await Promise.all([
      claimCreationRetry(env.DB, failed.id),
      claimCreationRetry(env.DB, failed.id),
    ])

    expect([first, second].filter((record) => record !== null)).toHaveLength(1)
  })

  test("rejects synchronization without an active booking or connection", async () => {
    const { requests, fetcher } = googleFetcher()

    await expect(
      requestGoogleCalendarSync(env.DB, credentials, 999, fetcher),
    ).rejects.toMatchObject({ reason: "booking_not_found" })

    const booking = await createBooking(env.DB, bookingInput)
    await expect(
      requestGoogleCalendarSync(env.DB, credentials, booking.id, fetcher),
    ).rejects.toMatchObject({ reason: "not_connected" })

    await connectGoogleCalendar()
    await deleteBooking(env.DB, booking.id)
    await expect(
      requestGoogleCalendarSync(env.DB, credentials, booking.id, fetcher),
    ).rejects.toMatchObject({ reason: "booking_deleted" })

    expect(requests).toHaveLength(0)
    expect(await getEventByBookingId(env.DB, booking.id)).toBeNull()
  })

  test("treats a Google 404 on deletion retry as successful cleanup", async () => {
    await connectGoogleCalendar()
    const booking = await createBooking(env.DB, bookingInput)
    const record = await insertPendingEvent(env.DB, {
      bookingId: booking.id,
      connectionId: 1,
      calendarId: "primary",
    })
    await markSynchronized(env.DB, record.id, "google-event-123")
    const claimed = await claimDeletion(env.DB, record.id)
    if (claimed === null) {
      throw new Error("Failed to claim deletion for seeding")
    }
    const deleteFailed = await markDeleteFailed(
      env.DB,
      record.id,
      "Failed to delete Google Calendar event",
    )
    if (deleteFailed === null) {
      throw new Error("Failed to seed delete_failed association")
    }

    const sync = await retryGoogleCalendarDeletion(
      env.DB,
      credentials,
      booking.id,
      googleFetcher({ deleteStatus: 404 }).fetcher,
    )

    expect(sync.status).toBe("deleted")
    expect(sync.lastError).toBeNull()
    const updated = await getEventByBookingId(env.DB, booking.id)
    expect(updated?.deleted_at).not.toBeNull()
  })

  test("rejects deletion retries from ineligible states", async () => {
    await connectGoogleCalendar()
    const booking = await createBooking(env.DB, bookingInput)
    const record = await insertPendingEvent(env.DB, {
      bookingId: booking.id,
      connectionId: 1,
      calendarId: "primary",
    })
    await markSynchronized(env.DB, record.id, "google-event-123")
    const { requests, fetcher } = googleFetcher()

    await expect(
      retryGoogleCalendarDeletion(env.DB, credentials, booking.id, fetcher),
    ).rejects.toMatchObject({ reason: "ineligible_state" })
    expect(requests).toHaveLength(0)
  })
})

describe("Google Calendar sync API", () => {
  test("returns 404 for status without an association", async () => {
    const booking = await createBooking(env.DB, bookingInput)

    const response = await apiRequest(`/bookings/${booking.id}/google-calendar`)
    expect(response.status).toBe(404)

    const missing = await apiRequest(`/bookings/999/google-calendar`)
    expect(missing.status).toBe(404)
  })

  test("returns the sync status for an associated booking", async () => {
    await connectGoogleCalendar()
    const booking = await createBooking(env.DB, bookingInput)
    await seedFailedAssociation(booking.id)

    const sync = await testApiClient.getGoogleCalendarSync(booking.id)
    expect(sync).toEqual({
      bookingId: booking.id,
      status: "failed",
      lastError: "Google create failed",
      lastAttemptAt: expect.any(Number),
    })
  })

  test("rejects creation retries while Google Calendar is disabled", async () => {
    await connectGoogleCalendar()
    const booking = await createBooking(env.DB, bookingInput)
    await seedFailedAssociation(booking.id)

    const response = await apiRequest(
      `/bookings/${booking.id}/google-calendar/retry`,
      { method: "POST" },
    )
    expect(response.status).toBe(409)
    const record = await getEventByBookingId(env.DB, booking.id)
    expect(record?.status).toBe("failed")
    expect(record?.attempt_count).toBe(1)
  })

  test("rejects creation retries without an association", async () => {
    await patchConfiguration(env.DB, { enableGoogleCalendar: true })
    const booking = await createBooking(env.DB, bookingInput)

    const response = await apiRequest(
      `/bookings/${booking.id}/google-calendar/retry`,
      { method: "POST" },
    )
    expect(response.status).toBe(404)
  })

  test("rejects deletion retries without an association", async () => {
    const booking = await createBooking(env.DB, bookingInput)

    const response = await apiRequest(
      `/bookings/${booking.id}/google-calendar/delete-retry`,
      { method: "POST" },
    )
    expect(response.status).toBe(404)
  })

  test("maps sync service errors to clear HTTP responses", async () => {
    await connectGoogleCalendar()
    await patchConfiguration(env.DB, { enableGoogleCalendar: true })
    const booking = await createBooking(env.DB, bookingInput)
    const record = await insertPendingEvent(env.DB, {
      bookingId: booking.id,
      connectionId: 1,
      calendarId: "primary",
    })
    await markSynchronized(env.DB, record.id, "google-event-123")

    const response = await apiRequest(
      `/bookings/${booking.id}/google-calendar/retry`,
      { method: "POST" },
    )
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: string }
    expect(body.error).toContain("synchronized")
  })
})
