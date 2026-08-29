import type { D1Database } from "@cloudflare/workers-types"
import { z } from "zod"
import { ContactMethodKeySchema } from "../types/contact-method"

const MessageDeliveryRowSchema = z.object({
  body: z.string().min(1),
  inbound_message: z.string().min(1),
  channel: z.string(),
  address: z.string(),
})

export type MessageDelivery = {
  body: string
  inboundMessage: string
  contactMethod: z.infer<typeof ContactMethodKeySchema>
}

export async function getMessageDelivery(
  db: D1Database,
  messageResponseId: number,
): Promise<MessageDelivery | null> {
  const row = await db
    .prepare(
      `SELECT response.body, message.message AS inbound_message,
              contact.channel, contact.address
       FROM message_responses response
       JOIN messages message ON message.id = response.message_id
       JOIN conversations conversation ON conversation.id = message.conversation_id
       JOIN customer_contact_methods contact
         ON contact.id = conversation.contact_method_id
       WHERE response.id = ?`,
    )
    .bind(messageResponseId)
    .first()
  if (row === null) {
    return null
  }
  const parsed = MessageDeliveryRowSchema.parse(row)
  return {
    body: parsed.body,
    inboundMessage: parsed.inbound_message,
    contactMethod: ContactMethodKeySchema.parse(parsed),
  }
}
