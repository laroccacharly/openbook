import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"

const RowStatusSchema = z.enum([
  "pending",
  "synchronized",
  "failed",
  "delete_pending",
  "delete_failed",
  "deleted",
])

const GoogleCalendarEventRowSchema = z.object({
  id: z.number().int(),
  booking_id: z.number().int(),
  connection_id: z.number().int(),
  calendar_id: z.string().min(1),
  google_event_id: z.string().nullable(),
  status: RowStatusSchema,
  last_error: z.string().nullable(),
  attempt_count: z.number().int(),
  last_attempt_at: z.number().int().nullable(),
  synchronized_at: z.number().int().nullable(),
  deleted_at: z.number().int().nullable(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
})

export type GoogleCalendarEventRecord = z.infer<
  typeof GoogleCalendarEventRowSchema
>

export const GoogleCalendarSyncSchema = z.object({
  bookingId: z.number().int(),
  status: z.enum([
    "pending",
    "synchronized",
    "failed",
    "deletePending",
    "deleteFailed",
    "deleted",
  ]),
  lastError: z.string().nullable(),
  lastAttemptAt: z.number().int().nullable(),
})

export type GoogleCalendarSync = z.infer<typeof GoogleCalendarSyncSchema>

export function toGoogleCalendarSync(
  record: GoogleCalendarEventRecord,
): GoogleCalendarSync {
  const status = {
    pending: "pending",
    synchronized: "synchronized",
    failed: "failed",
    delete_pending: "deletePending",
    delete_failed: "deleteFailed",
    deleted: "deleted",
  } as const satisfies Record<
    GoogleCalendarEventRecord["status"],
    GoogleCalendarSync["status"]
  >
  return {
    bookingId: record.booking_id,
    status: status[record.status],
    lastError: record.last_error,
    lastAttemptAt: record.last_attempt_at,
  }
}

function parseEventRow(row: unknown): GoogleCalendarEventRecord {
  return GoogleCalendarEventRowSchema.parse(row)
}

export async function insertPendingEvent(
  db: D1Database,
  input: { bookingId: number; connectionId: number; calendarId: string },
): Promise<GoogleCalendarEventRecord> {
  const now = Math.floor(Date.now() / 1000)
  const row = await db
    .prepare(
      `INSERT INTO google_calendar_events (
         booking_id, connection_id, calendar_id, status,
         attempt_count, last_attempt_at
       ) VALUES (?, ?, ?, 'pending', 1, ?)
       RETURNING *`,
    )
    .bind(input.bookingId, input.connectionId, input.calendarId, now)
    .first()
  if (row === null) {
    throw new Error("Failed to create Google Calendar event record")
  }
  return parseEventRow(row)
}

export async function getEventByBookingId(
  db: D1Database,
  bookingId: number,
): Promise<GoogleCalendarEventRecord | null> {
  const row = await db
    .prepare(`SELECT * FROM google_calendar_events WHERE booking_id = ?`)
    .bind(bookingId)
    .first()
  if (row === null) {
    return null
  }
  return parseEventRow(row)
}

async function transition(
  db: D1Database,
  sql: string,
  bindings: (string | number | null)[],
): Promise<GoogleCalendarEventRecord | null> {
  const row = await db
    .prepare(`${sql} RETURNING *`)
    .bind(...bindings)
    .first()
  if (row === null) {
    return null
  }
  return parseEventRow(row)
}

export async function markSynchronized(
  db: D1Database,
  id: number,
  googleEventId: string,
): Promise<GoogleCalendarEventRecord | null> {
  const now = Math.floor(Date.now() / 1000)
  return transition(
    db,
    `UPDATE google_calendar_events SET
       status = 'synchronized', google_event_id = ?, last_error = NULL,
       synchronized_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    [googleEventId, now, now, id],
  )
}

export async function markFailed(
  db: D1Database,
  id: number,
  error: string,
): Promise<GoogleCalendarEventRecord | null> {
  const now = Math.floor(Date.now() / 1000)
  return transition(
    db,
    `UPDATE google_calendar_events SET
       status = 'failed', last_error = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`,
    [error, now, id],
  )
}

export async function claimCreationRetry(
  db: D1Database,
  id: number,
): Promise<GoogleCalendarEventRecord | null> {
  const now = Math.floor(Date.now() / 1000)
  return transition(
    db,
    `UPDATE google_calendar_events SET
       status = 'pending', attempt_count = attempt_count + 1,
       last_error = NULL, last_attempt_at = ?, updated_at = ?
     WHERE id = ? AND status = 'failed'`,
    [now, now, id],
  )
}

export async function claimDeletion(
  db: D1Database,
  id: number,
): Promise<GoogleCalendarEventRecord | null> {
  const now = Math.floor(Date.now() / 1000)
  return transition(
    db,
    `UPDATE google_calendar_events SET
       status = 'delete_pending', attempt_count = attempt_count + 1,
       last_error = NULL, last_attempt_at = ?, updated_at = ?
     WHERE id = ? AND google_event_id IS NOT NULL
       AND status IN ('synchronized', 'failed')`,
    [now, now, id],
  )
}

export async function claimDeletionRetry(
  db: D1Database,
  id: number,
): Promise<GoogleCalendarEventRecord | null> {
  const now = Math.floor(Date.now() / 1000)
  return transition(
    db,
    `UPDATE google_calendar_events SET
       status = 'delete_pending', attempt_count = attempt_count + 1,
       last_error = NULL, last_attempt_at = ?, updated_at = ?
     WHERE id = ? AND google_event_id IS NOT NULL
       AND status = 'delete_failed'`,
    [now, now, id],
  )
}

export async function markDeleted(
  db: D1Database,
  id: number,
): Promise<GoogleCalendarEventRecord | null> {
  const now = Math.floor(Date.now() / 1000)
  return transition(
    db,
    `UPDATE google_calendar_events SET
       status = 'deleted', last_error = NULL, deleted_at = ?, updated_at = ?
     WHERE id = ? AND status = 'delete_pending'`,
    [now, now, id],
  )
}

export async function markDeleteFailed(
  db: D1Database,
  id: number,
  error: string,
): Promise<GoogleCalendarEventRecord | null> {
  const now = Math.floor(Date.now() / 1000)
  return transition(
    db,
    `UPDATE google_calendar_events SET
       status = 'delete_failed', last_error = ?, updated_at = ?
     WHERE id = ? AND status = 'delete_pending'`,
    [error, now, id],
  )
}
