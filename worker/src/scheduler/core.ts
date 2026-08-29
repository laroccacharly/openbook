import { getBookings } from "../db/bookings"
import { getConfiguration } from "../db/configuration"
import { isHoliday } from "../db/holidays"
import { getWorkerTimeOffsOverlapping } from "../db/timeoff"
import { getWorkers } from "../db/workers"
import { businessLocalParts, timeToMinutes } from "../time"
import type { SchedulerContext } from "../types/scheduler"
import type { Worker } from "../types/worker"

type AvailabilityRange = {
  startDatetime: Date
  endDatetime?: Date
}

function rangesOverlap(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): boolean {
  return leftStart < rightEnd && leftEnd > rightStart
}

function localDateString(datetime: Date, timezone: string): string {
  const { year, month, day } = businessLocalParts(datetime, timezone)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function localDateAtOffset(
  datetime: Date,
  timezone: string,
  offset: number,
): string {
  const local = businessLocalParts(datetime, timezone)
  const date = new Date(
    Date.UTC(local.year, local.month - 1, local.day + offset),
  )
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function isWithinWeeklySchedule(
  worker: Worker,
  startDatetime: Date,
  endDatetime: Date,
  timezone: string,
): boolean {
  const start = businessLocalParts(startDatetime, timezone)
  const end = businessLocalParts(endDatetime, timezone)

  if (
    start.year !== end.year ||
    start.month !== end.month ||
    start.day !== end.day
  ) {
    return false
  }
  if (!worker.schedule.weekdays.includes(start.weekday)) {
    return false
  }

  const startMinutes = start.hour * 60 + start.minute
  const endMinutes = end.hour * 60 + end.minute
  return (
    startMinutes >= timeToMinutes(worker.schedule.startTime) &&
    endMinutes <= timeToMinutes(worker.schedule.endTime)
  )
}

export function isSameLocalDay(
  left: Date,
  right: Date,
  timezone: string,
): boolean {
  const a = businessLocalParts(left, timezone)
  const b = businessLocalParts(right, timezone)
  return a.year === b.year && a.month === b.month && a.day === b.day
}

export type SchedulerCore = {
  allowSameDayBookings: boolean
  horizonDays: number
  timezone: string
  workers: Worker[]
  findAvailableWorkers(
    startDatetime: Date,
    durationMinutes: number,
    workerCount: number,
  ): Promise<number[] | null>
  getConflictEndTimes(): Date[]
}

export async function createSchedulerCore(
  context: SchedulerContext,
  range: AvailabilityRange,
): Promise<SchedulerCore> {
  const configuration = await getConfiguration(context.db)
  const rangeEnd =
    range.endDatetime ??
    new Date(
      range.startDatetime.getTime() +
        (configuration.horizonDays + 2) * 24 * 60 * 60_000,
    )
  const [workers, bookings, timeOffs] = await Promise.all([
    getWorkers(context.db),
    getBookings(context.db),
    getWorkerTimeOffsOverlapping(context.db, range.startDatetime, rangeEnd),
  ])

  const workerHasConflict = (
    workerId: number,
    startDatetime: Date,
    endDatetime: Date,
  ): boolean => {
    const onTimeOff = timeOffs.some(
      (timeOff) =>
        timeOff.workerId === workerId &&
        rangesOverlap(
          startDatetime,
          endDatetime,
          timeOff.startDatetime,
          timeOff.endDatetime,
        ),
    )
    if (onTimeOff) {
      return true
    }

    return bookings.some((booking) => {
      if (!booking.workerIds.includes(workerId)) {
        return false
      }
      const bufferedEnd = new Date(
        booking.endDatetime.getTime() +
          configuration.bookingBufferMinutes * 60_000,
      )
      return rangesOverlap(
        startDatetime,
        endDatetime,
        booking.startDatetime,
        bufferedEnd,
      )
    })
  }

  return {
    allowSameDayBookings: configuration.allowSameDayBookings,
    horizonDays: configuration.horizonDays,
    timezone: configuration.timezone,
    workers,
    async findAvailableWorkers(startDatetime, durationMinutes, workerCount) {
      const endDatetime = new Date(
        startDatetime.getTime() + durationMinutes * 60_000,
      )
      const now = context.clock.now()
      const lastSearchOffset = configuration.allowSameDayBookings
        ? configuration.horizonDays - 1
        : configuration.horizonDays
      const latestLocalDate = localDateAtOffset(
        now,
        configuration.timezone,
        lastSearchOffset,
      )
      const requestedLocalDate = localDateString(
        startDatetime,
        configuration.timezone,
      )
      if (
        startDatetime <= now ||
        requestedLocalDate > latestLocalDate ||
        (!configuration.allowSameDayBookings &&
          isSameLocalDay(startDatetime, now, configuration.timezone))
      ) {
        return null
      }
      if (await isHoliday(context.db, requestedLocalDate)) {
        return null
      }

      const availableWorkerIds = workers
        .filter(
          (worker) =>
            isWithinWeeklySchedule(
              worker,
              startDatetime,
              endDatetime,
              configuration.timezone,
            ) && !workerHasConflict(worker.id, startDatetime, endDatetime),
        )
        .slice(0, workerCount)
        .map((worker) => worker.id)

      return availableWorkerIds.length === workerCount
        ? availableWorkerIds
        : null
    },
    getConflictEndTimes() {
      const conflictEndTimes: Date[] = []
      for (const booking of bookings) {
        conflictEndTimes.push(
          new Date(
            booking.endDatetime.getTime() +
              configuration.bookingBufferMinutes * 60_000,
          ),
        )
      }
      for (const timeOff of timeOffs) {
        conflictEndTimes.push(timeOff.endDatetime)
      }
      return conflictEndTimes
    },
  }
}
