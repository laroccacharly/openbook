import type { D1Database } from "@cloudflare/workers-types"
import { getConfiguration } from "./db/configuration"
import { createBooking, deleteBooking } from "./db/bookings"
import type { GoogleCalendarCredentials } from "./google-calendar/google-calendar"
import type { GoogleCalendarSync } from "./db/google-calendar-events"
import {
  GoogleCalendarSyncError,
  requestGoogleCalendarDeletion,
  requestGoogleCalendarSync,
} from "./google-calendar/google-calendar-sync"
import type { Booking, BookingCreateInput } from "./types"

export type BookingSyncOutcome = {
  booking: Booking
  sync: GoogleCalendarSync | null
  syncError: string | null
}

export async function createBookingWithSync(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  input: BookingCreateInput,
  fetcher: typeof fetch = fetch,
): Promise<BookingSyncOutcome> {
  const booking = await createBooking(db, input)
  const configuration = await getConfiguration(db)
  if (!configuration.enableGoogleCalendar) {
    return { booking, sync: null, syncError: null }
  }

  try {
    const sync = await requestGoogleCalendarSync(
      db,
      credentials,
      booking.id,
      fetcher,
    )
    return { booking, sync, syncError: null }
  } catch (error) {
    if (error instanceof GoogleCalendarSyncError) {
      return { booking, sync: null, syncError: error.message }
    }
    throw error
  }
}

export async function deleteBookingWithSync(
  db: D1Database,
  credentials: GoogleCalendarCredentials,
  bookingId: number,
  fetcher: typeof fetch = fetch,
): Promise<BookingSyncOutcome | null> {
  const booking = await deleteBooking(db, bookingId)
  if (booking === null) {
    return null
  }

  // Remote cleanup is best-effort: local deletion already committed and must
  // not be blocked by Google or sync-persistence failures.
  try {
    const sync = await requestGoogleCalendarDeletion(
      db,
      credentials,
      bookingId,
      fetcher,
    )
    return { booking, sync, syncError: null }
  } catch (error) {
    const syncError =
      error instanceof Error ? error.message : "Google Calendar cleanup failed"
    return { booking, sync: null, syncError }
  }
}
