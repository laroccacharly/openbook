import { withBookingLock } from "../db/booking-lock"
import { createBookingWithLock, getBookingByMessageId } from "../db/bookings"
import { ensureCustomerForConversation } from "../db/customers"
import { findFirstAvailablePreference } from "../scheduler"
import type { ResolvedSchedulingPreference } from "../types/scheduler"
import type { PipelineContext } from "./context"
import type { BookingDetails } from "./extract-booking-details"
import { findNextAvailable } from "./find-next-available"
import {
  type BookingRequirementItem,
  resolveBookingRequirements,
} from "./resolve-booking-requirements"

export type CreateActionResult =
  | { status: "unknown_job"; proposedDatetime: null }
  | {
      status: "address_not_found" | "outside_service_area"
      message: string
      proposedDatetime: null
    }
  | {
      status: "not_booked"
      schedulingStatus: "needs_preference"
      missingRequiredInformation: BookingRequirementItem[]
      proposedDatetime: Date
    }
  | {
      status: "not_booked"
      schedulingStatus: "requested_time_unavailable"
      missingRequiredInformation: BookingRequirementItem[]
      proposedDatetime: Date
    }
  | {
      status: "not_booked"
      schedulingStatus: "confirmation_required"
      missingRequiredInformation: BookingRequirementItem[]
      proposedDatetime: Date
    }
  | {
      status: "not_booked"
      schedulingStatus: "requested_time_available"
      missingRequiredInformation: BookingRequirementItem[]
      startDatetime: Date
      proposedDatetime: null
    }
  | { status: "booked"; startDatetime: Date; proposedDatetime: null }

type KnownJob = NonNullable<BookingDetails["job"]>

async function findFirstAvailablePreferenceGivenBookingDetails(
  ctx: PipelineContext,
  job: KnownJob,
  details: BookingDetails,
): Promise<ResolvedSchedulingPreference | null> {
  return findFirstAvailablePreference(
    { db: ctx.db, clock: ctx.clock },
    {
      durationMinutes: job.duration_minutes,
      workerCount: job.worker_count,
      preferences: details.preferredDatetimes.preferred_datetimes,
    },
  )
}

async function resolveUnbookedPreference(
  ctx: PipelineContext,
  job: KnownJob,
  preference: ResolvedSchedulingPreference | null,
  missingRequiredInformation: BookingRequirementItem[],
): Promise<CreateActionResult> {
  if (preference === null) {
    return {
      status: "not_booked",
      schedulingStatus: "requested_time_unavailable",
      missingRequiredInformation,
      proposedDatetime: await findNextAvailable(
        ctx,
        job.duration_minutes,
        job.worker_count,
      ),
    }
  }
  if (preference.basis === "first_on_date") {
    return {
      status: "not_booked",
      schedulingStatus: "confirmation_required",
      missingRequiredInformation,
      proposedDatetime: preference.slot.startDatetime,
    }
  }
  return {
    status: "not_booked",
    schedulingStatus: "requested_time_available",
    missingRequiredInformation,
    startDatetime: preference.slot.startDatetime,
    proposedDatetime: null,
  }
}

export async function handleCreateAction(
  ctx: PipelineContext,
  details: BookingDetails,
): Promise<CreateActionResult> {
  const job = details.job
  if (job === null) {
    return { status: "unknown_job", proposedDatetime: null }
  }

  const requirements = await resolveBookingRequirements({
    extracted: details.customerInformation,
    addressGeocoder: ctx.addressGeocoder,
    serviceArea: ctx.serviceArea,
  })
  if (
    requirements.status === "address_not_found" ||
    requirements.status === "outside_service_area"
  ) {
    return {
      status: requirements.status,
      message: requirements.message,
      proposedDatetime: null,
    }
  }

  const missingRequiredInformation =
    requirements.status === "needs_information" ? requirements.missing : []
  if (details.preferredDatetimes.preferred_datetimes.length === 0) {
    return {
      status: "not_booked",
      schedulingStatus: "needs_preference",
      missingRequiredInformation,
      proposedDatetime: await findNextAvailable(
        ctx,
        job.duration_minutes,
        job.worker_count,
      ),
    }
  }

  if (requirements.status === "needs_information") {
    const availablePreference =
      await findFirstAvailablePreferenceGivenBookingDetails(ctx, job, details)
    return resolveUnbookedPreference(
      ctx,
      job,
      availablePreference,
      missingRequiredInformation,
    )
  }

  const customer = await ensureCustomerForConversation(
    ctx.db,
    ctx.conversationId,
    requirements.value.customerName,
  )
  return withBookingLock(ctx.db, async (lease) => {
    const existing = await getBookingByMessageId(ctx.db, ctx.messageId)
    if (existing !== null) {
      return {
        status: "booked",
        startDatetime: existing.startDatetime,
        proposedDatetime: null,
      }
    }

    const availablePreference =
      await findFirstAvailablePreferenceGivenBookingDetails(ctx, job, details)
    if (
      availablePreference === null ||
      availablePreference.basis === "first_on_date"
    ) {
      return resolveUnbookedPreference(ctx, job, availablePreference, [])
    }

    const availableSlot = availablePreference.slot
    await createBookingWithLock(
      ctx.db,
      {
        workerIds: availableSlot.workerIds,
        startDatetime: availableSlot.startDatetime,
        endDatetime: availableSlot.endDatetime,
        description: job.description,
        customerId: customer.id,
        address: requirements.value.serviceAddress,
        estimatedPrice: job.estimated_price,
        messageId: ctx.messageId,
      },
      lease,
    )
    return {
      status: "booked",
      startDatetime: availableSlot.startDatetime,
      proposedDatetime: null,
    }
  })
}
