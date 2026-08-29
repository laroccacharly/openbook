import { z } from "zod"
import { E164PhoneSchema } from "../../types/contact-method"

export const SendSmsInputSchema = z
  .object({
    to: E164PhoneSchema,
    body: z.string().min(1).max(1600),
  })
  .strict()

export type SendSmsInput = z.input<typeof SendSmsInputSchema>

export const SendSmsResultSchema = z
  .object({
    sid: z.string(),
    status: z.string(),
    to: z.string(),
    from: z.string(),
  })
  .strict()

export type SendSmsResult = z.infer<typeof SendSmsResultSchema>
