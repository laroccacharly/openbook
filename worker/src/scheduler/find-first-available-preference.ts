import {
  type FindFirstAvailablePreferenceRequest,
  type ResolvedSchedulingPreference,
  type SchedulerContext,
  FindFirstAvailablePreferenceRequestSchema,
} from "../types/scheduler"
import { createSchedulerCore } from "./core"
import { findAvailableSlotForPreference } from "./find-available-slot-for-preference"

export async function findFirstAvailablePreference(
  context: SchedulerContext,
  request: FindFirstAvailablePreferenceRequest,
): Promise<ResolvedSchedulingPreference | null> {
  const { durationMinutes, workerCount, preferences } =
    FindFirstAvailablePreferenceRequestSchema.parse(request)
  const scheduler = await createSchedulerCore(context, {
    startDatetime: context.clock.now(),
  })

  for (const preference of preferences) {
    const slot = await findAvailableSlotForPreference(
      scheduler,
      preference,
      durationMinutes,
      workerCount,
    )
    if (slot !== null) {
      return {
        slot,
        basis: preference.time === null ? "first_on_date" : "exact_time",
      }
    }
  }

  return null
}
