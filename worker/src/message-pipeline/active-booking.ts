import { getActiveBookingByConversationId } from "../db/bookings"
import type { Booking } from "../types/booking"
import type { PipelineContext } from "./context"

export async function getActiveBooking(
  ctx: PipelineContext,
): Promise<Booking | null> {
  return getActiveBookingByConversationId(ctx.db, ctx.conversationId)
}
