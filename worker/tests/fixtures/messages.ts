import type { D1Database } from "@cloudflare/workers-types"
import { createMessage } from "@worker/src/db/messages"
import { resolveInboundConversation } from "@worker/src/message-pipeline/resolve-inbound-conversation"
import {
  type Message,
  type MessageCreateInput,
  MessageCreateSchema,
} from "@worker/src/types/message"

export async function createInboundMessage(
  db: D1Database,
  input: MessageCreateInput,
): Promise<{ message: Message; created: boolean }> {
  const parsed = MessageCreateSchema.parse(input)
  const conversationId = await resolveInboundConversation(db, {
    channel: parsed.channel,
    address: parsed.address,
  })
  return createMessage(db, {
    message: parsed.message,
    externalId: parsed.externalId,
    conversationId,
  })
}
