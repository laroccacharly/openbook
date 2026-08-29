import type { PreferredDatetimes } from "../types/llm-task-results"

/** Preferred datetime with a stated clock time. */
export type PreferredDatetime = { date: string; time: string }

/** Preferred datetimes that include a clock time, in extraction order. */
export function preferredDatetimesWithTime(
  datetimes: PreferredDatetimes,
): PreferredDatetime[] {
  return datetimes.preferred_datetimes.flatMap((datetime) => {
    if (datetime.time === null) {
      return []
    }
    return [{ date: datetime.date, time: datetime.time }]
  })
}
