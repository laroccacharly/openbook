import { z } from "zod"

export const HolidayDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const HolidaySchema = z.object({
  id: z.number().int().positive(),
  date: HolidayDateSchema,
})

export type Holiday = z.infer<typeof HolidaySchema>

export const HolidayCreateSchema = HolidaySchema.omit({ id: true })

export type HolidayCreate = z.infer<typeof HolidayCreateSchema>
