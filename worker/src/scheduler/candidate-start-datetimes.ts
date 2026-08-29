import { businessLocalToUtc, timeToMinutes } from "../time"
import type { SchedulerCore } from "./core"
import { isSameLocalDay } from "./core"

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function weekdayForDate(date: string): number {
  const [year, month, day] = date.split("-").map(Number)
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid date: ${date}`)
  }
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function candidateStartDatetimesForDate(
  scheduler: SchedulerCore,
  date: string,
): Date[] {
  const weekday = weekdayForDate(date)
  const scheduleStartDatetimes = scheduler.workers
    .filter((worker) => worker.schedule.weekdays.includes(weekday))
    .map((worker) => worker.schedule.startTime)
    .filter(
      (time, index, times) =>
        times.findIndex(
          (candidate) =>
            candidate.hour === time.hour && candidate.minute === time.minute,
        ) === index,
    )
    .sort((left, right) => timeToMinutes(left) - timeToMinutes(right))
    .map((time) =>
      businessLocalToUtc(
        date,
        `${pad2(time.hour)}:${pad2(time.minute)}`,
        scheduler.timezone,
      ),
    )
  const dateStart = businessLocalToUtc(date, "00:00", scheduler.timezone)
  const conflictEndsOnDate = scheduler
    .getConflictEndTimes()
    .filter((datetime) =>
      isSameLocalDay(datetime, dateStart, scheduler.timezone),
    )

  return [...scheduleStartDatetimes, ...conflictEndsOnDate]
    .filter(
      (datetime, index, datetimes) =>
        datetimes.findIndex(
          (candidate) => candidate.getTime() === datetime.getTime(),
        ) === index,
    )
    .sort((left, right) => left.getTime() - right.getTime())
}
