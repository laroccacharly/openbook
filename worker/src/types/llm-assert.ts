import { z } from "zod"

export const LlmAssertInputSchema = z
  .object({
    prompt: z.string().min(1),
    text: z.string().min(1),
    languageModelId: z.string().min(1).optional(),
  })
  .strict()

export type LlmAssertInput = z.input<typeof LlmAssertInputSchema>

export const LlmAssertResultSchema = z
  .object({
    result: z
      .boolean()
      .describe("Whether the assertion prompt is true for the given text"),
  })
  .required()

export type LlmAssertResult = z.infer<typeof LlmAssertResultSchema>
