import { withBookingLock } from "../db/booking-lock"
import { rescheduleBookingWithLock } from "../db/bookings"
import { getMessageById } from "../db/messages"
import { findFirstAvailablePreference } from "../scheduler"
import { type Booking, bookingDurationMinutes } from "../types/booking"
import type { Message } from "../types/message"
import type { ResolvedSchedulingPreference } from "../types/scheduler"
import { getActiveBooking } from "./active-booking"
import type { PipelineContext } from "./context"
import type { PreferredDatetimesDetails } from "./extract-booking-details"
import { findNextAvailable } from "./find-next-available"

export type RescheduleActionResult =
  | { status: "no_booking"; proposedDatetime: null }
  | {
      status: "not_rescheduled"
      schedulingStatus: "needs_preference"
      proposedDatetime: Date
    }
  | {
      status: "not_rescheduled"
      schedulingStatus: "requested_time_unavailable"
      proposedDatetime: Date
    }
  | {
      status: "not_rescheduled"
      schedulingStatus: "confirmation_required"
      proposedDatetime: Date
    }
  | { status: "rescheduled"; startDatetime: Date; proposedDatetime: null }

function isMessageNewerThan(candidate: Message, other: Message): boolean {
  if (candidate.createdAt !== other.createdAt) {
    return candidate.createdAt > other.createdAt
  }
  return candidate.id > other.id
}

async function wasSupersededByReschedule(
  ctx: PipelineContext,
  booking: Booking,
): Promise<boolean> {
  if (booking.rescheduledByMessageId === null) {
    return false
  }
  const currentMessage = await getMessageById(ctx.db, ctx.messageId)
  const priorMessage = await getMessageById(
    ctx.db,
    booking.rescheduledByMessageId,
  )
  if (currentMessage === null || priorMessage === null) {
    return false
  }
  return isMessageNewerThan(priorMessage, currentMessage)
}

async function resolveUnscheduledPreference(
  ctx: PipelineContext,
  booking: Booking,
  preference: ResolvedSchedulingPreference | null,
): Promise<RescheduleActionResult> {
  if (preference === null) {
    return {
      status: "not_rescheduled",
      schedulingStatus: "requested_time_unavailable",
      proposedDatetime: await findNextAvailable(
        ctx,
        bookingDurationMinutes(booking),
        booking.workerIds.length,
      ),
    }
  }
  return {
    status: "not_rescheduled",
    schedulingStatus: "confirmation_required",
    proposedDatetime: preference.slot.startDatetime,
  }
}

export async function handleRescheduleAction(
  ctx: PipelineContext,
  preferredDatetimes: PreferredDatetimesDetails,
): Promise<RescheduleActionResult> {
  const preferences = preferredDatetimes.preferred_datetimes
  if (preferences.length === 0) {
    const booking = await getActiveBooking(ctx)
    if (booking === null) {
      return { status: "no_booking", proposedDatetime: null }
    }
    return {
      status: "not_rescheduled",
      schedulingStatus: "needs_preference",
      proposedDatetime: await findNextAvailable(
        ctx,
        bookingDurationMinutes(booking),
        booking.workerIds.length,
      ),
    }
  }

  return withBookingLock(ctx.db, async (lease) => {
    const booking = await getActiveBooking(ctx)
    if (booking === null) {
      return { status: "no_booking", proposedDatetime: null }
    }

    if (
      booking.rescheduledByMessageId === ctx.messageId ||
      (await wasSupersededByReschedule(ctx, booking))
    ) {
      return {
        status: "rescheduled",
        startDatetime: booking.startDatetime,
        proposedDatetime: null,
      }
    }

    const durationMinutes = bookingDurationMinutes(booking)
    const availablePreference = await findFirstAvailablePreference(
      { db: ctx.db, clock: ctx.clock },
      {
        durationMinutes,
        workerCount: booking.workerIds.length,
        preferences,
      },
    )
    if (
      availablePreference === null ||
      availablePreference.basis === "first_on_date"
    ) {
      return resolveUnscheduledPreference(ctx, booking, availablePreference)
    }

    const availableSlot = availablePreference.slot
    await rescheduleBookingWithLock(ctx.db, booking.id, {
      startDatetime: availableSlot.startDatetime,
      endDatetime: availableSlot.endDatetime,
      workerIds: availableSlot.workerIds,
      messageId: ctx.messageId,
      lease,
    })
    return {
      status: "rescheduled",
      startDatetime: availableSlot.startDatetime,
      proposedDatetime: null,
    }
  })
}
