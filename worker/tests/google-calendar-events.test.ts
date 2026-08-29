import { env } from "cloudflare:workers"
import { beforeEach, describe, expect, test } from "vitest"
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "@worker/src/google-calendar/google-calendar"
import { buildGoogleCalendarEvent } from "@worker/src/google-calendar/google-calendar-sync"
import { createBooking } from "@worker/src/db/bookings"

describe("Google Calendar events", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      `INSERT INTO google_calendar_connection (
         id, refresh_token, email
       ) VALUES (1, ?, ?)`,
    )
      .bind("refresh-token", "owner@example.com")
      .run()
  })

  test("constructs the expected readable event payload", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [7, 11],
      startDatetime: new Date("2026-08-15T14:00:00.000Z"),
      endDatetime: new Date("2026-08-15T16:00:00.000Z"),
      description: "Deep clean",
      address: "100 Main Street",
      customerId: 99,
      estimatedPrice: 25000,
    })

    expect(buildGoogleCalendarEvent(booking)).toEqual({
      summary: "Deep clean",
      location: "100 Main Street",
      description: `Worker IDs: 7, 11\nCustomer ID: 99\nEstimated price: ${new Intl.NumberFormat(
        "en-CA",
        { style: "currency", currency: "CAD" },
      ).format(250)}`,
      start: {
        dateTime: "2026-08-15T14:00:00.000Z",
        timeZone: "UTC",
      },
      end: {
        dateTime: "2026-08-15T16:00:00.000Z",
        timeZone: "UTC",
      },
    })
  })

  test("refreshes the token and creates an event in the primary calendar", async () => {
    const booking = await createBooking(env.DB, {
      workerIds: [7],
      startDatetime: new Date("2026-08-15T14:00:00.000Z"),
      endDatetime: new Date("2026-08-15T16:00:00.000Z"),
      description: "Deep clean",
    })
    const requests: Request[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      if (request.url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "access-token" })
      }
      return Response.json({ id: "google-event-123" }, { status: 200 })
    }

    const eventId = await createGoogleCalendarEvent(env.DB, {
      credentials: { clientId: "client-id", clientSecret: "client-secret" },
      calendarId: "primary",
      event: buildGoogleCalendarEvent(booking),
      fetcher,
    })

    expect(eventId).toBe("google-event-123")
    expect(requests[1]!.method).toBe("POST")
    expect(requests[1]!.url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    )
    expect(requests[1]!.headers.get("Authorization")).toBe(
      "Bearer access-token",
    )
    expect(await requests[1]!.json()).toEqual(buildGoogleCalendarEvent(booking))
  })

  test("treats a Google 404 during deletion as already deleted", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "access-token" })
      }
      return new Response(null, { status: 404 })
    }

    await expect(
      deleteGoogleCalendarEvent(env.DB, {
        credentials: { clientId: "client-id", clientSecret: "client-secret" },
        calendarId: "primary",
        eventId: "event/with spaces",
        fetcher,
      }),
    ).resolves.toBeUndefined()
  })
})
