import { z } from "zod"
import { E164PhoneSchema } from "./contact-method"

export const MessageRowSchema = z.object({
  id: z.number().int(),
  message: z.string(),
  external_id: z.string().nullable(),
  conversation_id: z.number().int(),
  created_at: z.number().int(),
})

export type MessageRow = z.infer<typeof MessageRowSchema>

const messageCreateFields = {
  message: z.string().min(1),
  externalId: z.string().min(1).nullable().default(null),
} as const

export const MessageInsertSchema = z.object({
  message: z.string().min(1),
  externalId: z.string().min(1).nullable().default(null),
  conversationId: z.number().int(),
})

export type MessageInsertInput = z.input<typeof MessageInsertSchema>
export type MessageInsert = z.infer<typeof MessageInsertSchema>

export const MessageCreateSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("email"),
    address: z.email().transform((value) => value.toLowerCase()),
    ...messageCreateFields,
  }),
  z.object({
    channel: z.literal("sms"),
    address: E164PhoneSchema,
    ...messageCreateFields,
  }),
])

export type MessageCreateInput = z.input<typeof MessageCreateSchema>
export type MessageCreate = z.infer<typeof MessageCreateSchema>

const nowString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid datetime",
  })
  .transform((value) => new Date(value))

const fromMessageFields = {
  message: z.string().min(1),
  externalId: z.string().min(1).nullable().optional(),
  languageModelId: z.string().min(1).optional(),
  now: nowString.optional(),
} as const

export const FromMessageInputSchema = z.discriminatedUnion("channel", [
  z
    .object({
      channel: z.literal("email"),
      address: z.email().transform((value) => value.toLowerCase()),
      ...fromMessageFields,
    })
    .strict(),
  z
    .object({
      channel: z.literal("sms"),
      address: E164PhoneSchema,
      ...fromMessageFields,
    })
    .strict(),
])

export type FromMessageInput = z.input<typeof FromMessageInputSchema>
export type FromMessage = z.output<typeof FromMessageInputSchema>

export const MessageSchema = z.object({
  id: z.number().int(),
  message: z.string().min(1),
  externalId: z.string().min(1).nullable(),
  conversationId: z.number().int(),
  createdAt: z.number().int(),
})

export type Message = z.infer<typeof MessageSchema>

export function messageFromRow(row: MessageRow): Message {
  return MessageSchema.parse({
    id: row.id,
    message: row.message,
    externalId: row.external_id,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
  })
}
