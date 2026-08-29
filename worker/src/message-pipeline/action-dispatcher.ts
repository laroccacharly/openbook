import type { BookingAction } from "../types/llm-task-results"
import {
  handleCreateAction,
  type CreateActionResult,
} from "./handle-create-action"
import {
  handleRescheduleAction,
  type RescheduleActionResult,
} from "./handle-reschedule-action"
import { cancelActiveBooking, type CancelOutcome } from "./cancel-booking"
import type { PipelineContext } from "./context"
import {
  extractBookingDetails,
  extractPreferredDatetimes,
  type BookingDetails,
  type PreferredDatetimesDetails,
} from "./extract-booking-details"

export type ActionOutcome =
  | ({
      booking_action: "create"
      bookingDetails: BookingDetails
    } & CreateActionResult)
  | ({
      booking_action: "reschedule"
      preferredDatetimes: PreferredDatetimesDetails
    } & RescheduleActionResult)
  | {
      booking_action: "cancel"
      status: CancelOutcome
      proposedDatetime: null
    }
  | {
      booking_action: null
      status: "no_action"
      proposedDatetime: null
    }

export async function dispatchAction(
  ctx: PipelineContext,
  action: BookingAction | null,
): Promise<ActionOutcome> {
  switch (action) {
    case "create": {
      await ctx.setStage("extract_booking_details")
      const bookingDetails = await extractBookingDetails(ctx)
      await ctx.setStage("handle_create_action")
      const result = await handleCreateAction(ctx, bookingDetails)
      return {
        booking_action: action,
        bookingDetails,
        ...result,
      }
    }
    case "reschedule": {
      await ctx.setStage("extract_preferred_datetimes")
      const preferredDatetimes = await extractPreferredDatetimes(ctx)
      await ctx.setStage("handle_reschedule_action")
      const result = await handleRescheduleAction(ctx, preferredDatetimes)
      return {
        booking_action: action,
        preferredDatetimes,
        ...result,
      }
    }
    case "cancel": {
      await ctx.setStage("cancel_booking")
      const status = await cancelActiveBooking(ctx)
      return { booking_action: action, status, proposedDatetime: null }
    }
    case null:
      return {
        booking_action: action,
        status: "no_action",
        proposedDatetime: null,
      }
    default: {
      const exhaustive: never = action
      throw new Error(`Unhandled booking action: ${String(exhaustive)}`)
    }
  }
}
