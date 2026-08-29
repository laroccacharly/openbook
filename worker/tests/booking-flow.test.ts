import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import {
  createBookingWithSync,
  deleteBookingWithSync,
} from "@worker/src/booking-flow"
import { patchConfiguration } from "@worker/src/db/configuration"
import { getEventByBookingId } from "@worker/src/db/google-calendar-events"

const credentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
}

const input = {
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

describe("createBookingWithSync", () => {
  test("creates a D1-only booking when Google Calendar is disabled", async () => {
    const { requests, fetcher } = googleFetcher()
    const outcome = await createBookingWithSync(
      env.DB,
      credentials,
      input,
      fetcher,
    )

    expect(outcome.booking.id).toBeDefined()
    expect(outcome.booking.deleteAt).toBeNull()
    expect(outcome.sync).toBeNull()
    expect(outcome.syncError).toBeNull()
    expect(requests).toHaveLength(0)
    expect(await getEventByBookingId(env.DB, outcome.booking.id)).toBeNull()
  })

  test("synchronizes the booking when Google Calendar is enabled", async () => {
    await connectGoogleCalendar()
    await patchConfiguration(env.DB, { enableGoogleCalendar: true })
    const { fetcher } = googleFetcher()

    const outcome = await createBookingWithSync(
      env.DB,
      credentials,
      input,
      fetcher,
    )

    expect(outcome.syncError).toBeNull()
    expect(outcome.sync).toEqual({
      bookingId: outcome.booking.id,
      status: "synchronized",
      lastError: null,
      lastAttemptAt: expect.any(Number),
    })
    const record = await getEventByBookingId(env.DB, outcome.booking.id)
    expect(record?.google_event_id).toBe("google-event-123")
    expect(record?.attempt_count).toBe(1)
    expect(record?.synchronized_at).not.toBeNull()
  })

  test("keeps the booking when Google event creation fails", async () => {
    await connectGoogleCalendar()
    await patchConfiguration(env.DB, { enableGoogleCalendar: true })
    const { fetcher } = googleFetcher({ createStatus: 500 })

    const outcome = await createBookingWithSync(
      env.DB,
      credentials,
      input,
      fetcher,
    )

    expect(outcome.booking.deleteAt).toBeNull()
    expect(outcome.syncError).toBeNull()
    expect(outcome.sync?.status).toBe("failed")
    expect(outcome.sync?.lastError).toBe(
      "Failed to create Google Calendar event",
    )
    const record = await getEventByBookingId(env.DB, outcome.booking.id)
    expect(record?.google_event_id).toBeNull()
    const bookingRow = await env.DB.prepare(
      `SELECT delete_at FROM bookings WHERE id = ?`,
    )
      .bind(outcome.booking.id)
      .first<{ delete_at: number | null }>()
    expect(bookingRow?.delete_at).toBeNull()
  })

  test("keeps the booking when Google Calendar is not connected", async () => {
    await patchConfiguration(env.DB, { enableGoogleCalendar: true })
    const { requests, fetcher } = googleFetcher()

    const outcome = await createBookingWithSync(
      env.DB,
      credentials,
      input,
      fetcher,
    )

    expect(outcome.booking.deleteAt).toBeNull()
    expect(outcome.sync).toBeNull()
    expect(outcome.syncError).toBe("Google Calendar is not connected")
    expect(requests).toHaveLength(0)
    expect(await getEventByBookingId(env.DB, outcome.booking.id)).toBeNull()
  })
})

describe("deleteBookingWithSync", () => {
  test("returns null for a missing booking", async () => {
    await expect(
      deleteBookingWithSync(env.DB, credentials, 999, googleFetcher().fetcher),
    ).resolves.toBeNull()
  })

  test("deletes locally and reports no cleanup without an association", async () => {
    const created = await createBookingWithSync(
      env.DB,
      credentials,
      input,
      googleFetcher().fetcher,
    )

    const outcome = await deleteBookingWithSync(
      env.DB,
      credentials,
      created.booking.id,
      googleFetcher().fetcher,
    )

    expect(outcome?.booking.deleteAt).not.toBeNull()
    expect(outcome?.sync).toBeNull()
    expect(outcome?.syncError).toBeNull()
  })

  test("deletes the remote event after the local delete commits", async () => {
    await connectGoogleCalendar()
    await patchConfiguration(env.DB, { enableGoogleCalendar: true })
    const created = await createBookingWithSync(
      env.DB,
      credentials,
      input,
      googleFetcher().fetcher,
    )

    const { requests, fetcher } = googleFetcher()
    const outcome = await deleteBookingWithSync(
      env.DB,
      credentials,
      created.booking.id,
      fetcher,
    )

    expect(outcome?.booking.deleteAt).not.toBeNull()
    expect(outcome?.sync?.status).toBe("deleted")
    const deleteRequest = requests.find(
      (request) => request.method === "DELETE",
    )
    expect(deleteRequest?.url).toContain("/events/google-event-123")
    const record = await getEventByBookingId(env.DB, created.booking.id)
    expect(record?.deleted_at).not.toBeNull()
  })

  test("keeps local deletion and retains the event ID when remote deletion fails", async () => {
    await connectGoogleCalendar()
    await patchConfiguration(env.DB, { enableGoogleCalendar: true })
    const created = await createBookingWithSync(
      env.DB,
      credentials,
      input,
      googleFetcher().fetcher,
    )

    const outcome = await deleteBookingWithSync(
      env.DB,
      credentials,
      created.booking.id,
      googleFetcher({ deleteStatus: 500 }).fetcher,
    )

    expect(outcome?.booking.deleteAt).not.toBeNull()
    expect(outcome?.sync?.status).toBe("deleteFailed")
    expect(outcome?.sync?.lastError).toBe(
      "Failed to delete Google Calendar event",
    )
    const record = await getEventByBookingId(env.DB, created.booking.id)
    expect(record?.google_event_id).toBe("google-event-123")
  })
})
