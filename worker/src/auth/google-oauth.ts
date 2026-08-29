import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"
import {
  getGoogleCalendarConnection,
  upsertGoogleCalendarConnection,
} from "../db/google-connections"

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"
const GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
const STATE_TTL_SECONDS = 10 * 60

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
})

const CalendarInfoSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  timeZone: z.string().optional(),
  accessRole: z.string(),
  primary: z.boolean().optional(),
})

const UserInfoSchema = z.object({
  email: z.email().optional(),
})

export async function createGoogleConnectUrl(
  db: D1Database,
  clientId: string,
  redirectUri: string,
): Promise<string> {
  const state = crypto.randomUUID()
  await db
    .prepare(`INSERT INTO google_oauth_states (state) VALUES (?)`)
    .bind(state)
    .run()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [GOOGLE_CALENDAR_SCOPE, GOOGLE_EMAIL_SCOPE].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function completeGoogleOAuth(
  db: D1Database,
  input: {
    code: string
    state: string
    clientId: string
    clientSecret: string
    redirectUri: string
  },
): Promise<{ ok: true; email: string | null } | { ok: false; error: string }> {
  const stateRow = await db
    .prepare(`SELECT created_at FROM google_oauth_states WHERE state = ?`)
    .bind(input.state)
    .first<{ created_at: number }>()

  if (stateRow === null) {
    return { ok: false, error: "Invalid or expired OAuth state" }
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - stateRow.created_at
  if (ageSeconds > STATE_TTL_SECONDS) {
    await db
      .prepare(`DELETE FROM google_oauth_states WHERE state = ?`)
      .bind(input.state)
      .run()
    return { ok: false, error: "Invalid or expired OAuth state" }
  }

  await db
    .prepare(`DELETE FROM google_oauth_states WHERE state = ?`)
    .bind(input.state)
    .run()

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  })

  if (!tokenResponse.ok) {
    return { ok: false, error: "Failed to exchange OAuth code" }
  }

  const tokenPayload = await tokenResponse.json().catch(() => null)
  const parsedTokens = TokenResponseSchema.safeParse(tokenPayload)
  if (!parsedTokens.success) {
    return { ok: false, error: "Google returned an invalid token response" }
  }

  const tokens = parsedTokens.data
  if (!tokens.refresh_token) {
    return {
      ok: false,
      error: "Google did not return a refresh token. Reconnect with consent.",
    }
  }

  const email = await fetchGoogleEmail(tokens.access_token)

  await upsertGoogleCalendarConnection(db, {
    refreshToken: tokens.refresh_token,
    email,
  })

  return { ok: true, email }
}

export type GooglePrimaryCalendarInfo =
  | {
      ok: false
      reason: "not_connected" | "unavailable"
      error: string
    }
  | {
      ok: true
      calendar: {
        id: string
        name: string
        description: string | null
        location: string | null
        timeZone: string | null
        accessRole: string
        primary: boolean
      }
    }

export async function getGooglePrimaryCalendarInfo(
  db: D1Database,
  clientId: string,
  clientSecret: string,
  fetcher: typeof fetch = fetch,
): Promise<GooglePrimaryCalendarInfo> {
  const connection = await getGoogleCalendarConnection(db)

  if (connection === null) {
    return {
      ok: false as const,
      reason: "not_connected" as const,
      error: "Google Calendar is not connected",
    }
  }

  try {
    const accessToken = await refreshGoogleAccessToken(
      clientId,
      clientSecret,
      connection.refreshToken,
      fetcher,
    )
    if (accessToken.ok === false) {
      return accessToken.info
    }
    return await fetchPrimaryGoogleCalendarInfo(
      accessToken.accessToken,
      fetcher,
    )
  } catch {
    return googleUnavailable("Failed to reach Google Calendar")
  }
}

async function refreshGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  fetcher: typeof fetch,
): Promise<
  | { ok: true; accessToken: string }
  | { ok: false; info: GooglePrimaryCalendarInfo }
> {
  const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  if (!tokenResponse.ok) {
    return {
      ok: false,
      info: googleUnavailable("Failed to refresh Google access token"),
    }
  }

  const parsedToken = TokenResponseSchema.safeParse(
    await tokenResponse.json().catch(() => null),
  )
  if (!parsedToken.success) {
    return {
      ok: false,
      info: googleUnavailable("Google returned an invalid token response"),
    }
  }

  return { ok: true, accessToken: parsedToken.data.access_token }
}

async function fetchPrimaryGoogleCalendarInfo(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<GooglePrimaryCalendarInfo> {
  const calendarResponse = await fetcher(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
  if (!calendarResponse.ok) {
    return googleUnavailable("Failed to fetch the primary Google Calendar")
  }

  const parsedCalendar = CalendarInfoSchema.safeParse(
    await calendarResponse.json().catch(() => null),
  )
  if (!parsedCalendar.success) {
    return googleUnavailable("Google returned invalid calendar information")
  }

  const calendar = parsedCalendar.data
  return {
    ok: true as const,
    calendar: {
      id: calendar.id,
      name: calendar.summary,
      description: calendar.description ?? null,
      location: calendar.location ?? null,
      timeZone: calendar.timeZone ?? null,
      accessRole: calendar.accessRole,
      primary: calendar.primary ?? true,
    },
  }
}

function googleUnavailable(error: string) {
  return {
    ok: false as const,
    reason: "unavailable" as const,
    error,
  }
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!response.ok) {
    return null
  }

  const parsed = UserInfoSchema.safeParse(await response.json())
  if (!parsed.success) {
    return null
  }
  return parsed.data.email ?? null
}
