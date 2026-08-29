import { z } from "zod"

export const WorkerTimeOffRowSchema = z.object({
  id: z.number().int(),
  worker_id: z.number().int(),
  start_time: z.number().int(),
  end_time: z.number().int(),
  created_at: z.number().int(),
})

export type WorkerTimeOffRow = z.infer<typeof WorkerTimeOffRowSchema>

const DateOnlySchema = z.object({
  workerId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const RangeSchema = z
  .object({
    workerId: z.number().int().positive(),
    startDatetime: z.date(),
    endDatetime: z.date(),
  })
  .refine(({ startDatetime, endDatetime }) => endDatetime > startDatetime, {
    message: "endDatetime must be after startDatetime",
    path: ["endDatetime"],
  })

export const WorkerTimeOffCreateSchema = z.union([DateOnlySchema, RangeSchema])

export type WorkerTimeOffCreateInput = z.input<typeof WorkerTimeOffCreateSchema>
export type WorkerTimeOffCreate = z.infer<typeof WorkerTimeOffCreateSchema>

const isoDatetimeString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid datetime",
  })

/** JSON body for POST /workers/:id/timeoff — date or ISO range. */
export const CreateWorkerTimeOffBodySchema = z.union([
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z
    .object({
      startDatetime: isoDatetimeString,
      endDatetime: isoDatetimeString,
    })
    .refine(
      ({ startDatetime, endDatetime }) =>
        Date.parse(endDatetime) > Date.parse(startDatetime),
      {
        message: "endDatetime must be after startDatetime",
        path: ["endDatetime"],
      },
    ),
])

export type CreateWorkerTimeOffBodyInput = z.input<
  typeof CreateWorkerTimeOffBodySchema
>

export const WorkerTimeOffSchema = z.object({
  id: z.number().int().positive(),
  workerId: z.number().int().positive(),
  startDatetime: z.date(),
  endDatetime: z.date(),
  createdAt: z.number().int(),
})

export type WorkerTimeOff = z.infer<typeof WorkerTimeOffSchema>

export const WorkerTimeOffUpdateSchema = z
  .object({
    id: z.number().int().positive(),
    workerId: z.number().int().positive(),
    startDatetime: z.date(),
    endDatetime: z.date(),
  })
  .refine(({ startDatetime, endDatetime }) => endDatetime > startDatetime, {
    message: "endDatetime must be after startDatetime",
    path: ["endDatetime"],
  })

export type WorkerTimeOffUpdate = z.infer<typeof WorkerTimeOffUpdateSchema>

/** Expand YYYY-MM-DD into a UTC full-day window [date 00:00, next day 00:00). */
export function dateToFullDayRange(date: string): {
  startDatetime: Date
  endDatetime: Date
} {
  const startDatetime = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(startDatetime.getTime())) {
    throw new Error(`Invalid date: ${date}`)
  }
  const endDatetime = new Date(startDatetime)
  endDatetime.setUTCDate(endDatetime.getUTCDate() + 1)
  return { startDatetime, endDatetime }
}

const NormalizedTimeOffRangeSchema = CreateWorkerTimeOffBodySchema.transform(
  (body) => {
    if ("date" in body) {
      return dateToFullDayRange(body.date)
    }
    return {
      startDatetime: new Date(body.startDatetime),
      endDatetime: new Date(body.endDatetime),
    }
  },
)

export type NormalizedTimeOffRange = z.infer<
  typeof NormalizedTimeOffRangeSchema
>

/** Normalize a JSON timeoff body to an explicit UTC range. */
export function normalizeTimeOffBody(
  body: CreateWorkerTimeOffBodyInput,
): NormalizedTimeOffRange {
  return NormalizedTimeOffRangeSchema.parse(body)
}

export function normalizeTimeOffCreate(input: WorkerTimeOffCreate): {
  workerId: number
  startDatetime: Date
  endDatetime: Date
} {
  if ("date" in input) {
    return {
      workerId: input.workerId,
      ...dateToFullDayRange(input.date),
    }
  }
  return {
    workerId: input.workerId,
    startDatetime: input.startDatetime,
    endDatetime: input.endDatetime,
  }
}

export function timeOffFromRow(row: WorkerTimeOffRow): WorkerTimeOff {
  return WorkerTimeOffSchema.parse({
    id: row.id,
    workerId: row.worker_id,
    startDatetime: new Date(row.start_time * 1000),
    endDatetime: new Date(row.end_time * 1000),
    createdAt: row.created_at,
  })
}
