import type { D1Database } from "@cloudflare/workers-types"
import { listMessageResponsesByMessageIds } from "../db/message-responses"
import { getConversationMessagesFromMessage } from "../db/messages"
import type { ConversationTurn } from "../types/conversation"
import type { Message } from "../types/message"

/**
 * A conversation is derived from conversation_id, bounded at the target
 * message. This keeps later inbound messages out of retries and guarantees that
 * the target message is the last turn the model is asked to act on.
 */
export async function loadConversation(
  db: D1Database,
  target: Message,
): Promise<ConversationTurn[]> {
  const messages = await getConversationMessagesFromMessage(db, target)
  const priorMessageIds = messages
    .filter((message) => message.id !== target.id)
    .map((message) => message.id)
  const responses = await listMessageResponsesByMessageIds(db, priorMessageIds)
  const responseByMessageId = new Map(
    responses.map((response) => [response.messageId, response]),
  )

  const turns: ConversationTurn[] = []
  for (const message of messages) {
    turns.push({
      role: "customer",
      body: message.message,
      createdAt: message.createdAt,
    })
    const response = responseByMessageId.get(message.id)
    if (response !== undefined) {
      turns.push({
        role: "business",
        body: response.body,
        createdAt: response.createdAt,
      })
    }
  }
  return turns
}
