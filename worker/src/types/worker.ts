import { z } from "zod"
import { WeeklyScheduleSchema } from "./weekly-schedule"

export const WorkerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  weeklyScheduleId: z.number().int().positive(),
  account: z.object({ email: z.email() }).nullable(),
  schedule: WeeklyScheduleSchema,
})

export type Worker = z.infer<typeof WorkerSchema>

export const WorkerCreateSchema = z.object({
  name: z.string().min(1),
  weeklyScheduleId: z.number().int().positive(),
})

export type WorkerCreate = z.infer<typeof WorkerCreateSchema>

export const WorkerDetailsRowSchema = z.object({
  worker_id: z.number().int().positive(),
  worker_name: z.string(),
  weekly_schedule_id: z.number().int().positive(),
  schedule_name: z.string(),
  monday: z.number().int(),
  tuesday: z.number().int(),
  wednesday: z.number().int(),
  thursday: z.number().int(),
  friday: z.number().int(),
  saturday: z.number().int(),
  sunday: z.number().int(),
  start_minutes: z.number().int(),
  end_minutes: z.number().int(),
  account_email: z.string().nullable(),
})

export type WorkerDetailsRow = z.infer<typeof WorkerDetailsRowSchema>
