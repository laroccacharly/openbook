import { cancelBooking, getBookingByCancelledByMessageId } from "../db/bookings"
import { getActiveBooking } from "./active-booking"
import type { PipelineContext } from "./context"

export type CancelOutcome = "cancelled" | "no_booking"

export async function cancelActiveBooking(
  ctx: PipelineContext,
): Promise<CancelOutcome> {
  const alreadyCancelled = await getBookingByCancelledByMessageId(
    ctx.db,
    ctx.messageId,
  )
  if (alreadyCancelled !== null) {
    return "cancelled"
  }

  const booking = await getActiveBooking(ctx)
  if (booking === null) {
    return "no_booking"
  }
  await cancelBooking(ctx.db, booking.id, ctx.messageId)
  return "cancelled"
}
