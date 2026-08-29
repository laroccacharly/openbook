import { businessLocalParts } from "../time"
import {
  type FindNextAvailableSlotRequest,
  type FindNextAvailableSlotResult,
  type SchedulerContext,
  FindNextAvailableSlotRequestSchema,
  FindNextAvailableSlotResultSchema,
} from "../types/scheduler"
import { candidateStartDatetimesForDate } from "./candidate-start-datetimes"
import { createSchedulerCore } from "./core"

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function localDateAtOffset(
  now: Date,
  timezone: string,
  offset: number,
): { date: string; weekday: number } {
  const local = businessLocalParts(now, timezone)
  const date = new Date(
    Date.UTC(local.year, local.month - 1, local.day + offset),
  )
  return {
    date: `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    weekday: date.getUTCDay(),
  }
}

async function findSlotForDate(params: {
  scheduler: Awaited<ReturnType<typeof createSchedulerCore>>
  date: string
  now: Date
  durationMinutes: number
  workerCount: number
}): Promise<FindNextAvailableSlotResult | null> {
  const candidateStartDatetimes = candidateStartDatetimesForDate(
    params.scheduler,
    params.date,
  )
  for (const startDatetime of candidateStartDatetimes) {
    if (startDatetime.getTime() <= params.now.getTime()) continue

    const workerIds = await params.scheduler.findAvailableWorkers(
      startDatetime,
      params.durationMinutes,
      params.workerCount,
    )
    if (workerIds === null) continue

    return FindNextAvailableSlotResultSchema.parse({
      success: true,
      startDatetime,
      endDatetime: new Date(
        startDatetime.getTime() + params.durationMinutes * 60_000,
      ),
      workerIds,
    })
  }
  return null
}

export async function findNextAvailableSlot(
  context: SchedulerContext,
  request: FindNextAvailableSlotRequest = {},
): Promise<FindNextAvailableSlotResult> {
  const { durationMinutes, workerCount } =
    FindNextAvailableSlotRequestSchema.parse(request)
  const now = context.clock.now()
  const scheduler = await createSchedulerCore(context, {
    startDatetime: now,
  })
  if (scheduler.workers.length < workerCount) {
    return FindNextAvailableSlotResultSchema.parse({
      success: false,
      message: `Not enough workers (${scheduler.workers.length} of ${workerCount})`,
    })
  }

  const firstOffset = scheduler.allowSameDayBookings ? 0 : 1
  for (
    let offset = firstOffset;
    offset < firstOffset + scheduler.horizonDays;
    offset += 1
  ) {
    const { date } = localDateAtOffset(now, scheduler.timezone, offset)
    const slot = await findSlotForDate({
      scheduler,
      date,
      now,
      durationMinutes,
      workerCount,
    })
    if (slot !== null) return slot
  }

  return FindNextAvailableSlotResultSchema.parse({
    success: false,
    message: "No available slot found",
  })
}
