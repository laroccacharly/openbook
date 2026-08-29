import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"

const SINGLETON_CONNECTION_ID = 1

const GoogleCalendarConnectionRowSchema = z.object({
  refresh_token: z.string(),
  email: z.string().nullable(),
  connected_at: z.number(),
})

export type GoogleCalendarConnection = {
  refreshToken: string
  email: string | null
  connectedAt: number
}

export async function upsertGoogleCalendarConnection(
  db: D1Database,
  input: { refreshToken: string; email: string | null },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `INSERT INTO google_calendar_connection (
         id, refresh_token, email, connected_at, updated_at
       ) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         refresh_token = excluded.refresh_token,
         email = excluded.email,
         connected_at = excluded.connected_at,
         updated_at = excluded.updated_at`,
    )
    .bind(input.refreshToken, input.email, now, now)
    .run()
}

export async function getGoogleCalendarConnection(
  db: D1Database,
): Promise<GoogleCalendarConnection | null> {
  const row = await db
    .prepare(
      `SELECT refresh_token, email, connected_at
       FROM google_calendar_connection
       WHERE id = ?`,
    )
    .bind(SINGLETON_CONNECTION_ID)
    .first()

  if (row === null) {
    return null
  }

  const parsed = GoogleCalendarConnectionRowSchema.parse(row)
  return {
    refreshToken: parsed.refresh_token,
    email: parsed.email,
    connectedAt: parsed.connected_at,
  }
}
