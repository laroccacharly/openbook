import { z } from "zod"

export const OpenRouterReasoningEffortSchema = z.enum([
  "max",
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
])

export type OpenRouterReasoningEffort = z.infer<
  typeof OpenRouterReasoningEffortSchema
>
