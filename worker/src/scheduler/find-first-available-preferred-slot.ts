import {
  type AvailableSlot,
  type FindFirstAvailablePreferredSlotRequest,
  type SchedulerContext,
  FindFirstAvailablePreferredSlotRequestSchema,
} from "../types/scheduler"
import { createSchedulerCore } from "./core"
import { findAvailableSlotForPreference } from "./find-available-slot-for-preference"

/**
 * Tries preferred slots in order. The shared core applies all eligibility
 * rules, including past-slot and same-day booking policies.
 */
export async function findFirstAvailablePreferredSlot(
  context: SchedulerContext,
  request: FindFirstAvailablePreferredSlotRequest,
): Promise<AvailableSlot | null> {
  const { durationMinutes, workerCount, preferredSlots } =
    FindFirstAvailablePreferredSlotRequestSchema.parse(request)
  const now = context.clock.now()
  const scheduler = await createSchedulerCore(context, {
    startDatetime: now,
  })

  for (const slot of preferredSlots) {
    const availableSlot = await findAvailableSlotForPreference(
      scheduler,
      slot,
      durationMinutes,
      workerCount,
    )
    if (availableSlot !== null) {
      return availableSlot
    }
  }

  return null
}
