import { z } from "zod"

export const SendEmailInputSchema = z
  .object({
    to: z.email(),
    subject: z.string().min(1).max(998),
    text: z.string().min(1),
    html: z.string().min(1).optional(),
  })
  .strict()

export type SendEmailInput = z.input<typeof SendEmailInputSchema>

export const SendEmailResultSchema = z
  .object({
    messageId: z.string(),
    to: z.string(),
    from: z.string(),
    subject: z.string(),
  })
  .strict()

export type SendEmailResult = z.infer<typeof SendEmailResultSchema>
