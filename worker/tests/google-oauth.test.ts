import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import { getGooglePrimaryCalendarInfo } from "@worker/src/auth/google-oauth"
import { upsertGoogleCalendarConnection } from "@worker/src/db/google-connections"

describe("Google Calendar live info", () => {
  test("refreshes the credential and fetches the primary calendar", async () => {
    await upsertGoogleCalendarConnection(env.DB, {
      refreshToken: "stored-refresh-token",
      email: "owner@example.com",
    })

    const requests: Request[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)

      if (request.url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "fresh-access-token" })
      }

      return Response.json({
        id: "owner@example.com",
        summary: "Primary calendar",
        description: "Booking calendar",
        location: "Toronto",
        timeZone: "America/Toronto",
        accessRole: "owner",
        primary: true,
      })
    }

    const result = await getGooglePrimaryCalendarInfo(
      env.DB,
      "client-id",
      "client-secret",
      fetcher,
    )

    expect(result).toEqual({
      ok: true,
      calendar: {
        id: "owner@example.com",
        name: "Primary calendar",
        description: "Booking calendar",
        location: "Toronto",
        timeZone: "America/Toronto",
        accessRole: "owner",
        primary: true,
      },
    })
    expect(requests).toHaveLength(2)
    expect(Object.fromEntries(await requests[0]!.formData())).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      refresh_token: "stored-refresh-token",
      grant_type: "refresh_token",
    })
    expect(requests[1]!.url).toBe(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
    )
    expect(requests[1]!.headers.get("Authorization")).toBe(
      "Bearer fresh-access-token",
    )
  })
})
