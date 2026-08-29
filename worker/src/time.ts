import { z } from "zod"

export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

export function fixedClock(now: Date): Clock {
  return {
    now: () => new Date(now),
  }
}

export const LocalTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
})

export type LocalTime = z.infer<typeof LocalTimeSchema>

export function timeToMinutes(time: LocalTime): number {
  return time.hour * 60 + time.minute
}

export function minutesToTime(minutes: number): LocalTime {
  return {
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  }
}

export function businessLocalContext(
  now: Date,
  timeZone: string,
): { timezone: string; nowLocal: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(now)

  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type)
    if (part === undefined) {
      throw new Error(`Missing date part: ${type}`)
    }
    return part.value
  }

  return {
    timezone: timeZone,
    nowLocal: `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`,
    weekday: value("weekday"),
  }
}

const WEEKDAY_BY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** Next Friday on/after `now` in the given IANA timezone, as YYYY-MM-DD.  TODO make this generic for any day of the week*/
export function upcomingFridayDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now)

  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type)
    if (part === undefined) {
      throw new Error(`Missing date part: ${type}`)
    }
    return part.value
  }

  const weekdayShort = value("weekday")
  if (!(weekdayShort in WEEKDAY_BY_SHORT)) {
    throw new Error(`Unexpected weekday: ${weekdayShort}`)
  }
  const weekday = WEEKDAY_BY_SHORT[weekdayShort]
  if (weekday === undefined) {
    throw new Error(`Unexpected weekday: ${weekdayShort}`)
  }

  const daysUntilFriday = (5 - weekday + 7) % 7
  const friday = new Date(
    Date.UTC(
      Number(value("year")),
      Number(value("month")) - 1,
      Number(value("day")) + daysUntilFriday,
    ),
  )

  return `${friday.getUTCFullYear()}-${pad2(friday.getUTCMonth() + 1)}-${pad2(friday.getUTCDate())}`
}

function zonedWallClockParts(
  instant: Date,
  timeZone: string,
): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(instant)

  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type)
    if (part === undefined) {
      throw new Error(`Missing date part: ${type}`)
    }
    return part.value
  }

  const weekdayShort = value("weekday")
  if (!(weekdayShort in WEEKDAY_BY_SHORT)) {
    throw new Error(`Unexpected weekday: ${weekdayShort}`)
  }
  const weekday = WEEKDAY_BY_SHORT[weekdayShort]
  if (weekday === undefined) {
    throw new Error(`Unexpected weekday: ${weekdayShort}`)
  }

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday,
  }
}

/** Convert a civil date+time in an IANA timezone to a UTC Date. */
export function businessLocalToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const dateParts = date.split("-").map(Number)
  const timeParts = time.split(":").map(Number)
  if (dateParts.length !== 3 || timeParts.length !== 2) {
    throw new Error(`Invalid local datetime: ${date} ${time}`)
  }
  const [year, month, day] = dateParts
  const [hour, minute] = timeParts
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error(`Invalid local datetime: ${date} ${time}`)
  }

  const desiredAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0)
  let utcMs = desiredAsUtcMs

  // Correct for timezone offset (and DST) by matching wall-clock parts.
  for (let i = 0; i < 3; i += 1) {
    const parts = zonedWallClockParts(new Date(utcMs), timeZone)
    const asLocalMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    utcMs += desiredAsUtcMs - asLocalMs
  }

  return new Date(utcMs)
}

/** Wall-clock date/time parts for an instant in an IANA timezone. */
export function businessLocalParts(
  instant: Date,
  timeZone: string,
): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
} {
  return zonedWallClockParts(instant, timeZone)
}

/** Human-readable local datetime for customer-facing messages. */
export function humanReadableDatetime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(instant)
}
