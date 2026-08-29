import { z } from "zod"

export const CatalogJobInputSchema = z.object({
  name: z.string().trim().min(1),
  estimatedPriceCents: z.number().int().positive(),
  durationMinutes: z.number().int().positive(),
  workerCount: z.number().int().positive(),
})

export const CatalogJobSchema = CatalogJobInputSchema.extend({
  id: z.number().int().positive(),
})

export const CatalogJobPatchSchema = CatalogJobInputSchema.partial().strict()

export type CatalogJob = z.infer<typeof CatalogJobSchema>
export type CatalogJobInput = z.infer<typeof CatalogJobInputSchema>
export type CatalogJobPatch = z.infer<typeof CatalogJobPatchSchema>

export const CatalogJobRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  estimated_price_cents: z.number().int().positive(),
  duration_minutes: z.number().int().positive(),
  worker_count: z.number().int().positive(),
})
