import type { D1Database } from "@cloudflare/workers-types"
import { getBookingById } from "../db/bookings"
import { getGoogleCalendarConnection } from "../db/google-connections"
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  GoogleCalendarError,
  type GoogleCalendarCredentials,
  type GoogleCalendarEvent,
} from "./google-calendar"
import {
  claimCreationRetry,
  claimDeletion,
  claimDeletionRetry,
  getEventByBookingId,
  insertPendingEvent,
  markDeleted,
  markDeleteFailed,
  markFailed,
  markSynchronized,
  toGoogleCalendarSync,
  type GoogleCalendarEventRecord,
  type GoogleCalendarSync,
} from "../db/google-calendar-events"
import type { Booking } from "../types"

const PRIMARY_CALENDAR_ID = "primary"
const SINGLETON_CONNECTION_ID = 1

export type GoogleCalendarSyncFailure =
  | "booking_not_found"
  | "booking_deleted"
  | "not_connected"
  | "no_association"
  | "ineligible_state"
  | "claim_conflict"

export class GoogleCalendarSyncError extends Error {
  readonly reason: GoogleCalendarSyncFailure

  constructor(reason: GoogleCalendarSyncFailure, message: string) {
    super(message)
    this.name = "GoogleCalendarSyncError"
    this.reason = reason
  }
}

export function buildGoogleCalendarEvent(
  booking: Booking,
): GoogleCalendarEvent {
  const details = [
    `Worker IDs: ${booking.workerIds.join(", ") || "None"}`,
    `Customer ID: ${booking.customerId ?? "None"}`,
    `Estimated price: ${
      booking.estimatedPrice === null
        ? "None"
        : new Intl.NumberFormat("en-CA", {
            style: "currency",
            currency: "CAD",
          }).format(booking.estimatedPrice / 100)
    }`,
  ]

  return {
    summary: booking.description,
    ...(booking.address === null ? {} : { location: booking.address }),
    description: details.join("\n"),
    start: {
      dateTime: booking.startDatetime.toISOString(),
      timeZone: "UTC",
    },
    end: {
      dateTime: booking.endDatetime.toISOString(),
      timeZone: "UTC",
    },
  }
}

export async function getGoogleCalendarSyncStatus(
  db: D1Database,
  bookingId: number,
): Promise<GoogleCalendarSync | null> {
  const record = await getEventByBookingId(db, bookingId)
  if (record === null) {
    return null
  }
  return toGoogleCalendarSync(record)
}

export async function requestGoogleCalendarSync(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  bookingId: number,
  fetcher: typeof fetch = fetch,
): Promise<GoogleCalendarSync> {
  const booking = await requireActiveBooking(db, bookingId)
  await requireConnection(db)

  const existing = await getEventByBookingId(db, bookingId)
  if (existing !== null) {
    throw new GoogleCalendarSyncError(
      "ineligible_state",
      "Booking already has a Google Calendar association",
    )
  }

  const record = await insertPendingEvent(db, {
    bookingId,
    connectionId: SINGLETON_CONNECTION_ID,
    calendarId: PRIMARY_CALENDAR_ID,
  })
  return attemptCreation({
    db,
    credentials,
    booking,
    record,
    fetcher,
  })
}

export async function retryGoogleCalendarSync(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  bookingId: number,
  fetcher: typeof fetch = fetch,
): Promise<GoogleCalendarSync> {
  const record = await requireAssociation(db, bookingId)
  if (record.status !== "failed") {
    throw new GoogleCalendarSyncError(
      "ineligible_state",
      `Cannot retry synchronization from status "${record.status}"`,
    )
  }
  const booking = await requireActiveBooking(db, bookingId)
  await requireConnection(db)

  const claimed = await claimCreationRetry(db, record.id)
  if (claimed === null) {
    throw new GoogleCalendarSyncError(
      "claim_conflict",
      "Synchronization retry was already claimed",
    )
  }
  return attemptCreation({
    db,
    credentials,
    booking,
    record: claimed,
    fetcher,
  })
}

