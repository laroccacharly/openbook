import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"
import { getGoogleCalendarConnection } from "../db/google-connections"

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
})

const CreatedEventSchema = z.object({
  id: z.string().min(1),
})

export type GoogleCalendarCredentials = {
  clientId: string
  clientSecret: string
}

export type GoogleCalendarEvent = {
  summary: string
  location?: string
  description: string
  start: { dateTime: string; timeZone: "UTC" }
  end: { dateTime: string; timeZone: "UTC" }
}

export class GoogleCalendarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoogleCalendarError"
  }
}

export async function createGoogleCalendarEvent(
  db: D1Database,
  params: {
    credentials: GoogleCalendarCredentials
    calendarId: string
    event: GoogleCalendarEvent
    fetcher?: typeof fetch
  },
): Promise<string> {
  const fetcher = params.fetcher ?? fetch
  const accessToken = await getGoogleAccessToken(
    db,
    params.credentials,
    fetcher,
  )
  let response: Response
  try {
    response = await fetcher(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.event),
      },
    )
  } catch {
    throw new GoogleCalendarError("Failed to reach Google Calendar")
  }

  if (!response.ok) {
    throw new GoogleCalendarError("Failed to create Google Calendar event")
  }
  const parsed = CreatedEventSchema.safeParse(
    await response.json().catch(() => null),
  )
  if (!parsed.success) {
    throw new GoogleCalendarError("Google returned an invalid calendar event")
  }
  return parsed.data.id
}

export async function deleteGoogleCalendarEvent(
  db: D1Database,
  params: {
    credentials: GoogleCalendarCredentials
    calendarId: string
    eventId: string
    fetcher?: typeof fetch
  },
): Promise<void> {
  const fetcher = params.fetcher ?? fetch
  const accessToken = await getGoogleAccessToken(
    db,
    params.credentials,
    fetcher,
  )
  let response: Response
  try {
    response = await fetcher(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(params.eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
  } catch {
    throw new GoogleCalendarError("Failed to reach Google Calendar")
  }

  if (!response.ok && response.status !== 404) {
    throw new GoogleCalendarError("Failed to delete Google Calendar event")
  }
}

async function getGoogleAccessToken(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  fetcher: typeof fetch,
): Promise<string> {
  const connection = await getGoogleCalendarConnection(db)
  if (connection === null) {
    throw new GoogleCalendarError("Google Calendar is not connected")
  }

  let response: Response
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: "refresh_token",
      }),
    })
  } catch {
    throw new GoogleCalendarError("Failed to refresh Google access token")
  }
  if (!response.ok) {
    throw new GoogleCalendarError("Failed to refresh Google access token")
  }
  const parsed = TokenResponseSchema.safeParse(
    await response.json().catch(() => null),
  )
  if (!parsed.success) {
    throw new GoogleCalendarError("Google returned an invalid token response")
  }
  return parsed.data.access_token
}
