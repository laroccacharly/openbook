import {
  type AvailableSlot,
  type FindFirstAvailableSlotOnDateRequest,
  type SchedulerContext,
  FindFirstAvailableSlotOnDateRequestSchema,
} from "../types/scheduler"
import { createSchedulerCore } from "./core"
import { findAvailableSlotForPreference } from "./find-available-slot-for-preference"

export async function findFirstAvailableSlotOnDate(
  context: SchedulerContext,
  request: FindFirstAvailableSlotOnDateRequest,
): Promise<AvailableSlot | null> {
  const { date, durationMinutes, workerCount } =
    FindFirstAvailableSlotOnDateRequestSchema.parse(request)
  const scheduler = await createSchedulerCore(context, {
    startDatetime: context.clock.now(),
  })

  return findAvailableSlotForPreference(
    scheduler,
    { date, time: null },
    durationMinutes,
    workerCount,
  )
}
