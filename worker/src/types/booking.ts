import { z } from "zod"
import {
  createPublicBookingId,
  PublicBookingIdSchema,
} from "../public-booking-links"

export const MessageInputSchema = z.object({
  message: z.string().min(1),
  languageModelId: z.string().min(1).optional(),
})

export type MessageInput = z.input<typeof MessageInputSchema>

export const BookingRowSchema = z.object({
  id: z.number().int(),
  public_id: PublicBookingIdSchema,
  worker_ids: z.string(),
  start_time: z.number().int(),
  end_time: z.number().int(),
  description: z.string(),
  email_id: z.string().nullable(),
  customer_id: z.number().int().nullable(),
  address: z.string().nullable(),
  estimated_price: z.number().int().nullable(),
  final_price: z.number().int().nullable(),
  balance_due_enabled_at: z.number().int().nullable(),
  cancelled_at: z.number().int().nullable(),
  rescheduled_at: z.number().int().nullable(),
  delete_at: z.number().int().nullable(),
  created_at: z.number().int(),
  message_id: z.number().int().nullable(),
  cancelled_by_message_id: z.number().int().nullable(),
  rescheduled_by_message_id: z.number().int().nullable(),
})

export type BookingRow = z.infer<typeof BookingRowSchema>

export const BookingCreateSchema = z.object({
  publicId: PublicBookingIdSchema.default(createPublicBookingId),
  workerIds: z.array(z.number().int()),
  startDatetime: z.date(),
  endDatetime: z.date(),
  description: z.string().default(""),
  emailId: z.string().nullable().default(null),
  customerId: z.number().int().nullable().default(null),
  address: z.string().nullable().default(null),
  estimatedPrice: z.number().int().nullable().default(null),
  messageId: z.number().int().nullable().default(null),
})

export type BookingCreateInput = z.input<typeof BookingCreateSchema>
export type BookingCreate = z.infer<typeof BookingCreateSchema>

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid datetime",
  })
  .transform((value) => new Date(value))

export const CreateBookingInputSchema = BookingCreateSchema.omit({
  publicId: true,
  startDatetime: true,
  endDatetime: true,
  messageId: true,
}).extend({
  startDatetime: dateString,
  endDatetime: dateString,
})

export type CreateBookingInput = z.input<typeof CreateBookingInputSchema>
export type CreateBooking = z.output<typeof CreateBookingInputSchema>

// Keep every property required for strict structured-output providers. Nullable
// values represent details that were not present in the request.
export const CreateBookingExtractionSchema = CreateBookingInputSchema.omit({
  startDatetime: true,
  endDatetime: true,
})
  .extend({
    startDatetime: z
      .string()
      .describe("ISO 8601 UTC datetime, e.g. 2026-08-15T14:00:00.000Z"),
    endDatetime: z
      .string()
      .describe("ISO 8601 UTC datetime, e.g. 2026-08-15T16:00:00.000Z"),
  })
  .required()

export const BookingSchema = BookingCreateSchema.extend({
  id: z.number().int(),
  createdAt: z.number().int(),
  finalPrice: z.number().int().nullable(),
  balanceDueEnabledAt: z.number().int().nullable(),
  cancelledAt: z.number().int().nullable(),
  rescheduledAt: z.number().int().nullable(),
  deleteAt: z.number().int().nullable(),
  cancelledByMessageId: z.number().int().nullable(),
  rescheduledByMessageId: z.number().int().nullable(),
})

export type Booking = z.infer<typeof BookingSchema>

export type BookingWriteRow = Omit<
  BookingRow,
  "id" | "created_at" | "final_price" | "balance_due_enabled_at"
>

export function bookingDurationMinutes(
  booking: Pick<BookingCreate, "startDatetime" | "endDatetime">,
): number {
  return Math.round(
    (booking.endDatetime.getTime() - booking.startDatetime.getTime()) / 60_000,
  )
}

function isBooking(booking: BookingCreate | Booking): booking is Booking {
  return "id" in booking
}

export function bookingToRow(
  booking: BookingCreate | Booking,
): BookingWriteRow {
  return {
    public_id: booking.publicId,
    worker_ids: JSON.stringify(booking.workerIds),
    start_time: Math.floor(booking.startDatetime.getTime() / 1000),
    end_time: Math.floor(booking.endDatetime.getTime() / 1000),
    description: booking.description,
    email_id: booking.emailId,
    customer_id: booking.customerId,
    address: booking.address,
    estimated_price: booking.estimatedPrice,
    cancelled_at: isBooking(booking) ? booking.cancelledAt : null,
    rescheduled_at: isBooking(booking) ? booking.rescheduledAt : null,
    delete_at: isBooking(booking) ? booking.deleteAt : null,
    message_id: booking.messageId,
    cancelled_by_message_id: isBooking(booking)
      ? booking.cancelledByMessageId
      : null,
    rescheduled_by_message_id: isBooking(booking)
      ? booking.rescheduledByMessageId
      : null,
  }
}

export function bookingFromRow(row: BookingRow): Booking {
  return BookingSchema.parse({
    id: row.id,
    publicId: row.public_id,
    workerIds: z.array(z.number().int()).parse(JSON.parse(row.worker_ids)),
    startDatetime: new Date(row.start_time * 1000),
    endDatetime: new Date(row.end_time * 1000),
    description: row.description,
    emailId: row.email_id,
    customerId: row.customer_id,
    address: row.address,
    estimatedPrice: row.estimated_price,
    finalPrice: row.final_price,
    balanceDueEnabledAt: row.balance_due_enabled_at,
    cancelledAt: row.cancelled_at,
    rescheduledAt: row.rescheduled_at,
    deleteAt: row.delete_at,
    createdAt: row.created_at,
    messageId: row.message_id,
    cancelledByMessageId: row.cancelled_by_message_id,
    rescheduledByMessageId: row.rescheduled_by_message_id,
  })
}
