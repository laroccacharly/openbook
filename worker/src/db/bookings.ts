import type { D1Database } from "@cloudflare/workers-types"
import {
  type Booking,
  type BookingRow,
  type BookingCreateInput,
  BookingCreateSchema,
  BookingRowSchema,
  bookingFromRow,
  bookingToRow,
} from "../types"
import { type BookingLockLease, withBookingLock } from "./booking-lock"
import { createDefaultDepositAmountDue } from "./payments"

function parseBookingRow(row: unknown): Booking {
  return bookingFromRow(BookingRowSchema.parse(row))
}

export class BookingLockLostError extends Error {
  constructor() {
    super("Booking lock expired before the booking write")
    this.name = "BookingLockLostError"
  }
}

export async function createBookingWithLock(
  db: D1Database,
  booking: BookingCreateInput,
  lease: BookingLockLease,
  nowMs: number = Date.now(),
): Promise<Booking> {
  const parsed = BookingCreateSchema.parse(booking)

  if (parsed.messageId !== null) {
    const existing = await getBookingByMessageId(db, parsed.messageId)
    if (existing !== null) {
      return existing
    }
  }

  const row = bookingToRow(parsed)
  const result = await db
    .prepare(
      `WITH candidate (
         public_id, worker_ids, start_time, end_time, description,
         email_id, customer_id, address, estimated_price,
         cancelled_at, rescheduled_at, delete_at, message_id
       ) AS (
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )
       INSERT INTO bookings (
         public_id, worker_ids, start_time, end_time, description,
         email_id, customer_id, address, estimated_price,
         cancelled_at, rescheduled_at, delete_at, message_id
       )
       SELECT
         candidate.public_id,
         candidate.worker_ids,
         candidate.start_time,
         candidate.end_time,
         candidate.description,
         candidate.email_id,
         candidate.customer_id,
         candidate.address,
         candidate.estimated_price,
         candidate.cancelled_at,
         candidate.rescheduled_at,
         candidate.delete_at,
         candidate.message_id
       FROM candidate
       WHERE EXISTS (
         SELECT 1
         FROM booking_lock
         WHERE id = 1
           AND owner = ?
           AND fencing_token = ?
           AND expires_at_ms > ?
       )
       RETURNING *`,
    )
    .bind(
      row.public_id,
      row.worker_ids,
      row.start_time,
      row.end_time,
      row.description,
      row.email_id,
      row.customer_id,
      row.address,
      row.estimated_price,
      row.cancelled_at,
      row.rescheduled_at,
      row.delete_at,
      row.message_id,
      lease.owner,
      lease.fencingToken,
      nowMs,
    )
    .first()

  if (result === null) {
    throw new BookingLockLostError()
  }
  const created = parseBookingRow(result)
  await createDefaultDepositAmountDue(db, created)
  return created
}

export async function createBooking(
  db: D1Database,
  booking: BookingCreateInput,
): Promise<Booking> {
  return withBookingLock(db, (lease) =>
    createBookingWithLock(db, booking, lease),
  )
}

export async function getBookingById(
  db: D1Database,
  bookingId: number,
): Promise<Booking | null> {
  const result = await db
    .prepare(`SELECT * FROM bookings WHERE id = ?`)
    .bind(bookingId)
    .first()
  if (result === null) {
    return null
  }
  return parseBookingRow(result)
}

export async function getBookingByPublicId(
  db: D1Database,
  publicId: string,
): Promise<Booking | null> {
  const result = await db
    .prepare(`SELECT * FROM bookings WHERE public_id = ?`)
    .bind(publicId)
    .first()
  if (result === null) {
    return null
  }
  return parseBookingRow(result)
}

export async function getBookingByMessageId(
  db: D1Database,
  messageId: number,
): Promise<Booking | null> {
  const result = await db
    .prepare(`SELECT * FROM bookings WHERE message_id = ?`)
    .bind(messageId)
    .first()
  if (result === null) {
    return null
  }
  return parseBookingRow(result)
}

export async function getBookingByCancelledByMessageId(
  db: D1Database,
  messageId: number,
): Promise<Booking | null> {
  const result = await db
    .prepare(`SELECT * FROM bookings WHERE cancelled_by_message_id = ?`)
    .bind(messageId)
    .first()
  if (result === null) {
    return null
  }
  return parseBookingRow(result)
}

export async function getBookings(db: D1Database): Promise<Booking[]> {
  const result = await db
    .prepare(
      `SELECT * FROM bookings
       WHERE cancelled_at IS NULL AND delete_at IS NULL
       ORDER BY id ASC`,
    )
    .all<BookingRow>()
  return result.results.map(parseBookingRow)
}

export async function getBookingsByWorkerId(
  db: D1Database,
  workerId: number,
): Promise<Booking[]> {
  const result = await db
    .prepare(
      `SELECT bookings.*
       FROM bookings, json_each(bookings.worker_ids) AS assigned_worker
       WHERE assigned_worker.value = ?
         AND bookings.cancelled_at IS NULL
         AND bookings.delete_at IS NULL
       ORDER BY bookings.id ASC`,
    )
    .bind(workerId)
    .all<BookingRow>()
  return result.results.map(parseBookingRow)
}

