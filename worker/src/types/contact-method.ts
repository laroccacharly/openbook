import { z } from "zod"
import { MessageChannelSchema } from "./message-channel"

/** E.164: + then country code and subscriber number (max 15 digits total). */
export const E164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "must be E.164 phone number")

export const ContactMethodKeySchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("email"),
    address: z.email().transform((value) => value.toLowerCase()),
  }),
  z.object({
    channel: z.literal("sms"),
    address: E164PhoneSchema,
  }),
])

export type ContactMethodKey = z.infer<typeof ContactMethodKeySchema>

export const ContactMethodChannelSchema = MessageChannelSchema

export type ContactMethodChannel = z.infer<typeof ContactMethodChannelSchema>

/** Routing identity, with lifecycle links populated by the first inbound message. */
export type ContactMethodSummary = {
  id: number
  customerId: number | null
  customerName: string | null
  conversationId: number | null
  channel: ContactMethodChannel
  address: string
  createdAt: number
  conversationUpdatedAt: number | null
}
