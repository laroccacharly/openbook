import { businessLocalToUtc } from "../time"
import type { AvailableSlot, SchedulingPreference } from "../types/scheduler"
import { candidateStartDatetimesForDate } from "./candidate-start-datetimes"
import type { SchedulerCore } from "./core"

export async function findAvailableSlotForPreference(
  scheduler: SchedulerCore,
  preference: SchedulingPreference,
  durationMinutes: number,
  workerCount: number,
): Promise<AvailableSlot | null> {
  const candidateStartDatetimes =
    preference.time === null
      ? candidateStartDatetimesForDate(scheduler, preference.date)
      : [
          businessLocalToUtc(
            preference.date,
            preference.time,
            scheduler.timezone,
          ),
        ]

  for (const startDatetime of candidateStartDatetimes) {
    const workerIds = await scheduler.findAvailableWorkers(
      startDatetime,
      durationMinutes,
      workerCount,
    )
    if (workerIds === null) {
      continue
    }

    return {
      startDatetime,
      endDatetime: new Date(startDatetime.getTime() + durationMinutes * 60_000),
      workerIds,
    }
  }

  return null
}