export async function getBookingsByCustomerId(
  db: D1Database,
  customerId: number,
): Promise<Booking[]> {
  const result = await db
    .prepare(
      `SELECT * FROM bookings
       WHERE customer_id = ?
         AND delete_at IS NULL
       ORDER BY start_time DESC, id DESC`,
    )
    .bind(customerId)
    .all<BookingRow>()
  return result.results.map(parseBookingRow)
}

export async function updateBooking(
  db: D1Database,
  booking: Booking,
): Promise<Booking | null> {
  const existing = await getBookingById(db, booking.id)
  if (existing === null) {
    return null
  }

  const row = bookingToRow(booking)
  await db
    .prepare(
      `UPDATE bookings SET
         public_id = ?, worker_ids = ?, start_time = ?, end_time = ?, description = ?,
         email_id = ?, customer_id = ?, address = ?, estimated_price = ?,
         cancelled_at = ?, rescheduled_at = ?, delete_at = ?,
         cancelled_by_message_id = ?, rescheduled_by_message_id = ?
       WHERE id = ?`,
    )
    .bind(
      row.public_id,
      row.worker_ids,
      row.start_time,
      row.end_time,
      row.description,
      row.email_id,
      row.customer_id,
      row.address,
      row.estimated_price,
      row.cancelled_at,
      row.rescheduled_at,
      row.delete_at,
      row.cancelled_by_message_id,
      row.rescheduled_by_message_id,
      booking.id,
    )
    .run()

  return getBookingById(db, booking.id)
}

export async function deleteBooking(
  db: D1Database,
  bookingId: number,
): Promise<Booking | null> {
  const booking = await getBookingById(db, bookingId)
  if (booking === null) {
    return null
  }
  if (booking.deleteAt !== null) {
    return booking
  }
  const deletedAt = Math.floor(Date.now() / 1000)
  return updateBooking(db, { ...booking, deleteAt: deletedAt })
}

export async function getActiveBookingByConversationId(
  db: D1Database,
  conversationId: number,
): Promise<Booking | null> {
  const result = await db
    .prepare(
      `SELECT booking.*
       FROM conversations conversation
       JOIN customer_contact_methods contact
         ON contact.id = conversation.contact_method_id
       JOIN bookings booking
         ON booking.customer_id = contact.customer_id
       WHERE conversation.id = ?
         AND booking.cancelled_at IS NULL
         AND booking.delete_at IS NULL
       ORDER BY booking.start_time DESC, booking.id DESC
       LIMIT 1`,
    )
    .bind(conversationId)
    .first()
  if (result === null) {
    return null
  }
  return parseBookingRow(result)
}

export async function rescheduleBooking(
  db: D1Database,
  bookingId: number,
  input: {
    startDatetime: Date
    endDatetime: Date
    workerIds: number[]
    messageId?: number
  },
): Promise<Booking | null> {
  return withBookingLock(db, (lease) =>
    rescheduleBookingWithLock(db, bookingId, { ...input, lease }),
  )
}

export async function rescheduleBookingWithLock(
  db: D1Database,
  bookingId: number,
  params: {
    startDatetime: Date
    endDatetime: Date
    workerIds: number[]
    messageId?: number
    lease: BookingLockLease
    nowMs?: number
  },
): Promise<Booking | null> {
  const nowMs = params.nowMs ?? Date.now()
  const booking = await getBookingById(db, bookingId)
  if (booking === null) {
    return null
  }
  const result = await db
    .prepare(
      `UPDATE bookings
       SET worker_ids = ?,
           start_time = ?,
           end_time = ?,
           rescheduled_at = ?,
           rescheduled_by_message_id = ?
       WHERE id = ?
         AND EXISTS (
           SELECT 1
           FROM booking_lock
           WHERE booking_lock.id = 1
             AND booking_lock.owner = ?
             AND booking_lock.fencing_token = ?
             AND booking_lock.expires_at_ms > ?
         )
       RETURNING *`,
    )
    .bind(
      JSON.stringify(params.workerIds),
      Math.floor(params.startDatetime.getTime() / 1000),
      Math.floor(params.endDatetime.getTime() / 1000),
      Math.floor(nowMs / 1000),
      params.messageId ?? null,
      bookingId,
      params.lease.owner,
      params.lease.fencingToken,
      nowMs,
    )
    .first()
  if (result === null) {
    throw new BookingLockLostError()
  }
  return parseBookingRow(result)
}

export async function cancelBooking(
  db: D1Database,
  bookingId: number,
  messageId?: number,
): Promise<Booking | null> {
  const booking = await getBookingById(db, bookingId)
  if (booking === null) {
    return null
  }
  if (booking.cancelledAt !== null) {
    return booking
  }
  return updateBooking(db, {
    ...booking,
    cancelledAt: Math.floor(Date.now() / 1000),
    cancelledByMessageId: messageId ?? booking.cancelledByMessageId,
  })
}
