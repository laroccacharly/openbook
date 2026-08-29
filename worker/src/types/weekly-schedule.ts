import { z } from "zod"
import { LocalTimeSchema, minutesToTime } from "../time"

export const WeeklyScheduleCreateSchema = z
  .object({
    name: z.string().min(1),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1),
    startTime: LocalTimeSchema,
    endTime: LocalTimeSchema,
  })
  .refine(
    ({ startTime, endTime }) =>
      endTime.hour * 60 + endTime.minute >
      startTime.hour * 60 + startTime.minute,
    { message: "endTime must be after startTime", path: ["endTime"] },
  )

export type WeeklyScheduleCreate = z.infer<typeof WeeklyScheduleCreateSchema>

export const WeeklyScheduleSchema = WeeklyScheduleCreateSchema.safeExtend({
  id: z.number().int().positive(),
})

export type WeeklySchedule = z.infer<typeof WeeklyScheduleSchema>

export const WeeklyScheduleRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  monday: z.number().int(),
  tuesday: z.number().int(),
  wednesday: z.number().int(),
  thursday: z.number().int(),
  friday: z.number().int(),
  saturday: z.number().int(),
  sunday: z.number().int(),
  start_minutes: z.number().int(),
  end_minutes: z.number().int(),
})

export type WeeklyScheduleRow = z.infer<typeof WeeklyScheduleRowSchema>

export function weeklyScheduleFromRow(row: WeeklyScheduleRow): WeeklySchedule {
  const weekdayFlags = [
    row.sunday,
    row.monday,
    row.tuesday,
    row.wednesday,
    row.thursday,
    row.friday,
    row.saturday,
  ]
  return WeeklyScheduleSchema.parse({
    id: row.id,
    name: row.name,
    weekdays: weekdayFlags.flatMap((enabled, weekday) =>
      enabled === 1 ? [weekday] : [],
    ),
    startTime: minutesToTime(row.start_minutes),
    endTime: minutesToTime(row.end_minutes),
  })
}
