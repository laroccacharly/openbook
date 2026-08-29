import { z } from "zod"

export const MessageChannelSchema = z.enum(["email", "sms"])

export type MessageChannel = z.infer<typeof MessageChannelSchema>
