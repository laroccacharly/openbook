import { z } from "zod"
import type { D1Database } from "@cloudflare/workers-types"
import type { Clock } from "../time"

export const FindNextAvailableSlotRequestSchema = z.object({
  durationMinutes: z.number().int().positive().default(60),
  workerCount: z.number().int().positive().default(1),
})

export type FindNextAvailableSlotRequest = z.input<
  typeof FindNextAvailableSlotRequestSchema
>

export const FindFirstAvailableSlotOnDateRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.number().int().positive(),
  workerCount: z.number().int().positive(),
})

export type FindFirstAvailableSlotOnDateRequest = z.infer<
  typeof FindFirstAvailableSlotOnDateRequestSchema
>

export const SchedulingPreferenceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
})

export type SchedulingPreference = z.infer<typeof SchedulingPreferenceSchema>

export const FindFirstAvailablePreferenceRequestSchema = z.object({
  durationMinutes: z.number().int().positive(),
  workerCount: z.number().int().positive(),
  preferences: z.array(SchedulingPreferenceSchema).min(1),
})

export type FindFirstAvailablePreferenceRequest = z.infer<
  typeof FindFirstAvailablePreferenceRequestSchema
>

export const FindAvailableWorkersForSlotRequestSchema = z.object({
  durationMinutes: z.number().int().positive(),
  workerCount: z.number().int().positive(),
  startDatetime: z.date(),
})

export type FindAvailableWorkersForSlotRequest = z.infer<
  typeof FindAvailableWorkersForSlotRequestSchema
>

export const PreferredSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
})

export const FindFirstAvailablePreferredSlotRequestSchema = z.object({
  durationMinutes: z.number().int().positive(),
  workerCount: z.number().int().positive(),
  preferredSlots: z.array(PreferredSlotSchema),
})

export type FindFirstAvailablePreferredSlotRequest = z.infer<
  typeof FindFirstAvailablePreferredSlotRequestSchema
>

export type AvailableSlot = {
  startDatetime: Date
  endDatetime: Date
  workerIds: number[]
}

export type ResolvedSchedulingPreference = {
  slot: AvailableSlot
  basis: "exact_time" | "first_on_date"
}

export const FindNextAvailableSlotResultSchema = z.discriminatedUnion(
  "success",
  [
    z.object({
      success: z.literal(true),
      startDatetime: z.date(),
      endDatetime: z.date(),
      workerIds: z.array(z.number().int().positive()).min(1),
    }),
    z.object({
      success: z.literal(false),
      message: z.string().min(1),
    }),
  ],
)

export type FindNextAvailableSlotResult = z.infer<
  typeof FindNextAvailableSlotResultSchema
>

export type SchedulerContext = {
  db: D1Database
  clock: Clock
}