export async function requestGoogleCalendarDeletion(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  bookingId: number,
  fetcher: typeof fetch = fetch,
): Promise<GoogleCalendarSync | null> {
  const record = await getEventByBookingId(db, bookingId)
  if (record === null) {
    return null
  }
  const claimed = await claimDeletion(db, record.id)
  if (claimed === null) {
    return toGoogleCalendarSync(record)
  }
  return attemptDeletion(db, credentials, claimed, fetcher)
}

export async function retryGoogleCalendarDeletion(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  bookingId: number,
  fetcher: typeof fetch = fetch,
): Promise<GoogleCalendarSync> {
  const record = await requireAssociation(db, bookingId)
  const claimed = await claimDeletionRetry(db, record.id)
  if (claimed === null) {
    throw new GoogleCalendarSyncError(
      "ineligible_state",
      `Cannot retry deletion from status "${record.status}"`,
    )
  }
  return attemptDeletion(db, credentials, claimed, fetcher)
}

async function attemptCreation(params: {
  db: D1Database
  credentials: GoogleCalendarCredentials
  booking: Booking
  record: GoogleCalendarEventRecord
  fetcher: typeof fetch
}): Promise<GoogleCalendarSync> {
  try {
    const eventId = await createGoogleCalendarEvent(params.db, {
      credentials: params.credentials,
      calendarId: params.record.calendar_id,
      event: buildGoogleCalendarEvent(params.booking),
      fetcher: params.fetcher,
    })
    const synchronized = await markSynchronized(
      params.db,
      params.record.id,
      eventId,
    )
    if (synchronized === null) {
      throw new Error("Failed to record Google Calendar synchronization")
    }
    return toGoogleCalendarSync(synchronized)
  } catch (error) {
    if (!(error instanceof GoogleCalendarError)) throw error
    const failed = await markFailed(params.db, params.record.id, error.message)
    if (failed === null) {
      throw new Error("Failed to record Google Calendar failure")
    }
    return toGoogleCalendarSync(failed)
  }
}

async function attemptDeletion(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  record: GoogleCalendarEventRecord,
  fetcher: typeof fetch,
): Promise<GoogleCalendarSync> {
  if (record.google_event_id === null) {
    throw new Error("Cannot delete a Google event without an ID")
  }
  try {
    await deleteGoogleCalendarEvent(db, {
      credentials,
      calendarId: record.calendar_id,
      eventId: record.google_event_id,
      fetcher,
    })
    const deleted = await markDeleted(db, record.id)
    if (deleted === null) {
      throw new Error("Failed to record Google Calendar deletion")
    }
    return toGoogleCalendarSync(deleted)
  } catch (error) {
    if (!(error instanceof GoogleCalendarError)) throw error
    const failed = await markDeleteFailed(db, record.id, error.message)
    if (failed === null) {
      throw new Error("Failed to record Google Calendar deletion failure")
    }
    return toGoogleCalendarSync(failed)
  }
}

async function requireActiveBooking(
  db: D1Database,
  bookingId: number,
): Promise<Booking> {
  const booking = await getBookingById(db, bookingId)
  if (booking === null) {
    throw new GoogleCalendarSyncError("booking_not_found", "Booking not found")
  }
  if (booking.deleteAt !== null) {
    throw new GoogleCalendarSyncError("booking_deleted", "Booking is deleted")
  }
  return booking
}

async function requireConnection(db: D1Database): Promise<void> {
  const connection = await getGoogleCalendarConnection(db)
  if (connection === null) {
    throw new GoogleCalendarSyncError(
      "not_connected",
      "Google Calendar is not connected",
    )
  }
}

async function requireAssociation(
  db: D1Database,
  bookingId: number,
): Promise<GoogleCalendarEventRecord> {
  const record = await getEventByBookingId(db, bookingId)
  if (record === null) {
    throw new GoogleCalendarSyncError(
      "no_association",
      "Booking has no Google Calendar association",
    )
  }
  return record
}
